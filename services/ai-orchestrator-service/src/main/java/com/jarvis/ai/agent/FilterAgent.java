package com.jarvis.ai.agent;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.ollama.api.OllamaChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Turns what someone types into the Transactions search box ("food over ₹500 last week", "swiggy
 * in august", "refunds on my amex") into the page's own filters. Extraction only, on the small
 * model; the page shows the filters it understood, so a wrong reading is one click to undo.
 */
@Component
public class FilterAgent {

    private static final Logger log = LoggerFactory.getLogger(FilterAgent.class);

    private static final String SYSTEM =
        """
        You turn a search typed into a personal-finance transaction list into filters.
        Reply with one JSON object and nothing else, every field optional (null when not asked for):
          {"category": "<one of the allowed categories>", "direction": "DEBIT" | "CREDIT",
           "minAmount": <number>, "maxAmount": <number>, "from": "yyyy-MM-dd", "to": "yyyy-MM-dd",
           "accountId": <id from the list>, "text": "<merchant or words to search for>"}
        Rules:
        - Dates are relative to TODAY given below. "last week" = the 7 days ending yesterday.
          "this month" = the 1st to today. "in august" = the whole of the most recent August.
        - "over/above/more than 500" -> minAmount 500. "under/below/less than" -> maxAmount.
          Amounts may be written 5k, 1.5L, 2 lakh: 1k = 1000, 1L = 100000.
        - spent/paid/bought/purchases -> DEBIT. refunds/received/credited/salary/income -> CREDIT.
        - category only when the words clearly name one of the allowed categories or an obvious
          synonym ("eating out" -> Food, "cabs" -> Transport). When the search names a merchant
          ("swiggy", "amazon"), put it in text and leave category null.
        - accountId only when an account is named ("amex", "sbi", "card 0009").
        - Never guess. Leave a field null rather than invent it.
        - Never set both category and text for the same words: a category word goes in category only,
          a merchant name in text only.
        Examples (TODAY 2026-09-30):
          "swiggy in august" -> {"text": "swiggy", "category": null, "direction": "DEBIT", "from": "2026-08-01", "to": "2026-08-31"}
          "cabs under 2k this month" -> {"category": "Transport", "text": null, "maxAmount": 2000, "direction": "DEBIT", "from": "2026-09-01", "to": "2026-09-30"}
          "eating out over 1k" -> {"category": "Food", "text": null, "minAmount": 1000, "direction": "DEBIT"}
          "salary" -> {"direction": "CREDIT", "text": "salary", "category": null}
        """;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TransactionFilter(
        String category,
        String direction,
        Double minAmount,
        Double maxAmount,
        String from,
        String to,
        Long accountId,
        String text) {}

    public record AccountRef(Long id, String name) {}

    private final ChatClient chatClient;
    private final String model;
    private final String keepAlive;

    public FilterAgent(
        ChatClient.Builder builder,
        @Value("${jarvis.ai.parser-model}") String model,
        @Value("${jarvis.ai.keep-alive}") String keepAlive) {
        this.chatClient = builder.build();
        this.model = model;
        this.keepAlive = keepAlive;
    }

    public TransactionFilter parse(String query, String today, List<String> categories, List<AccountRef> accounts) {
        StringBuilder user = new StringBuilder();
        user.append("TODAY: ").append(today).append("\n");
        user.append("Allowed categories: ").append(String.join(", ", categories)).append("\n");
        if (accounts != null && !accounts.isEmpty()) {
            user.append("Accounts:\n");
            accounts.forEach(a -> user.append("  ").append(a.id()).append(" = ").append(a.name()).append("\n"));
        }
        user.append("\nSearch: ").append(query);
        try {
            TransactionFilter f = chatClient
                .prompt()
                .system(SYSTEM)
                .user(user.toString())
                .options(OllamaChatOptions.builder().model(model).temperature(0.0).keepAlive(keepAlive).disableThinking().build())
                .call()
                .entity(TransactionFilter.class);
            if (f == null) {
                return textOnly(query);
            }
            // Only categories the page knows, only accounts it listed.
            String category = f.category() == null ? null
                : categories.stream().filter(c -> c.equalsIgnoreCase(f.category().trim())).findFirst().orElse(null);
            Long account = f.accountId() != null && accounts != null && accounts.stream().anyMatch(a -> a.id().equals(f.accountId()))
                ? f.accountId()
                : null;
            String direction = "DEBIT".equalsIgnoreCase(f.direction()) ? "DEBIT" : "CREDIT".equalsIgnoreCase(f.direction()) ? "CREDIT" : null;
            return new TransactionFilter(category, direction, f.minAmount(), f.maxAmount(), f.from(), f.to(), account,
                f.text() == null || f.text().isBlank() ? null : f.text().trim());
        } catch (RuntimeException e) {
            log.warn("filter parse failed for '{}': {}", query, e.getMessage());
            return textOnly(query);
        }
    }

    /** When the model cannot help, fall back to a plain text search for what was typed. */
    private static TransactionFilter textOnly(String query) {
        return new TransactionFilter(null, null, null, null, null, null, null, query);
    }
}
