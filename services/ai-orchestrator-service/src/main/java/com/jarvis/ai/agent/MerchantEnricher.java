package com.jarvis.ai.agent;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.ollama.api.OllamaChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Turns the raw merchant text in bank alerts ("UPI-653782697753-Blinkit IN", "RAZ*BRANCE") into a
 * clean name and a category. Runs on the small parser model: this is extraction over short
 * strings, not reasoning, and that model stays resident on the GPU.
 *
 * <p>The user's own already-categorised merchants are passed in as examples, so the answers follow
 * the conventions they have already established rather than a generic taxonomy.
 */
@Component
public class MerchantEnricher {

    private static final Logger log = LoggerFactory.getLogger(MerchantEnricher.class);

    private static final String SYSTEM =
        """
        You clean up merchant names from Indian bank and UPI alerts, for one user.
        For every input string return the shop or payee a person would recognise, and its category.
        Reply with a single JSON array and nothing else. One object per input, same order:
          {"raw": "<the input, copied exactly>", "merchant": "<clean name>", "category": "<category>", "confidence": <0.0-1.0>}
        Rules:
        - Strip payment plumbing: UPI-, NEFT-, IMPS-, POS, reference numbers, terminal ids, "IN", trailing punctuation.
          "UPI-653782697753-Blinkit IN" -> "Blinkit". "SHELL INDIA MAR." -> "Shell". "AMAZON PAY IN GROCERY" -> "Amazon Pay".
        - Use title case and the brand's usual spelling. Keep it short: the brand, not the branch or the city.
        - A person's name stays a person's name; category "Transfers".
        - Salary or interest credits: category "Income".
        - Choose a category from the allowed list. If nothing fits, use "Miscellaneous".
        - confidence is how sure you are of BOTH fields: below 0.6 when the string is too cryptic to read.
        - Never invent a brand you cannot see in the string. When unreadable, copy the input as the merchant
          and set a low confidence.
        """;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record EnrichedMerchant(String raw, String merchant, String category, Double confidence) {}

    private final ChatClient chatClient;
    private final ObjectMapper json;
    private final String extractionModel;

    public MerchantEnricher(
        ChatClient.Builder chatClientBuilder,
        ObjectMapper json,
        @Value("${jarvis.ai.parser-model}") String extractionModel) {
        this.chatClient = chatClientBuilder.build();
        this.json = json;
        this.extractionModel = extractionModel;
    }

    /**
     * @param raws       merchant strings to clean, ideally a dozen or so at a time
     * @param categories the categories the answers must choose from
     * @param examples   "raw => category" lines from the user's own history, to set the conventions
     */
    public List<EnrichedMerchant> enrich(List<String> raws, List<String> categories, List<String> examples) {
        if (raws == null || raws.isEmpty()) {
            return List.of();
        }
        StringBuilder user = new StringBuilder();
        user.append("Allowed categories: ").append(String.join(", ", categories)).append("\n");
        if (examples != null && !examples.isEmpty()) {
            user.append("\nHow this user has already categorised similar merchants:\n");
            examples.forEach(e -> user.append("  ").append(e).append("\n"));
        }
        user.append("\nClean these ").append(raws.size()).append(" strings:\n");
        for (String r : raws) {
            user.append("- ").append(r).append("\n");
        }

        String reply;
        try {
            reply = chatClient
                .prompt()
                .system(SYSTEM)
                .user(user.toString())
                .options(OllamaChatOptions.builder().model(extractionModel).temperature(0.0).build())
                .call()
                .content();
        } catch (RuntimeException e) {
            log.warn("merchant enrichment failed: {}", e.getMessage());
            return List.of();
        }
        return parse(reply, raws);
    }

    /** Tolerates prose around the JSON, and keeps only answers that match an input string. */
    private List<EnrichedMerchant> parse(String reply, List<String> raws) {
        if (reply == null) {
            return List.of();
        }
        int start = reply.indexOf('[');
        int end = reply.lastIndexOf(']');
        if (start < 0 || end <= start) {
            log.warn("unparseable merchant JSON: {}", reply);
            return List.of();
        }
        List<EnrichedMerchant> parsed;
        try {
            parsed = List.of(json.readValue(reply.substring(start, end + 1), EnrichedMerchant[].class));
        } catch (Exception e) {
            log.warn("unparseable merchant JSON: {}", reply);
            return List.of();
        }
        List<EnrichedMerchant> out = new ArrayList<>();
        for (EnrichedMerchant m : parsed) {
            if (m.raw() == null || m.merchant() == null || m.merchant().isBlank()) {
                continue;
            }
            // The model occasionally rewrites the input; only keep answers we can match back.
            String match = raws.stream().filter(r -> r.equalsIgnoreCase(m.raw().trim())).findFirst().orElse(null);
            if (match == null) {
                continue;
            }
            out.add(new EnrichedMerchant(
                match, m.merchant().trim(), m.category() == null ? null : m.category().trim(),
                m.confidence() == null ? 0.5 : Math.max(0, Math.min(1, m.confidence()))));
        }
        return out;
    }
}
