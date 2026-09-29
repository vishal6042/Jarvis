package com.jarvis.expense.service;

import com.jarvis.expense.domain.Transaction;
import com.jarvis.expense.repo.TransactionRepository;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * On start, convert any row still held in a foreign currency — those recorded before the ledger
 * kept everything in rupees, and any whose rate could not be fetched at the time.
 */
@Component
public class FxBackfill {

    private static final Logger log = LoggerFactory.getLogger(FxBackfill.class);

    private final TransactionRepository transactions;
    private final FxService fx;

    public FxBackfill(TransactionRepository transactions, FxService fx) {
        this.transactions = transactions;
        this.fx = fx;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void convertForeign() {
        List<Transaction> foreign = transactions.findByCurrencyNot(FxService.INR);
        for (Transaction t : foreign) {
            fx.toInr(t);
            if (FxService.INR.equals(t.getCurrency())) {
                log.info("Transaction {}: {} {} -> INR {}", t.getId(), t.getOriginalCurrency(), t.getOriginalAmount(), t.getAmount());
            }
        }
        transactions.saveAll(foreign);
    }
}
