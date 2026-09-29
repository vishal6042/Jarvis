package com.jarvis.expense.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.jarvis.expense.domain.Transaction;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class FxServiceTest {

    // Nothing listens there, so every lookup falls back to the configured rate.
    private static final String OFFLINE = "http://127.0.0.1:9/v1";

    private static Transaction txn(String amount, String currency) {
        Transaction t = new Transaction();
        t.setAmount(new BigDecimal(amount));
        t.setCurrency(currency);
        t.setOccurredAt(Instant.parse("2026-09-27T00:00:00Z"));
        return t;
    }

    @Test
    void foreignAmountBecomesRupeesAndKeepsTheOriginal() {
        FxService fx = new FxService(OFFLINE, BigDecimal.ZERO, new BigDecimal("95.80"));
        Transaction t = txn("118.00", "usd");
        fx.toInr(t);
        assertEquals("INR", t.getCurrency());
        assertEquals(new BigDecimal("11304.40"), t.getAmount());
        assertEquals(new BigDecimal("118.00"), t.getOriginalAmount());
        assertEquals("USD", t.getOriginalCurrency());
    }

    @Test
    void bankMarkupIsAddedOnTop() {
        FxService fx = new FxService(OFFLINE, new BigDecimal("3.5"), new BigDecimal("100"));
        Transaction t = txn("10.00", "USD");
        fx.toInr(t);
        assertEquals(new BigDecimal("1035.00"), t.getAmount());
    }

    @Test
    void rupeesAndUnknownCurrenciesAreLeftAlone() {
        FxService fx = new FxService(OFFLINE, BigDecimal.ZERO, new BigDecimal("95.80"));
        Transaction inr = txn("500.00", "INR");
        fx.toInr(inr);
        assertEquals(new BigDecimal("500.00"), inr.getAmount());
        assertNull(inr.getOriginalCurrency());

        Transaction jpy = txn("1000.00", "JPY");
        fx.toInr(jpy);
        assertEquals("JPY", jpy.getCurrency());
        assertEquals(new BigDecimal("1000.00"), jpy.getAmount());
    }
}
