package com.jarvis.ingestion.client;

import org.springframework.core.ParameterizedTypeReference;
import java.util.List;
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
        Long accountId = resp != null && resp.getBody() != null ? resp.getBody().accountId() : null;
        return new CreateResult(created, id, accountId);
    }

    /** Ids of alert-created transactions that expense-service couldn't link to an account. */
    public List<Long> unlinkedTransactionIds() {
        List<Long> ids = web.get()
            .uri("/internal/transactions/unlinked")
            .header("X-Internal-Key", internalKey)
            .retrieve()
            .bodyToMono(new ParameterizedTypeReference<List<Long>>() {})
            .block();
        return ids == null ? List.of() : ids;
    }

    /** Delete a transaction (used before re-running its alert through the pipeline). */
    public void delete(Long transactionId) {
        web.delete()
            .uri("/internal/transactions/{id}", transactionId)
            .header("X-Internal-Key", internalKey)
            .retrieve()
            .toBodilessEntity()
            .block();
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

    /** Look up an existing account WITHOUT creating one (preview); null if not found. */
    public ResolvedAccount findAccount(String bank, String last4) {
        return web.get()
            .uri(uri -> uri.path("/internal/accounts/find")
                .queryParam("bank", bank == null ? "" : bank)
                .queryParam("last4", last4)
                .build())
            .header("X-Internal-Key", internalKey)
            .retrieve()
            .bodyToMono(ResolvedAccount.class) // 204 → empty → null after block()
            .block();
    }

    /** Last-4s of the user's registered credit cards — used to spot card-bill payments in savings. */
    public java.util.Set<String> listCardLast4s() {
        java.util.List<AccountBrief> all = web.get()
            .uri("/internal/accounts")
            .header("X-Internal-Key", internalKey)
            .retrieve()
            .bodyToFlux(AccountBrief.class)
            .collectList()
            .block();
        java.util.Set<String> out = new java.util.HashSet<>();
        if (all != null) {
            for (AccountBrief a : all) {
                if ("CREDIT_CARD".equalsIgnoreCase(a.type()) && a.last4() != null && !a.last4().isBlank()) {
                    out.add(a.last4().trim());
                }
            }
        }
        return out;
    }

    /** Slim view of an account for {@link #listCardLast4s()} (Jackson ignores the other fields). */
    public record AccountBrief(String last4, String type) {}

    public record CreateTransactionRequest(
        Long accountId,
        String last4,
        String bank,
        BigDecimal amount,
        String currency,
        String direction,
        String merchant,
        String category,
        Instant occurredAt,
        String source,
        String sourceRef,
        BigDecimal balanceAfter) {

        /** Statement-import shape: explicit account, no bank hint or balance. */
        public CreateTransactionRequest(
            Long accountId, String last4, BigDecimal amount, String currency, String direction,
            String merchant, String category, Instant occurredAt, String source, String sourceRef) {
            this(accountId, last4, null, amount, currency, direction, merchant, category, occurredAt, source, sourceRef, null);
        }
    }

    public record CreatedTxn(Long id, Long accountId) {}

    /** created=false means it was a duplicate (already existed). accountId is null when unmatched. */
    public record CreateResult(boolean created, Long transactionId, Long accountId) {}

    public record ResolveAccountRequest(String bank, String last4, String type) {}

    /** Subset of expense AccountDto that we need (Jackson ignores the rest). */
    public record ResolvedAccount(Long id, String bank, String last4, String displayName) {}
}
