package com.jarvis.ai.agent;

import com.jarvis.ai.rag.GuidanceTools;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.ollama.api.OllamaChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Natural-language Q&A agent (qwen3.5:27b). Answers questions about the user's finances by
 * calling expense-service analytics through its @Tool functions.
 */
@Component
public class QueryAgent {

    private static final DateTimeFormatter TODAY =
        DateTimeFormatter.ofPattern("EEEE d MMMM yyyy", Locale.ENGLISH);

    private static final String SYSTEM = """
        You are Jarvis, a concise personal-finance assistant for one Indian user.
        Answer questions about their spending, earning and budgets. All amounts are in INR (₹).
        Use the provided tools to fetch real figures before answering — never invent numbers.
        Keep answers short and direct.

        The tools cover any period, down to a single day. Never say you cannot see daily figures,
        a particular day, or the transactions behind a total: call a tool and look. Pass the period
        through in the user's own words — "yesterday", "last_week", "this_month", "2026-03" — and
        the tool works out the dates. Do not do date arithmetic yourself. If a tool says it did not
        understand the period, call it again with one of the forms it lists.

        Pick the tool that matches the question: spendingSummary for one period's total,
        spendByCategory for what it went on, dailySpend for day by day, topMerchants for who was
        paid, findTransactions for the individual purchases. Answer with the figure the tool
        returned and say which period it covers. If a tool reports nothing recorded, say the data
        shows nothing for that period rather than that you cannot look.

        For questions about how money works, or what a rule or limit is, call
        searchFinancialGuidance and answer from what it returns. Name the source in your answer
        (for example "per SEBI" or "per the Income Tax Department"). If it finds nothing, say so
        rather than inventing a rule.

        Two things you must get right:
        - Income tax has an old and a new regime with different limits. Always say which regime a
          figure applies to, and never mix them in one calculation.
        - Guidance is general and published; the user's figures are their own. Explain what the
          guidance says and how it applies to their numbers. Do not present it as personalised
          financial advice, and do not recommend specific products to buy.
        """;

    private final ChatClient chatClient;
    private final ExpenseAnalyticsTools tools;
    private final GuidanceTools guidance;
    private final String agentModel;

    public QueryAgent(
        ChatClient.Builder chatClientBuilder,
        ExpenseAnalyticsTools tools,
        GuidanceTools guidance,
        @Value("${jarvis.ai.agent-model}") String agentModel) {
        this.chatClient = chatClientBuilder.build();
        this.tools = tools;
        this.guidance = guidance;
        this.agentModel = agentModel;
    }

    public String ask(String message) {
        return ask(message, null);
    }

    /**
     * Answer with an optional live snapshot from the app (already-computed figures such as safe
     * to spend, projected balance and upcoming bills). The model is told to trust and cite them
     * rather than recompute, so "can I afford X" gets a grounded answer.
     */
    public String ask(String message, String context) {
        StringBuilder system = new StringBuilder(SYSTEM);
        // Without this the model has no idea what day it is, so "yesterday" is unanswerable to it
        // even with the tools in front of it. The tools resolve the dates; this tells it the tools
        // are current and lets it name the day back to the user.
        system.append("\nToday is ").append(LocalDate.now(ZoneId.systemDefault()).format(TODAY)).append(".\n");
        if (context != null && !context.isBlank()) {
            system.append("\nLive snapshot from the app (already computed — trust these figures and cite them; ")
                .append("do not recompute or invent numbers):\n")
                .append(context.strip());
        }
        return chatClient
            .prompt()
            .system(system.toString())
            .user(message)
            .tools(tools, guidance)
            .options(OllamaChatOptions.builder().model(agentModel).build())
            .call()
            .content();
    }
}
