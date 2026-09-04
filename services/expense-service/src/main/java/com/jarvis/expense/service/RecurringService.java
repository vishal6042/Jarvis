package com.jarvis.expense.service;

import com.jarvis.expense.domain.Transaction;
import com.jarvis.expense.repo.TransactionRepository;
import com.jarvis.expense.web.dto.RecurringPayment;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Detects recurring payments / subscriptions from transaction history: groups DEBITs by a normalized
 * merchant name and keeps those that recur on a regular cadence (weekly / monthly / quarterly /
 * yearly). Purely rule-based over the last few months of data — no external services.
 */
@Service
public class RecurringService {

    private static final int LOOKBACK_MONTHS = 6;
    private static final int MIN_OCCURRENCES = 3;

    private final TransactionRepository transactions;

    public RecurringService(TransactionRepository transactions) {
        this.transactions = transactions;
    }

    @Transactional(readOnly = true)
    public List<RecurringPayment> detect() {
        ZoneId zone = ZoneId.systemDefault();
        Instant from = LocalDate.now(zone).minusMonths(LOOKBACK_MONTHS).atStartOfDay(zone).toInstant();

        Map<String, List<Transaction>> groups = new LinkedHashMap<>();
        for (Transaction t : transactions.findDebitsSince(from)) {
            String category = t.getCategory() != null ? t.getCategory().getName() : null;
            if ("Card Payment".equals(category)) {
                continue; // a transfer to the card, not a subscription
            }
            String key = normalize(t.getMerchant());
            if (key == null) {
                continue;
            }
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(t);
        }

        List<RecurringPayment> out = new ArrayList<>();
        for (List<Transaction> list : groups.values()) {
            if (list.size() < MIN_OCCURRENCES) {
                continue;
            }
            list.sort(Comparator.comparing(Transaction::getOccurredAt));

            List<Long> gaps = new ArrayList<>();
            for (int i = 1; i < list.size(); i++) {
                gaps.add(Duration.between(list.get(i - 1).getOccurredAt(), list.get(i).getOccurredAt()).toDays());
            }
            long median = median(gaps);
            String cadence = cadenceLabel(median);
            if (cadence == null || !regular(gaps, median)) {
                continue;
            }

            BigDecimal avg = list.stream()
                .map(Transaction::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(list.size()), 2, RoundingMode.HALF_UP);

            Transaction last = list.get(list.size() - 1);
            LocalDate lastPaid = last.getOccurredAt().atZone(zone).toLocalDate();
            LocalDate nextExpected = lastPaid.plusDays(median);
            BigDecimal monthly = avg
                .multiply(BigDecimal.valueOf(30.0 / Math.max(1, median)))
                .setScale(0, RoundingMode.HALF_UP);
            String category = last.getCategory() != null ? last.getCategory().getName() : null;

            out.add(new RecurringPayment(
                last.getMerchant(), category, avg, cadence, lastPaid, nextExpected, list.size(), monthly));
        }

        out.sort(Comparator.comparing(RecurringPayment::monthlyEstimate).reversed());
        return out;
    }

    /** Collapse a raw narration to a stable key: lowercase, drop digits/punctuation, first 4 words. */
    private static String normalize(String merchant) {
        if (merchant == null) {
            return null;
        }
        String cleaned = merchant.toLowerCase()
            .replaceAll("[^a-z ]", " ")
            .replaceAll("\\s+", " ")
            .trim();
        if (cleaned.length() < 3) {
            return null;
        }
        String[] words = cleaned.split(" ");
        StringBuilder key = new StringBuilder();
        for (int i = 0; i < Math.min(4, words.length); i++) {
            if (words[i].length() < 2) {
                continue; // skip stray single letters
            }
            key.append(words[i]).append(' ');
        }
        String result = key.toString().trim();
        return result.length() < 3 ? null : result;
    }

    private static String cadenceLabel(long medianDays) {
        if (medianDays >= 6 && medianDays <= 8) return "Weekly";
        if (medianDays >= 25 && medianDays <= 35) return "Monthly";
        if (medianDays >= 84 && medianDays <= 96) return "Quarterly";
        if (medianDays >= 350 && medianDays <= 380) return "Yearly";
        return null;
    }

    /** Most gaps should sit near the median — filters out merchants that just happen to repeat. */
    private static boolean regular(List<Long> gaps, long median) {
        long tolerance = Math.max(5, Math.round(median * 0.35));
        long near = gaps.stream().filter(g -> Math.abs(g - median) <= tolerance).count();
        return near * 2 >= gaps.size(); // at least half the intervals are regular
    }

    private static long median(List<Long> values) {
        List<Long> sorted = new ArrayList<>(values);
        sorted.sort(Comparator.naturalOrder());
        int n = sorted.size();
        if (n == 0) {
            return 0;
        }
        return n % 2 == 1 ? sorted.get(n / 2) : (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2;
    }
}
