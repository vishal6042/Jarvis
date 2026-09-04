package com.jarvis.expense.service;

import com.jarvis.expense.domain.Account;
import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.domain.Direction;
import com.jarvis.expense.domain.Transaction;
import com.jarvis.expense.repo.AccountRepository;
import com.jarvis.expense.repo.TransactionRepository;
import com.jarvis.expense.web.dto.CategorySpend;
import com.jarvis.expense.web.dto.NetWorthPoint;
import com.jarvis.expense.web.dto.PeriodSummary;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read-only spend/earning aggregates, consumed by the frontend and the AI query agent's tools. */
@Service
public class AnalyticsService {

    private final TransactionRepository transactions;
    private final AccountRepository accounts;

    public AnalyticsService(TransactionRepository transactions, AccountRepository accounts) {
        this.transactions = transactions;
        this.accounts = accounts;
    }

    @Transactional(readOnly = true)
    public PeriodSummary summary(Instant from, Instant to) {
        // Earning = money into savings. Spend = every purchase, whether from savings or on a card.
        // Card bill payments are "settlement" pairs and own-account moves are "transfer" pairs —
        // both excluded, so nothing is counted twice.
        BigDecimal earning = transactions.sumByDirectionAndAccountType(Direction.CREDIT, AccountType.SAVINGS, from, to);
        BigDecimal spend = transactions.sumByDirectionAndAccountTypes(
            Direction.DEBIT, List.of(AccountType.SAVINGS, AccountType.CREDIT_CARD, AccountType.DEBIT_CARD), from, to);
        return new PeriodSummary(from, to, earning, spend);
    }

    @Transactional(readOnly = true)
    public List<CategorySpend> spendByCategory(Instant from, Instant to) {
        // Itemized real spending across savings + card, minus the "Card Payment" (bill-payment) rows.
        return transactions.spendByCategoryDetail(from, to).stream()
            .map(row -> new CategorySpend((String) row[0], (BigDecimal) row[1]))
            .toList();
    }

    @Transactional(readOnly = true)
    public List<CategorySpend> incomeBySource(Instant from, Instant to) {
        // Money into the savings account (CREDITs), grouped by category → income sources.
        return transactions.incomeBySourceDetail(from, to).stream()
            .map(row -> new CategorySpend((String) row[0], (BigDecimal) row[1]))
            .toList();
    }

    /**
     * Net-worth (savings cash) at the end of each of the last {@code months} calendar months.
     * The latest point is the real current savings balance; earlier points are reconstructed by
     * removing each subsequent month's net savings flow (CREDIT − DEBIT) — so the curve is anchored
     * to today's actual balance rather than an unknown opening balance.
     */
    @Transactional(readOnly = true)
    public List<NetWorthPoint> netWorthTrend(int months) {
        int span = Math.max(1, Math.min(months, 36));
        ZoneId zone = ZoneId.systemDefault();
        YearMonth current = YearMonth.now(zone);
        YearMonth start = current.minusMonths(span - 1L);
        Instant from = start.atDay(1).atStartOfDay(zone).toInstant();
        Instant to = current.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant();

        // Net savings flow per month within the window.
        Map<YearMonth, BigDecimal> flow = new HashMap<>();
        for (Transaction t : transactions.findSavingsBetween(from, to)) {
            YearMonth ym = YearMonth.from(t.getOccurredAt().atZone(zone));
            BigDecimal signed = t.getDirection() == Direction.CREDIT ? t.getAmount() : t.getAmount().negate();
            flow.merge(ym, signed, BigDecimal::add);
        }

        BigDecimal currentBalance = accounts.findAll().stream()
            .filter(a -> a.getType() == AccountType.SAVINGS && a.getBalance() != null)
            .map(Account::getBalance)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<YearMonth> monthList = new ArrayList<>();
        for (YearMonth m = start; !m.isAfter(current); m = m.plusMonths(1)) {
            monthList.add(m);
        }

        BigDecimal[] endBalance = new BigDecimal[monthList.size()];
        endBalance[monthList.size() - 1] = currentBalance;
        for (int i = monthList.size() - 2; i >= 0; i--) {
            YearMonth next = monthList.get(i + 1);
            endBalance[i] = endBalance[i + 1].subtract(flow.getOrDefault(next, BigDecimal.ZERO));
        }

        List<NetWorthPoint> out = new ArrayList<>();
        for (int i = 0; i < monthList.size(); i++) {
            out.add(new NetWorthPoint(monthList.get(i).toString(), endBalance[i]));
        }
        return out;
    }
}
