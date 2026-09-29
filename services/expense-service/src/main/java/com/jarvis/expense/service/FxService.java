package com.jarvis.expense.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.jarvis.expense.domain.Transaction;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Turns a foreign-currency amount into the rupees a card is billed. Rates are the ECB reference
 * rate for the transaction's day (frankfurter.dev — free, no key), cached per currency and day;
 * without the network a configured fallback rate stands in, so ingestion never stalls on it.
 * The bank's own forex markup is added on top when one is configured.
 */
@Service
public class FxService {

    private static final Logger log = LoggerFactory.getLogger(FxService.class);
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    public static final String INR = "INR";

    private final RestClient http;
    private final BigDecimal markup;
    private final Map<String, BigDecimal> fallback;
    private final Map<String, BigDecimal> cache = new ConcurrentHashMap<>();

    public FxService(
        @Value("${jarvis.fx.base-url:https://api.frankfurter.dev/v1}") String baseUrl,
        @Value("${jarvis.fx.markup-pct:0}") BigDecimal markupPct,
        @Value("${jarvis.fx.fallback-usd:95.8}") BigDecimal fallbackUsd) {
        this.http = RestClient.builder().baseUrl(baseUrl).build();
        this.markup = BigDecimal.ONE.add(markupPct.movePointLeft(2));
        // Rough September 2026 levels — only used when the rate service cannot be reached.
        this.fallback = Map.of(
            "USD", fallbackUsd,
            "EUR", new BigDecimal("112"),
            "GBP", new BigDecimal("129"),
            "SGD", new BigDecimal("74"),
            "AED", new BigDecimal("26.1"));
    }

    /**
     * Rewrite a transaction recorded in a foreign currency so its amount is rupees, keeping what
     * the merchant charged in the original fields. A no-op for INR, or when no rate is known.
     */
    public void toInr(Transaction t) {
        String currency = t.getCurrency() == null ? INR : t.getCurrency().trim().toUpperCase(Locale.ROOT);
        if (INR.equals(currency) || t.getAmount() == null) {
            return;
        }
        BigDecimal rate = rate(currency, t.getOccurredAt());
        if (rate == null) {
            log.warn("No {}->INR rate; transaction {} left in {}", currency, t.getId(), currency);
            return;
        }
        t.setOriginalAmount(t.getAmount());
        t.setOriginalCurrency(currency);
        t.setAmount(t.getAmount().multiply(rate).multiply(markup).setScale(2, RoundingMode.HALF_UP));
        t.setCurrency(INR);
    }

    /** Rupees per unit of {@code currency} on the day of {@code at}, or null when unknown. */
    BigDecimal rate(String currency, Instant at) {
        LocalDate day = (at == null ? Instant.now() : at).atZone(IST).toLocalDate();
        if (day.isAfter(LocalDate.now(IST))) {
            day = LocalDate.now(IST);
        }
        String key = currency + "@" + day;
        BigDecimal cached = cache.get(key);
        if (cached != null) {
            return cached;
        }
        try {
            // A weekend or holiday answers with the last business day's rate.
            JsonNode body = http.get()
                .uri("/{day}?base={c}&symbols=INR", day, currency)
                .retrieve()
                .body(JsonNode.class);
            JsonNode inr = body == null ? null : body.path("rates").path(INR);
            if (inr != null && inr.isNumber()) {
                BigDecimal rate = inr.decimalValue();
                cache.put(key, rate);
                return rate;
            }
        } catch (Exception e) {
            log.warn("FX lookup {} on {} failed: {}", currency, day, e.getMessage());
        }
        return fallback.get(currency);
    }
}
