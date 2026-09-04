package com.jarvis.finance.web;

import com.jarvis.finance.repo.CategoryThresholdRepository;
import com.jarvis.finance.repo.GoalRepository;
import com.jarvis.finance.repo.InvestmentRepository;
import com.jarvis.finance.repo.LoanRepository;
import com.jarvis.finance.repo.ReminderRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RestController;

/** GDPR-style purge: delete all investments, loans, reminders, thresholds (members are kept). */
@RestController
public class DataController {

    private final InvestmentRepository investments;
    private final LoanRepository loans;
    private final ReminderRepository reminders;
    private final CategoryThresholdRepository thresholds;
    private final GoalRepository goals;

    public DataController(
        InvestmentRepository investments,
        LoanRepository loans,
        ReminderRepository reminders,
        CategoryThresholdRepository thresholds,
        GoalRepository goals) {
        this.investments = investments;
        this.loans = loans;
        this.reminders = reminders;
        this.thresholds = thresholds;
        this.goals = goals;
    }

    @DeleteMapping("/api/investments/purge-all")
    @Transactional
    public ResponseEntity<Void> purge() {
        investments.deleteAllInBatch();
        loans.deleteAllInBatch();
        reminders.deleteAllInBatch();
        thresholds.deleteAllInBatch();
        goals.deleteAllInBatch();
        return ResponseEntity.noContent().build();
    }
}
