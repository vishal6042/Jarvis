package com.jarvis.ingestion.client;

import java.math.BigDecimal;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/** Persists a parsed transaction via expense-service's internal create endpoint (which dedups). */
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

    /**
     * Posts a parsed transaction. expense-service returns 201 (created, body has the id) or
     * 200 (duplicate, no body). We surface that distinction to the caller.
     */
    public CreateResult create(CreateTransactionRequest req) {
        ResponseEntity<CreatedTxn> resp = web.post()
            .uri("/internal/transactions")
            .header("X-Internal-Key", internalKey)
            .bodyValue(req)
            .retrieve()
            .toEntity(CreatedTxn.class)
            .block();
        boolean created = resp != null && resp.getStatusCode().value() == 201;
        Long id = resp != null && resp.getBody() != null ? resp.getBody().id() : null;
        return new CreateResult(created, id);
    }

    /** Match (or auto-create) the account a statement belongs to; returns the resolved account. */
    public ResolvedAccount resolveAccount(String bank, String last4, String type) {
        return web.post()
            .uri("/internal/accounts/resolve")
            .header("X-Internal-Key", internalKey)
            .bodyValue(new ResolveAccountRequest(bank, last4, type))
            .retrieve()
            .bodyToMono(ResolvedAccount.class)
            .block();
    }

    public record CreateTransactionRequest(
        Long accountId,
        String last4,
        BigDecimal amount,
        String currency,
        String direction,
        String merchant,
        String category,
        Instant occurredAt,
        String source,
        String sourceRef) {}

    public record CreatedTxn(Long id) {}

    /** created=false means it was a duplicate (already existed). */
    public record CreateResult(boolean created, Long transactionId) {}

    public record ResolveAccountRequest(String bank, String last4, String type) {}

    /** Subset of expense AccountDto that we need (Jackson ignores the rest). */
    public record ResolvedAccount(Long id, String bank, String last4, String displayName) {}
}
