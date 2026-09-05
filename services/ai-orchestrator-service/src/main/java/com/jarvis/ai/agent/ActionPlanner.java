package com.jarvis.ai.agent;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.ollama.api.OllamaChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Turns an imperative chat message ("remind me to pay rent 25k on the 5th every month") into a
 * structured action the web app can show for confirmation and then execute itself. It runs on the
 * small parser model (the same one that reads SMS alerts): this is extraction, not reasoning, and
 * that model stays resident on the GPU. The model only extracts; it never performs anything.
 * Anything that is not a clear instruction becomes NONE.
 */
@Component
public class ActionPlanner {

    private static final Logger log = LoggerFactory.getLogger(ActionPlanner.class);

    private static final Set<String> TYPES = Set.of(
        "add_transaction", "add_reminder", "set_budget", "categorise_merchant", "add_goal", "contribute_goal", "none");

    private static final String SYSTEM = """
        You extract ONE action from a personal-finance assistant message for an Indian user (amounts in INR).
        Reply with a single JSON object and nothing else. Fields (use null when not applicable):
          type: one of "add_transaction", "add_reminder", "set_budget", "categorise_merchant", "add_goal", "contribute_goal", "none"
          amount: number (rupees; "25k" = 25000, "1.5L" = 150000)
          direction: "DEBIT" (money spent) or "CREDIT" (money received) — add_transaction only
          merchant: string — add_transaction / categorise_merchant
          category: string — one of Food, Shopping, Transport, Bills & Utilities, Entertainment, Health, Travel, Education, Groceries, Rent, Investments, Loan EMI, Miscellaneous, or the user's word
          date: "yyyy-MM-dd" — the transaction date or the reminder's (first) due date; resolve relative dates against today
          title: string — reminder title or goal name
          reminderType: "RENT", "BILL", "EMI", "INVESTMENT", "SIP" or "OTHER"
          repeatMonthly: true/false — reminders only
          goalName: string — contribute_goal only
          summary: one short plain-English sentence describing the action
        Rules:
        - Questions, opinions or anything you are not sure is an instruction => {"type":"none"}.
        - Never invent amounts or dates that the message does not imply. If a required amount is missing, still return the type and leave amount null.
        - "categorise_merchant" means: from now on treat payments to <merchant> as <category> (e.g. "mark all Swiggy as Food").
        - "set_budget" means a monthly limit for a category.
        """;

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PlannedAction(
        String type,
        Double amount,
        String direction,
        String merchant,
        String category,
        String date,
        String title,
        String reminderType,
        Boolean repeatMonthly,
        String goalName,
        String summary) {

        public static PlannedAction none() {
            return new PlannedAction("none", null, null, null, null, null, null, null, null, null, null);
        }
    }

    private final ChatClient chatClient;
    private final ObjectMapper json;
    private final String extractionModel;

    public ActionPlanner(
        ChatClient.Builder chatClientBuilder,
        ObjectMapper json,
        @Value("${jarvis.ai.parser-model}") String extractionModel) {
        this.chatClient = chatClientBuilder.build();
        this.json = json;
        this.extractionModel = extractionModel;
    }

    public PlannedAction plan(String message) {
        String today = LocalDate.now().toString();
        String raw;
        try {
            raw = chatClient
                .prompt()
                .system(SYSTEM + "\nToday is " + today + ".")
                .user(message)
                .options(OllamaChatOptions.builder().model(extractionModel).temperature(0.0).build())
                .call()
                .content();
        } catch (RuntimeException e) {
            log.warn("action planning failed: {}", e.getMessage());
            return PlannedAction.none();
        }
        PlannedAction a = parse(raw);
        if (a == null || a.type() == null || !TYPES.contains(a.type())) {
            return PlannedAction.none();
        }
        return a;
    }

    /** Tolerates prose / think-blocks around the JSON: takes the outermost {...}. */
    private PlannedAction parse(String raw) {
        if (raw == null) {
            return null;
        }
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start < 0 || end <= start) {
            return null;
        }
        try {
            return json.readValue(raw.substring(start, end + 1), PlannedAction.class);
        } catch (Exception e) {
            log.warn("unparseable action JSON: {}", raw);
            return null;
        }
    }
}
