package com.jarvis.expense.web.internal;

import java.util.List;
import com.jarvis.expense.service.TransactionService;
import com.jarvis.expense.web.dto.InternalTransactionRequest;
import com.jarvis.expense.web.dto.TransactionDto;
import jakarta.validation.Valid;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Service-to-service endpoint used by ingestion-service to persist a parsed transaction.
 * Not exposed through the gateway; protected by a shared {@code X-Internal-Key} header.
 */
@RestController
@RequestMapping("/internal/transactions")
public class InternalTransactionController {

    private final TransactionService service;
    private final String internalKey;

    public InternalTransactionController(
        TransactionService service, @Value("${jarvis.internal.key}") String internalKey) {
        this.service = service;
        this.internalKey = internalKey;
    }

    /** Returns 201 with the created transaction, or 200 (no body) when it was a duplicate. */
    @PostMapping
    public ResponseEntity<TransactionDto> create(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @Valid @RequestBody InternalTransactionRequest req) {
        check(key);
        Optional<TransactionDto> created = service.ingestParsed(req);
        return created
            .map(dto -> ResponseEntity.status(HttpStatus.CREATED).body(dto))
            .orElseGet(() -> ResponseEntity.ok().build()); // duplicate → 200, no body
    }

    /** Ids of alert-created transactions that couldn't be matched to an account (ingestion's relink pass). */
    @GetMapping("/unlinked")
    public List<Long> unlinked(@RequestHeader(value = "X-Internal-Key", required = false) String key) {
        check(key);
        return service.unlinkedIds();
    }

    /** Remove a transaction so ingestion can push its alert through the pipeline again. */
    @DeleteMapping("/{id}")
    public void delete(
        @RequestHeader(value = "X-Internal-Key", required = false) String key, @PathVariable Long id) {
        check(key);
        service.delete(id);
    }

    private void check(String key) {
        if (!internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bad internal key");
        }
    }
}
