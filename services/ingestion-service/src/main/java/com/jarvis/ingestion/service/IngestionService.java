package com.jarvis.ingestion.service;

import com.jarvis.ingestion.client.AiClient;
import com.jarvis.ingestion.client.ExpenseClient;
import com.jarvis.ingestion.domain.ParseStatus;
import com.jarvis.ingestion.domain.RawMessage;
import com.jarvis.ingestion.repo.RawMessageRepository;
import com.jarvis.ingestion.web.dto.IngestRequest;
import com.jarvis.ingestion.web.dto.IngestResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Distributed ingestion pipeline:
 * store raw alert → ai-orchestrator parses → expense-service persists (matches account, dedups)
 * → record the outcome on the raw message. The orchestrator and the persistence step each live
 * in their own service; this one only owns the raw_message audit log + the workflow.
 */
@Service
public class IngestionService {

    private static final Logger log = LoggerFactory.getLogger(IngestionService.class);

    private final RawMessageRepository rawMessages;
    private final AiClient ai;
    private final ExpenseClient expense;

    public IngestionService(RawMessageRepository rawMessages, AiClient ai, ExpenseClient expense) {
        this.rawMessages = rawMessages;
        this.ai = ai;
        this.expense = expense;
    }

    @Transactional
    public IngestResponse ingest(IngestRequest req) {
        RawMessage msg = new RawMessage();
        msg.setSource(req.source());
        msg.setPayload(req.payload());
        msg.setSender(req.sender());
        msg.setReceivedAt(req.receivedAt() == null ? Instant.now() : req.receivedAt());
        msg.setStatus(ParseStatus.PENDING);
        msg = rawMessages.save(msg);

        try {
            AiClient.ParsedTransaction parsed = ai.parse(req.payload());

            if (parsed == null || !parsed.isTransaction()) {
                return finish(msg, ParseStatus.IGNORED, null, "Not a transaction alert.");
            }

            BigDecimal amount = parseAmount(parsed.amount());
            String direction = parseDirection(parsed.direction());
            if (amount == null || direction == null) {
                return finish(msg, ParseStatus.FAILED, null, "Missing or invalid amount/direction.");
            }

            var createReq = new ExpenseClient.CreateTransactionRequest(
                blankToNull(parsed.last4()),
                amount,
                parsed.currency() == null || parsed.currency().isBlank() ? "INR" : parsed.currency(),
                direction,
                parsed.merchant(),
                parsed.category() == null || parsed.category().isBlank()
                    ? "Uncategorized" : parsed.category().trim(),
                resolveOccurredAt(parsed.occurredOn(), msg.getReceivedAt()),
                msg.getSource().name(),
                String.valueOf(msg.getId()));

            ExpenseClient.CreateResult result = expense.create(createReq);
            if (!result.created()) {
                return finish(msg, ParseStatus.DUPLICATE, null, "Duplicate of an existing transaction.");
            }
            msg.setTransactionRef(result.transactionId());
            return finish(msg, ParseStatus.PARSED, result.transactionId(), "Parsed and stored.");

        } catch (Exception e) {
            log.warn("Ingest failed for raw message {}: {}", msg.getId(), e.getMessage());
            return finish(msg, ParseStatus.FAILED, null, e.getMessage());
        }
    }

    private IngestResponse finish(RawMessage msg, ParseStatus status, Long txnId, String detail) {
        msg.setStatus(status);
        if (status == ParseStatus.FAILED) {
            msg.setError(detail);
        }
        rawMessages.save(msg);
        return new IngestResponse(msg.getId(), status, txnId, detail);
    }

    private String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private BigDecimal parseAmount(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            String cleaned = raw.replaceAll("[^0-9.]", "");
            return cleaned.isEmpty() ? null : new BigDecimal(cleaned);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String parseDirection(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.trim().toUpperCase();
        if (v.startsWith("DEBIT") || v.equals("DR") || v.equals("OUT")) return "DEBIT";
        if (v.startsWith("CREDIT") || v.equals("CR") || v.equals("IN")) return "CREDIT";
        return null;
    }

    private Instant resolveOccurredAt(String occurredOn, Instant fallback) {
        if (occurredOn == null || occurredOn.isBlank()) return fallback;
        try {
            return LocalDate.parse(occurredOn.trim()).atStartOfDay(ZoneOffset.UTC).toInstant();
        } catch (Exception e) {
            return fallback;
        }
    }
}
