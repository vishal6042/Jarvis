package com.jarvis.ingestion.service;

import com.jarvis.ingestion.client.FinanceClient;
import java.util.List;
import com.jarvis.ingestion.web.dto.ReprocessResult;
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
    private final FinanceClient finance;

    public IngestionService(
        RawMessageRepository rawMessages, AiClient ai, ExpenseClient expense, FinanceClient finance) {
        this.rawMessages = rawMessages;
        this.ai = ai;
        this.expense = expense;
        this.finance = finance;
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
        return process(msg).response();
    }

    /** The pipeline result plus the account it landed on (null when unmatched) — for the relink pass. */
    private record Outcome(IngestResponse response, Long accountId) {}

    /**
     * Re-run alerts whose transaction has no account (e.g. ingested before suffix matching existed):
     * delete the orphan row, then push the stored raw message through the pipeline again.
     */
    public ReprocessResult reprocessUnlinked() {
        List<Long> orphanIds = expense.unlinkedTransactionIds();
        List<RawMessage> msgs = orphanIds.isEmpty() ? List.of() : rawMessages.findByTransactionRefIn(orphanIds);
        int relinked = 0, stillUnlinked = 0, duplicate = 0, ignored = 0, failed = 0, investment = 0;
        for (RawMessage msg : msgs) {
            try {
                expense.delete(msg.getTransactionRef());
            } catch (Exception e) {
                log.warn("Could not delete orphan transaction {}: {}", msg.getTransactionRef(), e.getMessage());
                failed++;
                continue;
            }
            msg.setTransactionRef(null);
            msg.setError(null);
            Outcome out = process(msg);
            switch (out.response().status()) {
                case PARSED -> { if (out.accountId() != null) relinked++; else stillUnlinked++; }
                case DUPLICATE -> duplicate++;
                case IGNORED -> ignored++;
                case INVESTMENT -> investment++;
                default -> failed++;
            }
        }
        log.info("Relink pass: {} examined, {} relinked, {} still unlinked, {} duplicate, {} ignored, {} failed, {} investment",
            msgs.size(), relinked, stillUnlinked, duplicate, ignored, failed, investment);
        return new ReprocessResult(msgs.size(), relinked, stillUnlinked, duplicate, ignored, failed, investment);
    }

    /** Parse → persist → record the outcome, for a raw message that is already stored. */
    private Outcome process(RawMessage msg) {
        try {
            // EPFO passbook alerts state the balance outright, so they update the PF investment
            // directly. They are caught before the noise gate, which rejects "passbook balance".
            AlertHints.EpfAlert epf = AlertHints.epfAlert(msg.getPayload());
            if (epf != null) {
                var pf = finance.findByLast4(epf.last4());
                if (pf.isEmpty()) {
                    return new Outcome(
                        finish(msg, ParseStatus.IGNORED, null,
                            "EPF passbook update for account ending " + epf.last4() + " — no investment linked to it."),
                        null);
                }
                var res = finance.contribute(
                    pf.get().accountLast4(),
                    epf.contribution(),
                    epf.balance(),
                    epf.dueMonth() != null ? epf.dueMonth() : msg.getReceivedAt().atZone(ZoneOffset.UTC).toLocalDate());
                String detail = "EPF update for " + res.name()
                    + (res.applied() ? "" : " (already counted)") + " · balance ₹" + res.current().toPlainString();
                return new Outcome(finish(msg, ParseStatus.INVESTMENT, null, detail), null);
            }

            // NPS alerts either credit a monthly contribution or state the quarter's value. Both go
            // to the linked investment: the contribution adds to it, the valuation replaces it.
            AlertHints.NpsAlert nps = AlertHints.npsAlert(msg.getPayload());
            if (nps != null) {
                var pran = finance.findByLast4(nps.last4());
                if (pran.isEmpty()) {
                    return new Outcome(
                        finish(msg, ParseStatus.IGNORED, null,
                            "NPS alert for PRAN ending " + nps.last4() + " — no investment linked to it."),
                        null);
                }
                var res = finance.contribute(pran.get().accountLast4(), nps.contribution(), nps.value(), nps.on());
                String detail = (nps.value() != null ? "NPS valuation for " : "NPS contribution to ") + res.name()
                    + (res.applied() || nps.value() != null ? "" : " (already counted)")
                    + " · value ₹" + res.current().toPlainString();
                return new Outcome(finish(msg, ParseStatus.INVESTMENT, null, detail), null);
            }

            if (AlertHints.isNotATransaction(msg.getPayload())) {
                return new Outcome(
                    finish(msg, ParseStatus.IGNORED, null, "Not a bank transaction alert (wallet / statement / notice)."),
                    null);
            }
            AiClient.ParsedTransaction parsed = ai.parse(msg.getPayload());

            if (parsed == null || !parsed.isTransaction()) {
                return new Outcome(finish(msg, ParseStatus.IGNORED, null, "Not a transaction alert."), null);
            }

            BigDecimal amount = parseAmount(parsed.amount());
            String direction = parseDirection(parsed.direction());
            if (amount == null || direction == null) {
                return new Outcome(finish(msg, ParseStatus.FAILED, null, "Missing or invalid amount/direction."), null);
            }

            String last4 = AlertHints.last4Hint(parsed.last4(), msg.getPayload()); // model digits, else from the text
            BigDecimal balanceAfter = AlertHints.balanceHint(parsed.balanceAfter(), msg.getPayload());
            Instant occurredAt = resolveOccurredAt(parsed.occurredOn(), msg.getReceivedAt());

            // Money going INTO an account linked to an investment (post office RD, PPF …) is a
            // contribution: record it on the investment instead of creating a transaction.
            if ("CREDIT".equals(direction)) {
                var linked = finance.findByLast4(last4);
                if (linked.isPresent()) {
                    var res = finance.contribute(
                        linked.get().accountLast4(), amount, balanceAfter, occurredAt.atZone(ZoneOffset.UTC).toLocalDate());
                    String detail = "Contribution to " + res.name()
                        + (res.applied() ? "" : " (already counted)") + " · value ₹" + res.current().toPlainString();
                    return new Outcome(finish(msg, ParseStatus.INVESTMENT, null, detail), null);
                }
            }

            // An EMI leaving for a linked loan: still a spend, but categorised as such and recorded
            // on the loan (payment count, last payment, outstanding when rate/balance are known).
            String category = parsed.category() == null || parsed.category().isBlank()
                ? "Uncategorized" : parsed.category().trim();
            String loanNote = "";
            if ("DEBIT".equals(direction)) {
                var loan = finance.findLoan(AlertHints.loanAccountLast4(msg.getPayload()), last4, amount);
                if (loan.isPresent()) {
                    category = "Loan EMI";
                    var paid = finance.recordLoanPayment(
                        loan.get().id(), amount, occurredAt.atZone(ZoneOffset.UTC).toLocalDate());
                    loanNote = " · EMI to " + paid.lender() + " loan"
                        + (paid.applied() ? "" : " (already counted)")
                        + (paid.outstanding() != null && paid.outstanding().signum() > 0
                            ? " · outstanding ₹" + paid.outstanding().toPlainString() : "");
                }
            }

            var createReq = new ExpenseClient.CreateTransactionRequest(
                null, // SMS path matches the account by last-4, not an explicit id
                last4,
                blankToNull(parsed.bank()),
                amount,
                parsed.currency() == null || parsed.currency().isBlank() ? "INR" : parsed.currency(),
                direction,
                parsed.merchant(),
                category,
                occurredAt,
                msg.getSource().name(),
                String.valueOf(msg.getId()),
                balanceAfter);
            ExpenseClient.CreateResult result = expense.create(createReq);
            if (!result.created()) {
                return new Outcome(finish(msg, ParseStatus.DUPLICATE, null, "Duplicate of an existing transaction."), null);
            }
            msg.setTransactionRef(result.transactionId());
            String detail = (result.accountId() != null ? "Parsed and stored" : "Parsed and stored (no matching account)")
                + loanNote + ".";
            return new Outcome(finish(msg, ParseStatus.PARSED, result.transactionId(), detail), result.accountId());
        } catch (Exception e) {
            log.warn("Ingest failed for raw message {}: {}", msg.getId(), e.getMessage());
            return new Outcome(finish(msg, ParseStatus.FAILED, null, e.getMessage()), null);
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
