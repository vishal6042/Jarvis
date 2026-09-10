package com.jarvis.ai.rag;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * corpus/manifest.json: which documents make up the guidance corpus and what each one needs doing
 * to it. Kept as data rather than code because the differences between these documents are facts
 * about the documents -- which heading style they use, whether their rupee sign survived extraction
 * -- not behaviour worth compiling in.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CorpusManifest(
    String collection,
    String embeddingModel,
    int vectorSize,
    List<Document> documents
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Document(
        String id,
        String title,
        String publisher,
        String url,
        String country,
        String docType,
        String audience,
        String asOf,
        String strategy,
        List<String> fixups,
        String notes
    ) {
        public Document {
            fixups = fixups == null ? List.of() : List.copyOf(fixups);
            audience = audience == null ? "individual" : audience;
            strategy = strategy == null ? "heading" : strategy;
            country = country == null ? "IN" : country;
        }

        /** The file under corpus/text/ holding this document's extracted text. */
        public String textFile() {
            return id + ".txt";
        }
    }
}
