package com.jarvis.ai.client;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.function.UnaryOperator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriBuilder;

/**
 * Reads analytics from expense-service over the internal channel (shared key, via Eureka LB).
 *
 * <p>Every read is bounded by a pair of inclusive dates rather than a rolling "last N days": the
 * assistant has already worked out which days the question is about, and a calendar window is the
 * only thing that can answer "yesterday" or "in March" correctly.
 */
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

    /** @param memberId whose money to report on; null asks about the whole household. */
    public Summary summary(LocalDate from, LocalDate to, Long memberId) {
        return get("/internal/analytics/summary", from, to, memberId, b -> b)
            .bodyToMono(Summary.class)
            .block();
    }

    /** @param memberId whose money to report on; null asks about the whole household. */
    public List<CategorySpend> byCategory(LocalDate from, LocalDate to, Long memberId) {
        return get("/internal/analytics/by-category", from, to, memberId, b -> b)
            .bodyToMono(new ParameterizedTypeReference<List<CategorySpend>>() {})
            .block();
    }

    /** Spend day by day inside the window, most recent first; silent days are absent. */
    public List<DaySpend> daily(LocalDate from, LocalDate to, Long memberId) {
        return get("/internal/analytics/daily", from, to, memberId, b -> b)
            .bodyToMono(new ParameterizedTypeReference<List<DaySpend>>() {})
            .block();
    }

    /** The merchants that took the most inside the window, biggest first. */
    public List<MerchantSpend> topMerchants(LocalDate from, LocalDate to, int limit, Long memberId) {
        return get("/internal/analytics/top-merchants", from, to, memberId,
                b -> b.queryParam("limit", limit))
            .bodyToMono(new ParameterizedTypeReference<List<MerchantSpend>>() {})
            .block();
    }

    /** The purchases themselves, newest first; {@code search} narrows by merchant/category/note. */
    public List<Txn> transactions(
        LocalDate from, LocalDate to, String search, int limit, Long memberId) {
        return get("/internal/analytics/transactions", from, to, memberId, b -> {
                if (search != null && !search.isBlank()) {
                    b.queryParam("q", search.trim());
                }
                return b.queryParam("limit", limit);
            })
            .bodyToMono(new ParameterizedTypeReference<List<Txn>>() {})
            .block();
    }

    /** One GET with the window, the member and the internal key already on it. */
    private WebClient.ResponseSpec get(
        String path,
        LocalDate from,
        LocalDate to,
        Long memberId,
        UnaryOperator<UriBuilder> extra) {
        return web.get()
            .uri(uri -> {
                UriBuilder b = uri.path(path).queryParam("from", from).queryParam("to", to);
                if (memberId != null) {
                    b.queryParam("memberId", memberId);
                }
                return extra.apply(b).build();
            })
            .header("X-Internal-Key", internalKey)
            .retrieve();
    }

    public record Summary(BigDecimal earning, BigDecimal spend) {}

    public record CategorySpend(String category, BigDecimal total) {}

    public record DaySpend(LocalDate day, BigDecimal total, int count) {}

    public record MerchantSpend(String merchant, BigDecimal total, int count) {}

    /** One purchase, as much of it as the assistant needs to name it back to the user. */
    public record Txn(
        Instant occurredAt,
        BigDecimal amount,
        String merchant,
        String merchantNorm,
        String category,
        String accountName) {

        /** The cleaned-up merchant name where one is known, the raw alert text otherwise. */
        public String name() {
            if (merchantNorm != null && !merchantNorm.isBlank()) {
                return merchantNorm;
            }
            return merchant != null && !merchant.isBlank() ? merchant : "Unknown";
        }
    }
}
