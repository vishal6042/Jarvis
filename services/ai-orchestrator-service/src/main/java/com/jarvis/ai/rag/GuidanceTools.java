package com.jarvis.ai.rag;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Lets the assistant look up published financial guidance -- SEBI, RBI and the Income Tax Department
 * -- to answer the general half of a question.
 *
 * <p>Deliberately a tool rather than a pipeline stage. "What did I spend on food?" needs the user's
 * own figures and nothing else; "is ELSS better than PPF?" needs only guidance; "I have ₹20,000
 * spare, save or invest?" needs both. Leaving the choice to the agent means no query router to keep
 * correct, and it composes with the analytics tools for free.
 */
@Component
public class GuidanceTools {

    private static final Logger log = LoggerFactory.getLogger(GuidanceTools.class);

    private final VectorStore vectorStore;
    private final RagProperties properties;

    public GuidanceTools(VectorStore vectorStore, RagProperties properties) {
        this.vectorStore = vectorStore;
        this.properties = properties;
    }

    @Tool(description = """
        Search official Indian financial guidance (SEBI, RBI, Income Tax Department) for general
        principles, rules and thresholds -- budgeting, saving, investing, risk, loans, credit,
        banking, and tax deductions or slabs. Use it for questions about how money works or what
        the rules are, not for the user's own figures. Returns extracts with their source.""")
    public String searchFinancialGuidance(
        @ToolParam(description = "what to look up, e.g. 'section 80C deduction limit' or 'emergency fund size'")
        String query) {

        if (!properties.isEnabled()) {
            return "Guidance lookup is disabled.";
        }

        FilterExpressionBuilder b = new FilterExpressionBuilder();
        List<Document> hits;
        try {
            hits = vectorStore.similaritySearch(SearchRequest.builder()
                .query(query)
                .topK(properties.getTopK())
                .similarityThreshold(properties.getMinScore())
                // Indian material only, and only what an individual can actually act on -- the tax
                // tables also carry reliefs that only companies and co-operatives may claim.
                .filterExpression(b.and(b.eq("country", "IN"), b.eq("audience", "individual")).build())
                .build());
        } catch (Exception e) {
            // The corpus being unreachable must not sink the whole answer: the agent still has the
            // user's real figures, which are the more important half.
            log.warn("Guidance search failed for '{}': {}", query, e.toString());
            return "Guidance lookup is unavailable right now.";
        }

        if (hits == null || hits.isEmpty()) {
            // Saying so plainly beats returning weak matches the model would then treat as settled.
            return "No published guidance found for that. Answer from the user's own figures, and say "
                + "that no official guidance was found rather than inventing a rule.";
        }

        log.debug("Guidance search '{}' -> {} hits", query, hits.size());
        return hits.stream().map(GuidanceTools::render).collect(Collectors.joining("\n\n---\n\n"));
    }

    private static String render(Document doc) {
        Object publisher = doc.getMetadata().get("publisher");
        Object title = doc.getMetadata().get("title");
        Object section = doc.getMetadata().get("section");
        Object asOf = doc.getMetadata().get("as_of");

        StringBuilder cite = new StringBuilder();
        cite.append(publisher == null ? "Source" : publisher);
        if (title != null) {
            cite.append(" — ").append(title);
        }
        if (section != null) {
            cite.append(", ").append(section);
        }
        if (asOf != null) {
            cite.append(" [").append(asOf).append(']');
        }
        return "[" + cite + "]\n" + doc.getText();
    }
}
