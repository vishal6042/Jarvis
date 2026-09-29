package com.jarvis.expense.service;

import com.jarvis.expense.domain.Account;
import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.domain.Category;
import com.jarvis.expense.domain.Direction;
import com.jarvis.expense.domain.MessageSource;
import com.jarvis.expense.domain.Transaction;
import com.jarvis.expense.repo.AccountRepository;
import com.jarvis.expense.repo.CategoryRepository;
import com.jarvis.expense.repo.TransactionRepository;
import com.jarvis.expense.web.dto.TransactionDto;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Card bills a person says they have paid, before or without the bank's alert.
 *
 * <p>The payment is a CREDIT on the card, flagged as a settlement from the start: an unflagged
 * credit on a card reads as a refund, which would lower the month's spend instead of paying the
 * bill. If the savings debit it was paid from is already in the ledger the two are paired as any
 * settlement is; if not, the row is declared, so it counts as paid meanwhile and the pairing
 * pass keeps it. When the bank's "payment received" alert arrives later it confirms this row
 * rather than adding a second payment.
 */
@Service
public class CardPaymentService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    static final String MERCHANT = "Bill payment (marked paid)";
    /** An alert may come a few days after the person marked it, or a day or two before. */
    private static final Duration CONFIRM_BEFORE = Duration.ofDays(10);
    private static final Duration CONFIRM_AFTER = Duration.ofDays(3);

    private final TransactionRepository transactions;
    private final AccountRepository accounts;
    private final CategoryRepository categories;
    private final TransferService transfers;
    private final Scope scope;

    public CardPaymentService(
        TransactionRepository transactions,
        AccountRepository accounts,
        CategoryRepository categories,
        TransferService transfers,
        Scope scope) {
        this.transactions = transactions;
        this.accounts = accounts;
        this.categories = categories;
        this.transfers = transfers;
        this.scope = scope;
    }

    /** Record {@code amount} paid towards the bill of the card {@code accountId} on {@code paidOn}. */
    @Transactional
    public TransactionDto record(Long accountId, BigDecimal amount, LocalDate paidOn) {
        Account card = accounts.findById(accountId)
            .filter(scope::canSee)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown card"));
        if (card.getType() != AccountType.CREDIT_CARD) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only a credit card has a bill to pay");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The amount paid must be more than zero");
        }
        LocalDate today = LocalDate.now(IST);
        LocalDate day = paidOn == null ? today : paidOn;
        if (day.isAfter(today)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A payment cannot be dated in the future");
        }

        Transaction t = new Transaction();
        t.setAccount(card);
        t.setAmount(amount);
        t.setDirection(Direction.CREDIT);
        t.setMerchant(MERCHANT);
        t.setCategory(cardPayment());
        t.setSource(MessageSource.MANUAL);
        // Today's payment at the time it was marked; an earlier one at midday, so it sits on its date.
        t.setOccurredAt(day.equals(today) ? Instant.now() : day.atTime(LocalTime.NOON).atZone(IST).toInstant());
        t = transactions.save(t);

        if (!transfers.pair(t)) {
            t.setSettlement(true);
            t.setSettlementDeclared(true);
            t = transactions.save(t);
        }
        return TransactionDto.from(t);
    }

    /** Take back a payment marked by hand. Pairing is recomputed so its savings side is spend again. */
    @Transactional
    public void undo(Long transactionId) {
        Transaction t = transactions.findById(transactionId)
            .filter(x -> x.getAccount() != null && scope.canSee(x.getAccount()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment not found"));
        if (t.getSource() != MessageSource.MANUAL || t.getDirection() != Direction.CREDIT
            || t.getAccount().getType() != AccountType.CREDIT_CARD) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only a payment marked by hand can be undone here");
        }
        boolean paired = t.isSettlement() && !t.isSettlementDeclared();
        transactions.delete(t);
        transactions.flush();
        if (paired) {
            // Its savings debit is still flagged as a settlement; recomputing puts it back as spend.
            transfers.detectAll();
        }
    }

    /**
     * An alert crediting a card that confirms a payment already marked by hand — the same amount on
     * a card billed on the same statement, around the same day. The hand-made row takes the alert's
     * details and is kept; the alert does not become a second payment. Empty when nothing matches.
     */
    @Transactional
    public Optional<Transaction> confirm(Transaction incoming) {
        Account card = incoming.getAccount();
        if (card == null || card.getType() != AccountType.CREDIT_CARD || incoming.getDirection() != Direction.CREDIT
            || incoming.getAmount() == null) {
            return Optional.empty();
        }
        List<Long> statementCards = card.getBillingGroup() == null
            ? List.of(card.getId())
            : accounts.findAll().stream()
                .filter(a -> card.getBillingGroup().equals(a.getBillingGroup()))
                .map(Account::getId)
                .toList();
        Instant at = incoming.getOccurredAt() == null ? Instant.now() : incoming.getOccurredAt();
        Optional<Transaction> match = transactions.findManualCardPayments(
                statementCards,
                incoming.getAmount().subtract(BigDecimal.ONE),
                incoming.getAmount().add(BigDecimal.ONE),
                at.minus(CONFIRM_BEFORE),
                at.plus(CONFIRM_AFTER))
            .stream()
            .findFirst();
        match.ifPresent(m -> {
            m.setMerchant(incoming.getMerchant());
            m.setSource(incoming.getSource());
            m.setSourceRef(incoming.getSourceRef());
            m.setOccurredAt(at);
            m.setAccount(card);
            transactions.save(m);
        });
        return match;
    }

    private Category cardPayment() {
        return categories.findByNameIgnoreCase(TransferService.CARD_PAYMENT)
            .orElseGet(() -> categories.save(new Category(TransferService.CARD_PAYMENT)));
    }
}
