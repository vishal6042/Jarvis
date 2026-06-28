package com.jarvis.ingestion.client;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/** Calls ai-orchestrator's parser over the internal channel. */
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
}
