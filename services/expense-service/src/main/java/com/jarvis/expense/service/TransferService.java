package com.jarvis.expense.service;

import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.domain.Category;
import com.jarvis.expense.domain.Direction;
import com.jarvis.expense.domain.Transaction;
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
 *       bank account within {@link #WINDOW} (ICICI → SBI is neither earning nor spend);</li>
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

    public TransferService(TransactionRepository transactions, CategoryRepository categories) {
        this.transactions = transactions;
        this.categories = categories;
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
            .filter(c -> !c.isTransfer() && !c.isSettlement() && kindOf(t, c) != Kind.NONE)
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
