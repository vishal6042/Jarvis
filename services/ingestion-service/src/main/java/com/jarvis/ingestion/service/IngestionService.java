package com.jarvis.ingestion.service;

import com.jarvis.ingestion.client.FinanceClient;
import java.util.List;
import com.jarvis.ingestion.web.dto.ReprocessResult;
import com.jarvis.common.security.CallerContext;
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
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;
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
    private final PayloadHasher payloadHasher;

    public IngestionService(
        RawMessageRepository rawMessages, AiClient ai, ExpenseClient expense, FinanceClient finance,
        PayloadHasher payloadHasher) {
        this.rawMessages = rawMessages;
        this.ai = ai;
        this.expense = expense;
        this.finance = finance;
        this.payloadHasher = payloadHasher;
    }

    /**
     * An earlier arrival in one of these states already counted: a transaction exists, or a
     * contribution was recorded. IGNORED and FAILED are left out on purpose -- they produced
     * nothing, so re-running them is harmless and may succeed after a parser improvement.
     */
    private static final Set<ParseStatus> ALREADY_COUNTED =
        EnumSet.of(ParseStatus.PARSED, ParseStatus.INVESTMENT, ParseStatus.DUPLICATE);

    @Transactional
    public IngestResponse ingest(IngestRequest req) {
        // Whoever forwarded this. An alert says which account by its last four digits, and those
        // digits must not be able to name an account the forwarder does not own — otherwise a
        // second person's phone could file spending against the first person's card.
        Long forwarder = CallerContext.restrictedTo();
        Instant receivedAt = req.receivedAt() == null ? Instant.now() : req.receivedAt();
        String hash = payloadHasher.hash(req.source(), req.sender(), req.payload(), receivedAt);

        RawMessage msg = new RawMessage();
        msg.setSource(req.source());
        msg.setPayload(req.payload());
        msg.setSender(req.sender());
        msg.setReceivedAt(receivedAt);
        msg.setPayloadHash(hash);

        // The phone forwards an alert live as it arrives, and the Inbox backfill can send the same
        // one again. Parsing is not deterministic, so the second run can produce a different dedup
        // hash in expense-service and slip a second transaction through. Catch the repeat here, on
        // the alert text, before the parser is ever called.
        Optional<RawMessage> earlier =
            rawMessages.findFirstByPayloadHashAndStatusInOrderByIdAsc(hash, ALREADY_COUNTED);
        if (earlier.isPresent()) {
            Long ref = earlier.get().getTransactionRef();
            msg.setStatus(ParseStatus.DUPLICATE);
            msg.setTransactionRef(ref);
            msg = rawMessages.save(msg);
            log.debug("Alert {} repeats raw message {} — not parsed again", msg.getId(), earlier.get().getId());
            return new IngestResponse(
                msg.getId(), ParseStatus.DUPLICATE, ref, "Already forwarded — counted once.");
        }

        msg.setStatus(ParseStatus.PENDING);
        msg = rawMessages.save(msg);
        return process(msg, forwarder).response();
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
            // The relink pass is an administrator's action and the stored alert does not record
            // who forwarded it, so it matches against the whole household as it always has.
            Outcome out = process(msg, null);
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

    /**
     * Parse → persist → record the outcome, for a raw message that is already stored.
     *
     * @param forwarder the member who sent it in, when they are confined to one; null matches
     *     against the whole household.
     */
    private Outcome process(RawMessage msg, Long forwarder) {
        try {
            // EPFO passbook alerts state the balance outright, so they update the PF investment
            // directly. They are caught before the noise gate, which rejects "passbook balance".
            AlertHints.EpfAlert epf = AlertHints.epfAlert(msg.getPayload());
            if (epf != null) {
                var pf = finance.findByLast4(epf.last4(), forwarder);
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
                    epf.dueMonth() != null ? epf.dueMonth() : msg.getReceivedAt().atZone(ZoneOffset.UTC).toLocalDate(),
                    forwarder);
                String detail = "EPF update for " + res.name()
                    + (res.applied() ? "" : " (already counted)") + " · balance ₹" + res.current().toPlainString();
                return new Outcome(finish(msg, ParseStatus.INVESTMENT, null, detail), null);
            }

            // NPS alerts either credit a monthly contribution or state the quarter's value. Both go
            // to the linked investment: the contribution adds to it, the valuation replaces it.
            AlertHints.NpsAlert nps = AlertHints.npsAlert(msg.getPayload());
            if (nps != null) {
                var pran = finance.findByLast4(nps.last4(), forwarder);
                if (pran.isEmpty()) {
                    return new Outcome(
                        finish(msg, ParseStatus.IGNORED, null,
                            "NPS alert for PRAN ending " + nps.last4() + " — no investment linked to it."),
                        null);
                }
                var res = finance.contribute(
                    pran.get().accountLast4(), nps.contribution(), nps.value(), nps.on(), forwarder);
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
                var linked = finance.findByLast4(last4, forwarder);
                if (linked.isPresent()) {
                    var res = finance.contribute(
                        linked.get().accountLast4(), amount, balanceAfter,
                        occurredAt.atZone(ZoneOffset.UTC).toLocalDate(), forwarder);
                    String detail = "Contribution to " + res.name()
                        + (res.applied() ? "" : " (already counted)") + " · value ₹" + res.current().toPlainString();
                    return new Outcome(finish(msg, ParseStatus.INVESTMENT, null, detail), null);
                }
            }

            // An EMI leaving for a linked loan: still a spend, but categorised as such and recorded
            // on the loan (payment count, last payment, outstanding when rate/balance are known).
            String category = parsed.category() == null || parsed.category().isBlank()
                ? "Uncategorized" : parsed.category().trim();
            String merchant = parsed.merchant();
            String loanNote = "";
            if ("DEBIT".equals(direction)) {
                var loan = finance.findLoan(AlertHints.loanAccountLast4(msg.getPayload()), last4, amount, forwarder);
                if (loan.isPresent()) {
                    category = "Loan EMI";
                    // One EMI, two alerts: SBI sends a generic debit ("Transferred to Mr. X",
                    // naming the loan's own holder) and, hours later, the standing-instruction
                    // confirmation ("to Loan A/c No.XXXXX432573"). Only the merchant text differs,
                    // so expense-service hashed them apart and stored the debit twice. Naming the
                    // loan gives both shapes one identity, and the second becomes a duplicate.
                    merchant = emiMerchant(loan.get());
                    var paid = finance.recordLoanPayment(
                        loan.get().id(), amount, occurredAt.atZone(ZoneOffset.UTC).toLocalDate(), forwarder);
                    loanNote = " · EMI to " + paid.lender() + " loan"
                        + (paid.applied() ? "" : " (already counted)")
                        + (paid.outstanding() != null && paid.outstanding().signum() > 0
                            ? " · outstanding ₹" + paid.outstanding().toPlainString() : "");
                }
            }

            var createReq = new ExpenseClient.CreateTransactionRequest(
                forwarder,
                null, // SMS path matches the account by last-4, not an explicit id
                last4,
                blankToNull(parsed.bank()),
                amount,
                parsed.currency() == null || parsed.currency().isBlank() ? "INR" : parsed.currency(),
                direction,
                merchant,
                category,
                occurredAt,
                msg.getSource().name(),
                String.valueOf(msg.getId()),
                balanceAfter,
                // The account on the other side, when the alert named it. expense-service decides
                // whether it is one of the household's own — it owns the account list.
                AlertHints.counterpartyLast4(msg.getPayload(), last4));
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

    /**
     * One stable name for every alert about the same loan's EMI, whatever wording the bank used.
     * The loan account digits keep two loans from the same lender apart; without them the loan id
     * does, since it is the thing being repaid either way.
     */
    private static String emiMerchant(FinanceClient.LinkedLoan loan) {
        String lender = loan.lender() == null || loan.lender().isBlank() ? "Loan" : loan.lender().trim();
        String ref = loan.loanAccountLast4() == null || loan.loanAccountLast4().isBlank()
            ? "#" + loan.id()
            : "••••" + loan.loanAccountLast4();
        return lender + " loan EMI " + ref;
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
