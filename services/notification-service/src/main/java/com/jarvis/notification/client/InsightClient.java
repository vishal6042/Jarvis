package com.jarvis.notification.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Read-only pulls the rule engine needs, from the existing/new internal endpoints of expense- and
 * finance-service. All calls are best-effort — a failure returns an empty result, never throws.
 */
@Component
public class InsightClient {

    private final WebClient expense;
    private final WebClient finance;
    private final String internalKey;

    public InsightClient(
        @LoadBalanced WebClient.Builder builder,
        @Value("${jarvis.expense.base-url}") String expenseUrl,
        @Value("${jarvis.finance.base-url}") String financeUrl,
        @Value("${jarvis.internal.key}") String internalKey) {
        // clone() per client so each keeps its own base URL while sharing the @LoadBalanced filter.
        this.expense = builder.clone().baseUrl(expenseUrl).build();
        this.finance = builder.clone().baseUrl(financeUrl).build();
        this.internalKey = internalKey;
    }

    /** This month's spend per category (expense-service, last 30 days). */
    public List<CategorySpend> spendByCategory() {
        try {
            List<CategorySpend> rows = expense.get()
                .uri("/internal/analytics/by-category?days=30")
                .header("X-Internal-Key", internalKey)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<CategorySpend>>() {})
                .block();
            return rows == null ? List.of() : rows;
        } catch (Exception e) {
            return List.of();
        }
    }

    /** All accounts (expense-service) — used to detect expiring cards. */
    public List<AccountInfo> accounts() {
        try {
            List<AccountInfo> rows = expense.get()
                .uri("/internal/accounts")
                .header("X-Internal-Key", internalKey)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<AccountInfo>>() {})
                .block();
            return rows == null ? List.of() : rows;
        } catch (Exception e) {
            return List.of();
        }
    }

    /** Category → monthly limit (finance-service). */
    public Map<String, Double> thresholds() {
        try {
            Map<String, Double> map = finance.get()
                .uri("/internal/thresholds")
                .header("X-Internal-Key", internalKey)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Double>>() {})
                .block();
            return map == null ? Collections.emptyMap() : map;
        } catch (Exception e) {
            return Collections.emptyMap();
        }
    }

    /** Calendar reminders (finance-service) — used for upcoming-payment alerts. */
    public List<ReminderInfo> reminders() {
        try {
            List<ReminderInfo> rows = finance.get()
                .uri("/internal/reminders")
                .header("X-Internal-Key", internalKey)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<ReminderInfo>>() {})
                .block();
            return rows == null ? List.of() : rows;
        } catch (Exception e) {
            return List.of();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CategorySpend(String category, BigDecimal total) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AccountInfo(
        Long id, String bank, String type, String last4, Integer expiryMonth, Integer expiryYear) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ReminderInfo(
        Long id, String title, LocalDate date, String type, BigDecimal amount, String repeat) {}
}
