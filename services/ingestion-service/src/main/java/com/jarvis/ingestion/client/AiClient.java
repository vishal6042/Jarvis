package com.jarvis.ingestion.client;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/** Calls ai-orchestrator's parser/statement agents over the internal channel. */
@Component
public class AiClient {

    private final WebClient web;
    private final String internalKey;

    public AiClient(
        @LoadBalanced WebClient.Builder builder,
        @Value("${jarvis.ai.base-url}") String baseUrl,
        @Value("${jarvis.internal.key}") String internalKey) {
        this.web = builder.baseUrl(baseUrl).build();
        this.internalKey = internalKey;
    }

    public ParsedTransaction parse(String text) {
        return web.post()
            .uri("/internal/ai/parse")
            .header("X-Internal-Key", internalKey)
            .bodyValue(Map.of("text", text))
            .retrieve()
            .bodyToMono(ParsedTransaction.class)
            .block();
    }

    /** Scan a statement chunk → identified account + its transactions. (LLM call can be slow.) */
    public StatementResult parseStatement(String text) {
        return web.post()
            .uri("/internal/ai/parse-statement")
            .header("X-Internal-Key", internalKey)
            .bodyValue(Map.of("text", text))
            .retrieve()
            .bodyToMono(StatementResult.class)
            .block(Duration.ofMinutes(5));
    }

    /** Mirror of the orchestrator's ParsedTransaction (all strings — parsed defensively here). */
    public record ParsedTransaction(
        boolean isTransaction,
        String amount,
        String currency,
        String direction,
        String merchant,
        String last4,
        String bank,
        String occurredOn,
        String category) {}

    /** Mirror of the orchestrator's StatementParseResult. */
    public record StatementResult(
        String bank,
        String last4,
        String accountType,
        String currency,
        List<ParsedTransaction> transactions) {}
}
