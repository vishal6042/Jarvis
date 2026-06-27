package com.jarvis.backend.service;

import com.jarvis.backend.ai.ParsedTransaction;
import com.jarvis.backend.ai.TransactionParser;
import com.jarvis.backend.domain.Account;
import com.jarvis.backend.domain.Direction;
import com.jarvis.backend.domain.ParseStatus;
import com.jarvis.backend.domain.RawMessage;
import com.jarvis.backend.domain.Transaction;
import com.jarvis.backend.repo.AccountRepository;
import com.jarvis.backend.repo.RawMessageRepository;
import com.jarvis.backend.web.dto.IngestRequest;
import com.jarvis.backend.web.dto.IngestResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Entry point for raw alerts (SMS / email / statement). Stores every message for audit, then
 * runs the AI parser to extract a transaction, match it to an account, categorize, and dedupe.
 */
@Service
public class IngestionService {

    private static final Logger log = LoggerFactory.getLogger(IngestionService.class);

    private final RawMessageRepository rawMessages;
    private final TransactionParser parser;
    private final TransactionService transactions;
    private final AccountRepository accounts;
    private final DedupHasher dedupHasher;

    public IngestionService(
        RawMessageRepository rawMessages,
        TransactionParser parser,
        TransactionService transactions,
        AccountRepository accounts,
        DedupHasher dedupHasher) {
        this.rawMessages = rawMessages;
        this.parser = parser;
        this.transactions = transactions;
        this.accounts = accounts;
        this.dedupHasher = dedupHasher;
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
            ParsedTransaction parsed = parser.parse(req.payload());

            if (parsed == null || !parsed.isTransaction()) {
                return finish(msg, ParseStatus.IGNORED, null, "Not a transaction alert.");
            }

            BigDecimal amount = parseAmount(parsed.amount());
            Direction direction = parseDirection(parsed.direction());
            if (amount == null || direction == null) {
                return finish(msg, ParseStatus.FAILED, "Missing or invalid amount/direction.", null);
            }

            Transaction t = new Transaction();
            t.setAmount(amount);
            t.setCurrency(
                parsed.currency() == null || parsed.currency().isBlank() ? "INR" : parsed.currency());
            t.setDirection(direction);
            t.setMerchant(parsed.merchant());
            t.setOccurredAt(resolveOccurredAt(parsed.occurredOn(), msg.getReceivedAt()));
            t.setSource(msg.getSource());
            t.setRawMessage(msg);
            t.setAccount(matchAccount(parsed.last4(), parsed.bank()));
            t.setCategory(transactions.findOrCreateCategory(
                parsed.category() == null || parsed.category().isBlank()
                    ? "Uncategorized"
                    : parsed.category().trim()));
            t.setDedupHash(
                dedupHasher.hash(parsed.last4(), t.getAmount(), t.getOccurredAt(), t.getMerchant()));

            Optional<Transaction> saved = transactions.save(t);
            if (saved.isEmpty()) {
                return finish(msg, ParseStatus.DUPLICATE, null, "Duplicate of an existing transaction.");
            }
            return finish(
                msg, ParseStatus.PARSED, saved.get().getId(), "Parsed and stored.");

        } catch (Exception e) {
            log.warn("Parse failed for raw message {}: {}", msg.getId(), e.getMessage());
            return finish(msg, ParseStatus.FAILED, e.getMessage(), null);
        }
    }

    private IngestResponse finish(RawMessage msg, ParseStatus status, Object detailOrTxnId, String detail) {
        // For PARSED, detailOrTxnId carries the transaction id; otherwise it's an error string.
        Long txnId = null;
        if (status == ParseStatus.PARSED && detailOrTxnId instanceof Long id) {
            txnId = id;
        } else if (status == ParseStatus.FAILED && detailOrTxnId instanceof String err) {
            msg.setError(err);
            detail = err;
        }
        msg.setStatus(status);
        rawMessages.save(msg);
        return new IngestResponse(msg.getId(), status, txnId, detail);
    }

    /** Match the parsed last-4 (and bank, when ambiguous) to a known account; null if none. */
    private Account matchAccount(String last4, String bank) {
        if (last4 == null || last4.isBlank()) {
            return null;
        }
        List<Account> matches = accounts.findByLast4(last4.trim());
        if (matches.size() == 1) {
            return matches.get(0);
        }
        if (matches.size() > 1 && bank != null) {
            return matches.stream()
                .filter(a -> a.getBank().equalsIgnoreCase(bank.trim()))
                .findFirst()
                .orElse(null);
        }
        return null;
    }

    private BigDecimal parseAmount(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            // strip currency symbols, commas, spaces; keep digits and decimal point
            String cleaned = raw.replaceAll("[^0-9.]", "");
            return cleaned.isEmpty() ? null : new BigDecimal(cleaned);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Direction parseDirection(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String v = raw.trim().toUpperCase();
        if (v.startsWith("DEBIT") || v.equals("DR") || v.equals("OUT")) {
            return Direction.DEBIT;
        }
        if (v.startsWith("CREDIT") || v.equals("CR") || v.equals("IN")) {
            return Direction.CREDIT;
        }
        return null;
    }

    private Instant resolveOccurredAt(String occurredOn, Instant fallback) {
        if (occurredOn == null || occurredOn.isBlank()) {
            return fallback;
        }
        try {
            return LocalDate.parse(occurredOn.trim()).atStartOfDay(ZoneOffset.UTC).toInstant();
        } catch (Exception e) {
            return fallback;
        }
    }
}
