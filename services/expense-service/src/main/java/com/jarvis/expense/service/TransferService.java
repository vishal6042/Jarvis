package com.jarvis.expense.service;

import com.jarvis.expense.domain.Account;
import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.domain.Category;
import com.jarvis.expense.domain.Direction;
import com.jarvis.expense.domain.Transaction;
import com.jarvis.expense.repo.AccountRepository;
import com.jarvis.expense.repo.CategoryRepository;
import com.jarvis.expense.repo.TransactionRepository;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Recognises money moving between the user's own accounts and flags both rows so analytics
 * leaves them out:
 * <ul>
 *   <li><b>transfer</b> — a DEBIT on one bank account and a CREDIT of the same amount on another
 *       bank account within {@link #WINDOW} (ICICI → SBI is neither earning nor spend), or, when
 *       only one bank's alert ever arrives, a debit whose alert named a household account as the
 *       side it credited (see {@link #markSelfTransfer});</li>
 *   <li><b>settlement</b> — a savings DEBIT and a credit-card CREDIT of the same amount: the card
 *       bill being paid. Both sides are categorised "Card Payment". The card's own purchases are
 *       the real spend, so the bill payment must not be counted as well.</li>
 * </ul>
 */
@Service
public class TransferService {

    /** How far apart the two sides may be dated (bank alerts and settlement can straddle midnight). */
    static final Duration WINDOW = Duration.ofDays(2);
    static final String CARD_PAYMENT = "Card Payment";

    private final TransactionRepository transactions;
    private final CategoryRepository categories;
    private final AccountRepository accounts;

    public TransferService(
        TransactionRepository transactions, CategoryRepository categories, AccountRepository accounts) {
        this.transactions = transactions;
        this.categories = categories;
        this.accounts = accounts;
    }

    /**
     * Recognise an own-account move on a freshly ingested row: pair it with its other side when
     * both banks' alerts reached the ledger, and otherwise fall back to the account the alert
     * itself named as credited. Returns true when the row was flagged.
     */
    @Transactional
    public boolean reconcile(Transaction t, String counterpartyLast4) {
        return pair(t) || markSelfTransfer(t, counterpartyLast4);
    }

    /**
     * Flag a row as an own-account transfer because its alert named the other side: "ICICI Bank
     * Acct XX380 debited with Rs 70,000.00 & Acct XX971 credited", where XX971 is the household's
     * SBI account. {@link #pair} needs both banks to have sent an alert; this needs only the one,
     * so the move is still recognised when the second never arrives — the case that left an
     * ICICI → SBI transfer counted as spending.
     *
     * <p>Only savings accounts count. A debit that lands on a credit card is the bill being paid,
     * which is a settlement, and pairing already gives that its own treatment.
     */
    @Transactional
    public boolean markSelfTransfer(Transaction t, String counterpartyLast4) {
        if (t == null || counterpartyLast4 == null || t.isTransfer() || t.isSettlement() || !isBank(t)) {
            return false;
        }
        if (ownSavingsAccount(counterpartyLast4, t.getAccount()).isEmpty()) {
            return false;
        }
        t.setTransfer(true);
        // Pairing recomputes `transfer` from scratch and could never re-derive this one, since the
        // other side may not be in the ledger at all. Recording it as a declaration is what carries
        // it through a backfill — the same reason a hand-marked transfer is kept separately.
        t.setTransferDeclared(true);
        transactions.save(t);
        return true;
    }

    /**
     * The household savings account these digits name, other than {@code subject}. Not confined to
     * the alert's owner: moving money to a spouse's account keeps it in the household, so it is a
     * transfer rather than spending. Ambiguous digits match nothing.
     */
    private Optional<Account> ownSavingsAccount(String digits, Account subject) {
        List<Account> matches = accounts.findByLast4(digits);
        if (matches.isEmpty() && digits.length() < 4 && digits.chars().allMatch(Character::isDigit)) {
            matches = accounts.findAll().stream()
                .filter(a -> a.getLast4() != null && a.getLast4().endsWith(digits))
                .toList();
        }
        List<Account> others = matches.stream()
            .filter(a -> a.getType() == AccountType.SAVINGS)
            .filter(a -> subject == null || subject.getId() == null || !subject.getId().equals(a.getId()))
            .toList();
        return others.size() == 1 ? Optional.of(others.get(0)) : Optional.empty();
    }

    /** Pair {@code t} with its other side if one exists; returns true when both got flagged. */
    @Transactional
    public boolean pair(Transaction t) {
        if (t.getAccount() == null || t.isTransfer() || t.isSettlement()) {
            return false;
        }
        Direction other = t.getDirection() == Direction.DEBIT ? Direction.CREDIT : Direction.DEBIT;
        List<Transaction> candidates = transactions.findTransferCandidates(
            other, t.getAmount(), t.getAccount().getId(), t.getOccurredAt().minus(WINDOW), t.getOccurredAt().plus(WINDOW));
        Optional<Transaction> closest = candidates.stream()
            // A declared self-transfer stays eligible: it was flagged from one bank's alert alone,
            // and when the other bank's does arrive that side has to be flagged too — otherwise
            // the credit half of a move between own accounts is counted as earning.
            .filter(c -> (!c.isTransfer() || c.isTransferDeclared()) && !c.isSettlement() && kindOf(t, c) != Kind.NONE)
            .min(Comparator.comparingLong(c -> Math.abs(Duration.between(c.getOccurredAt(), t.getOccurredAt()).toMillis())));
        if (closest.isEmpty()) {
            return false;
        }
        Transaction c = closest.get();
        if (kindOf(t, c) == Kind.TRANSFER) {
            t.setTransfer(true);
            c.setTransfer(true);
        } else {
            Category cardPayment = cardPaymentCategory();
            t.setSettlement(true);
            c.setSettlement(true);
            t.setCategory(cardPayment);
            c.setCategory(cardPayment);
        }
        transactions.save(t);
        transactions.save(c);
        return true;
    }

    /** Recompute from scratch: clear every flag, then pair every linked row. Returns the number of pairs made. */
    @Transactional
    public int detectAll() {
        transactions.clearTransferFlags();
        int pairs = 0;
        for (Transaction t : transactions.findLinkedNotTransfer()) {
            if (!t.isTransfer() && !t.isSettlement() && pair(t)) {
                pairs++;
            }
        }
        // Pairing runs first so a declared row can still be matched to its other side; the
        // declarations that found no pair are restored afterwards.
        transactions.applyDeclaredTransfers();
        return pairs;
    }

    enum Kind { NONE, TRANSFER, SETTLEMENT }

    /** What a (debit, credit) pair across two accounts represents. */
    static Kind kindOf(Transaction a, Transaction b) {
        Transaction debit = a.getDirection() == Direction.DEBIT ? a : b;
        Transaction credit = a.getDirection() == Direction.DEBIT ? b : a;
        if (debit.getDirection() != Direction.DEBIT || credit.getDirection() != Direction.CREDIT) {
            return Kind.NONE;
        }
        if (isBank(debit) && isBank(credit)) {
            return Kind.TRANSFER;
        }
        if (isBank(debit) && isCard(credit)) {
            return Kind.SETTLEMENT;
        }
        return Kind.NONE;
    }

    private static boolean isBank(Transaction t) {
        return t.getAccount() != null && t.getAccount().getType() == AccountType.SAVINGS;
    }

    private static boolean isCard(Transaction t) {
        return t.getAccount() != null
            && (t.getAccount().getType() == AccountType.CREDIT_CARD || t.getAccount().getType() == AccountType.DEBIT_CARD);
    }

    private Category cardPaymentCategory() {
        return categories.findByNameIgnoreCase(CARD_PAYMENT).orElseGet(() -> {
            Category c = new Category();
            c.setName(CARD_PAYMENT);
            return categories.save(c);
        });
    }
}
