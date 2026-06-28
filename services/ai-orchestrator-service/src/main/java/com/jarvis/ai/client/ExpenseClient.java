package com.jarvis.ai.client;

import java.math.BigDecimal;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/** Reads analytics from expense-service over the internal channel (shared key, via Eureka LB). */
@Component
public class ExpenseClient {

    private final WebClient web;
    private final String internalKey;

    public ExpenseClient(
        @LoadBalanced WebClient.Builder builder,
        @Value("${jarvis.expense.base-url}") String baseUrl,
        @Value("${jarvis.internal.key}") String internalKey) {
        this.web = builder.baseUrl(baseUrl).build();
        this.internalKey = internalKey;
    }

    public Summary summary(int days) {
        return web.get()
            .uri(uri -> uri.path("/internal/analytics/summary").queryParam("days", days).build())
            .header("X-Internal-Key", internalKey)
            .retrieve()
            .bodyToMono(Summary.class)
            .block();
    }

    public List<CategorySpend> byCategory(int days) {
        return web.get()
            .uri(uri -> uri.path("/internal/analytics/by-category").queryParam("days", days).build())
            .header("X-Internal-Key", internalKey)
            .retrieve()
            .bodyToMono(new ParameterizedTypeReference<List<CategorySpend>>() {})
            .block();
    }

    public record Summary(BigDecimal earning, BigDecimal spend) {}

    public record CategorySpend(String category, BigDecimal total) {}
}
