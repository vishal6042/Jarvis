package com.jarvis.ai.client;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Reads the household roster and each member's portfolio from finance-service over the internal
 * channel (shared key, via Eureka LB).
 *
 * <p>expense-service knows whose accounts are whose by member id, but only this service knows that
 * member 2 is the spouse and is called Neha. Turning "my wife" into an id needs both.
 */
@Component
public class FinanceClient {

    private final WebClient web;
    private final String internalKey;

    public FinanceClient(
        @LoadBalanced WebClient.Builder builder,
        @Value("${jarvis.finance.base-url}") String baseUrl,
        @Value("${jarvis.internal.key}") String internalKey) {
        this.web = builder.baseUrl(baseUrl).build();
        this.internalKey = internalKey;
    }

    /** Everyone in the household. */
    public List<Member> members() {
        return web.get()
            .uri("/internal/household/members")
            .header("X-Internal-Key", internalKey)
            .retrieve()
            .bodyToMono(new ParameterizedTypeReference<List<Member>>() {})
            .block();
    }

    /** @param memberId whose portfolio; null asks for the whole household's. */
    public Portfolio portfolio(Long memberId) {
        return web.get()
            .uri(uri -> {
                var b = uri.path("/internal/household/portfolio");
                if (memberId != null) {
                    b.queryParam("memberId", memberId);
                }
                return b.build();
            })
            .header("X-Internal-Key", internalKey)
            .retrieve()
            .bodyToMono(Portfolio.class)
            .block();
    }

    /** @param earns false for someone with no income of their own — a homemaker or a child. */
    public record Member(Long id, String name, String relation, boolean earns) {

        /** "Neha Rani (Spouse)" — how the assistant should refer to them in an answer. */
        public String label() {
            return relation == null || relation.isBlank() ? name : name + " (" + relation + ")";
        }
    }

    public record Portfolio(List<Investment> investments, List<Loan> loans, List<Goal> goals) {}

    public record Investment(
        String name,
        String kind,
        BigDecimal invested,
        BigDecimal current,
        BigDecimal monthly,
        Double rate,
        LocalDate maturityDate) {}

    public record Loan(
        String lender,
        String kind,
        BigDecimal outstanding,
        BigDecimal emi,
        Double rate,
        LocalDate endDate) {}

    public record Goal(String name, BigDecimal target, BigDecimal saved, LocalDate targetDate) {}
}
