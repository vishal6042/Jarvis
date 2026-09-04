package com.jarvis.ingestion.client;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/** Routes alerts for accounts linked to an investment (e.g. a post office RD) to finance-service. */
@Component
public class FinanceClient {

    private static final Logger log = LoggerFactory.getLogger(FinanceClient.class);

    private final WebClient web;
    private final String internalKey;

    public FinanceClient(
        @LoadBalanced WebClient.Builder builder,
        @Value("${jarvis.finance.base-url:lb://finance-service}") String baseUrl,
        @Value("${jarvis.internal.key}") String internalKey) {
        this.web = builder.baseUrl(baseUrl).build();
        this.internalKey = internalKey;
    }

    /** The investment linked to these account digits, if any. Failures (finance down) → empty. */
    public Optional<LinkedInvestment> findByLast4(String last4) {
        if (last4 == null || last4.isBlank()) {
            return Optional.empty();
        }
        try {
            List<LinkedInvestment> linked = web.get()
                .uri("/internal/investments/linked")
                .header("X-Internal-Key", internalKey)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<LinkedInvestment>>() {})
                .block();
            if (linked == null) {
                return Optional.empty();
            }
            return linked.stream()
                .filter(i -> i.accountLast4() != null
                    && (i.accountLast4().equals(last4) || (last4.length() < 4 && i.accountLast4().endsWith(last4))))
                .findFirst();
        } catch (Exception e) {
            log.warn("Could not look up linked investments: {}", e.getMessage());
            return Optional.empty();
        }
    }

    public ContributionResult contribute(String last4, BigDecimal amount, BigDecimal balance, LocalDate date) {
        return web.post()
            .uri("/internal/investments/contribution")
            .header("X-Internal-Key", internalKey)
            .bodyValue(new ContributionRequest(last4, amount, balance, date))
            .retrieve()
            .bodyToMono(ContributionResult.class)
            .block();
    }

    public record LinkedInvestment(Long id, String name, String accountLast4) {}

    public record ContributionRequest(String last4, BigDecimal amount, BigDecimal balance, LocalDate date) {}

    public record ContributionResult(Long investmentId, String name, BigDecimal current, boolean applied) {}
}
