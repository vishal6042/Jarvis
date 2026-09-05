package com.jarvis.ai.web;

import com.jarvis.ai.agent.ActionPlanner;
import com.jarvis.ai.agent.FinanceScore;
import com.jarvis.ai.agent.MerchantEnricher;
import com.jarvis.ai.agent.FinanceScoreAgent;
import com.jarvis.ai.agent.ParsedTransaction;
import com.jarvis.ai.agent.QueryAgent;
import com.jarvis.ai.agent.StatementParseResult;
import com.jarvis.ai.agent.StatementParserAgent;
import com.jarvis.ai.agent.TransactionParser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import java.util.List;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * The orchestration surface:
 *  - {@code POST /internal/ai/parse}           — service-to-service: parse one alert.
 *  - {@code POST /internal/ai/parse-statement} — service-to-service: scan a statement chunk.
 *  - {@code POST /api/ai/chat}                 — end-user NL Q&A (JWT via the gateway).
 *  - {@code POST /api/ai/plan}                 — extract one confirmable action from a message.
 */
@RestController
public class AiController {

    private final TransactionParser parser;
    private final StatementParserAgent statementParser;
    private final QueryAgent queryAgent;
    private final FinanceScoreAgent scoreAgent;
    private final ActionPlanner planner;
    private final MerchantEnricher enricher;
    private final String internalKey;

    public AiController(
        TransactionParser parser,
        StatementParserAgent statementParser,
        QueryAgent queryAgent,
        FinanceScoreAgent scoreAgent,
        ActionPlanner planner,
        MerchantEnricher enricher,
        @Value("${jarvis.internal.key}") String internalKey) {
        this.parser = parser;
        this.statementParser = statementParser;
        this.queryAgent = queryAgent;
        this.scoreAgent = scoreAgent;
        this.planner = planner;
        this.enricher = enricher;
        this.internalKey = internalKey;
    }

    @PostMapping("/internal/ai/parse")
    public ParsedTransaction parse(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @Valid @RequestBody ParseRequest req) {
        requireInternal(key);
        return parser.parse(req.text());
    }

    @PostMapping("/internal/ai/parse-statement")
    public StatementParseResult parseStatement(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @Valid @RequestBody ParseRequest req) {
        requireInternal(key);
        return statementParser.parse(req.text());
    }

    private void requireInternal(String key) {
        if (!internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bad internal key");
        }
    }

    @PostMapping("/api/ai/chat")
    public ChatReply chat(@Valid @RequestBody ChatRequest req) {
        return new ChatReply(queryAgent.ask(req.message(), req.context()));
    }

    /**
     * Extract a structured action ("add a reminder …") for the web app to confirm and execute.
     * The model never performs anything itself; {"type":"none"} for plain questions.
     */
    @PostMapping("/api/ai/plan")
    public ActionPlanner.PlannedAction plan(@Valid @RequestBody PlanRequest req) {
        return planner.plan(req.message());
    }

    public record PlanRequest(@NotBlank String message) {}

    /**
     * Clean a batch of raw merchant strings into readable names plus a category. Send a dozen or
     * so at a time; the caller decides what to accept.
     */
    @PostMapping("/api/ai/merchants")
    public List<MerchantEnricher.EnrichedMerchant> merchants(@RequestBody EnrichRequest req) {
        return enricher.enrich(
            req.merchants() == null ? List.of() : req.merchants(),
            req.categories() == null || req.categories().isEmpty() ? DEFAULT_CATEGORIES : req.categories(),
            req.examples() == null ? List.of() : req.examples());
    }

    private static final List<String> DEFAULT_CATEGORIES = List.of(
        "Food", "Groceries", "Shopping", "Transport", "Bills & Utilities", "Entertainment",
        "Health", "Travel", "Education", "Rent", "Investments", "Loan EMI", "Card Payment",
        "Transfers", "Income", "Miscellaneous");

    public record EnrichRequest(List<String> merchants, List<String> categories, List<String> examples) {}

    /** LLM-assessed financial-health score (1–100) + tips, from the user's monthly metrics. */
    @PostMapping("/api/ai/finance-score")
    public FinanceScore financeScore(@RequestBody FinanceMetrics req) {
        return scoreAgent.score(req.toPromptText());
    }

    public record ParseRequest(@NotBlank String text) {}

    /** {@code context}: optional snapshot the web app computed (safe-to-spend, upcoming bills …). */
    public record ChatRequest(@NotBlank String message, String context) {}

    public record ChatReply(String answer) {}

    /** Monthly financial metrics the frontend already has; formatted into the scoring prompt. */
    public record FinanceMetrics(
        double monthlyIncome,
        double monthlySpend,
        int savingsRate,
        double cashSavings,
        double investments,
        double outstandingLoans,
        double monthlyEmi) {

        String toPromptText() {
            return "Monthly income: ₹" + money(monthlyIncome) + "\n"
                + "Monthly spending: ₹" + money(monthlySpend) + "\n"
                + "Savings rate: " + savingsRate + "%\n"
                + "Cash in savings: ₹" + money(cashSavings) + "\n"
                + "Investments: ₹" + money(investments) + "\n"
                + "Outstanding loans: ₹" + money(outstandingLoans) + "\n"
                + "Monthly EMI: ₹" + money(monthlyEmi);
        }

        private static String money(double v) {
            return String.format("%,.0f", v);
        }
    }
}
