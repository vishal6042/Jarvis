package com.jarvis.expense.service;

import com.jarvis.expense.domain.Direction;
import com.jarvis.expense.repo.TransactionRepository;
import com.jarvis.expense.web.dto.CategorySpend;
import com.jarvis.expense.web.dto.PeriodSummary;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read-only spend/earning aggregates, consumed by the frontend and the AI query agent's tools. */
@Service
public class AnalyticsService {

    private final TransactionRepository transactions;

    public AnalyticsService(TransactionRepository transactions) {
        this.transactions = transactions;
    }

    @Transactional(readOnly = true)
    public PeriodSummary summary(Instant from, Instant to) {
        BigDecimal earning = transactions.sumByDirectionAndPeriod(Direction.CREDIT, from, to);
        BigDecimal spend = transactions.sumByDirectionAndPeriod(Direction.DEBIT, from, to);
        return new PeriodSummary(from, to, earning, spend);
    }

    @Transactional(readOnly = true)
    public List<CategorySpend> spendByCategory(Instant from, Instant to) {
        return transactions.sumByCategoryAndPeriod(Direction.DEBIT, from, to).stream()
            .map(row -> new CategorySpend((String) row[0], (BigDecimal) row[1]))
            .toList();
    }
}
