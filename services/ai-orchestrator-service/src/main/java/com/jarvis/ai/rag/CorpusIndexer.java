package com.jarvis.ai.rag;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Embeds corpus/text into Qdrant. Runs only when {@code jarvis.rag.index-on-start} is set, because
 * re-embedding a few hundred chunks on every restart would be pure waste:
 *
 * <pre>mvn -pl ai-orchestrator-service spring-boot:run -Dspring-boot.run.arguments=--jarvis.rag.index-on-start=true</pre>
 *
 * <p>Chunk ids are derived from the document id and the chunk's position, so re-running upserts in
 * place instead of piling up a second copy of the corpus.
 */
@Component
public class CorpusIndexer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CorpusIndexer.class);
    /** Ollama embeds a batch in one call; small batches keep progress visible and requests sane. */
    private static final int BATCH = 25;

    private final VectorStore vectorStore;
    private final RagProperties properties;
    private final ObjectMapper mapper = new ObjectMapper();

    public CorpusIndexer(VectorStore vectorStore, RagProperties properties) {
        this.vectorStore = vectorStore;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!properties.isIndexOnStart()) {
            return;
        }
        index();
    }

    public int index() throws Exception {
        Path corpus = Path.of(properties.getCorpusDir()).toAbsolutePath().normalize();
        Path manifestPath = corpus.resolve("manifest.json");
        if (!Files.exists(manifestPath)) {
            log.error("No corpus manifest at {} -- nothing indexed", manifestPath);
            return 0;
        }
        CorpusManifest manifest = mapper.readValue(manifestPath.toFile(), CorpusManifest.class);
        log.info("Indexing corpus from {} into '{}'", corpus, manifest.collection());

        int total = 0;
        for (CorpusManifest.Document doc : manifest.documents()) {
            Path textFile = corpus.resolve("text").resolve(doc.textFile());
            if (!Files.exists(textFile)) {
                log.warn("  {} -- no extracted text at {}, skipped", doc.id(), textFile);
                continue;
            }
            String raw = Files.readString(textFile, StandardCharsets.UTF_8);
            List<Chunker.Chunk> chunks = Chunker.chunk(raw, doc);
            List<Document> documents = new ArrayList<>(chunks.size());
            for (int i = 0; i < chunks.size(); i++) {
                documents.add(toDocument(doc, chunks.get(i), i));
            }
            for (int start = 0; start < documents.size(); start += BATCH) {
                vectorStore.add(documents.subList(start, Math.min(start + BATCH, documents.size())));
            }
            long individual = chunks.stream().filter(c -> "individual".equals(c.audience())).count();
            log.info("  {} -- {} chunks ({} individual, {} business) via {} strategy",
                doc.id(), chunks.size(), individual, chunks.size() - individual, doc.strategy());
            total += chunks.size();
        }
        log.info("Corpus indexed: {} chunks", total);
        return total;
    }

    private Document toDocument(CorpusManifest.Document doc, Chunker.Chunk chunk, int position) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("source", doc.id());
        metadata.put("title", doc.title());
        metadata.put("publisher", doc.publisher());
        metadata.put("url", doc.url());
        metadata.put("country", doc.country());
        metadata.put("doc_type", doc.docType());
        metadata.put("audience", chunk.audience());
        metadata.put("position", position);
        if (chunk.section() != null) {
            metadata.put("section", chunk.section());
        }
        // Tax reliefs change with each Finance Act; without this an answer cannot say how current it is.
        if (doc.asOf() != null) {
            metadata.put("as_of", doc.asOf());
        }
        // Deterministic id: re-indexing replaces a chunk rather than duplicating it.
        String id = UUID.nameUUIDFromBytes((doc.id() + "#" + position).getBytes(StandardCharsets.UTF_8)).toString();
        return new Document(id, chunk.text(), metadata);
    }
}
