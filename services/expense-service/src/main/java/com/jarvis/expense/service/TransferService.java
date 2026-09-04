package com.jarvis.expense.service;

import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.domain.Direction;
import com.jarvis.expense.domain.Transaction;
import com.jarvis.expense.repo.TransactionRepository;
import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Recognises transfers between the user's own accounts: a DEBIT on one account and a CREDIT of the
 * same amount on another within {@link #WINDOW}. Both rows are flagged so analytics leaves them out
 * of earning and spend (moving money from ICICI to SBI is neither).
 */
@Service
public class TransferService {

    /** How far apart the two sides may be dated (bank alerts and settlement can straddle midnight). */
    static final Duration WINDOW = Duration.ofDays(2);

    private final TransactionRepository transactions;

    public TransferService(TransactionRepository transactions) {
        this.transactions = transactions;
    }

    /**
     * Pair {@code t} with its other side if one exists; returns true when both got flagged.
     * Only bank (SAVINGS) accounts take part: a savings debit that lands on a credit card is the
     * card's bill payment, which is exactly how card spending is counted here (individual card
     * purchases are excluded from analytics), so it must stay a spend.
     */
    @Transactional
    public boolean pair(Transaction t) {
        if (!isBankAccount(t) || t.isTransfer()) {
            return false;
        }
        Direction other = t.getDirection() == Direction.DEBIT ? Direction.CREDIT : Direction.DEBIT;
        List<Transaction> candidates = transactions.findTransferCandidates(
            other, t.getAmount(), t.getAccount().getId(), t.getOccurredAt().minus(WINDOW), t.getOccurredAt().plus(WINDOW));
        Optional<Transaction> closest = candidates.stream()
            .filter(c -> !c.isTransfer() && isBankAccount(c))
            .min(Comparator.comparingLong(c -> Math.abs(Duration.between(c.getOccurredAt(), t.getOccurredAt()).toMillis())));
        if (closest.isEmpty()) {
            return false;
        }
        t.setTransfer(true);
        closest.get().setTransfer(true);
        transactions.save(t);
        transactions.save(closest.get());
        return true;
    }

    /** Recompute from scratch: clear every flag, then pair every linked row. Returns the number of pairs made. */
    @Transactional
    public int detectAll() {
        transactions.clearTransferFlags();
        int pairs = 0;
        for (Transaction t : transactions.findLinkedNotTransfer()) {
            if (!t.isTransfer() && pair(t)) {
                pairs++;
            }
        }
        return pairs;
    }

    private static boolean isBankAccount(Transaction t) {
        return t.getAccount() != null && t.getAccount().getType() == AccountType.SAVINGS;
    }
}
