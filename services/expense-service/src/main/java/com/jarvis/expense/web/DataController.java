package com.jarvis.expense.web;

import com.jarvis.expense.repo.AccountRepository;
import com.jarvis.expense.repo.TransactionRepository;
import com.jarvis.expense.service.Scope;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RestController;

/** GDPR-style purge: delete every account + transaction this service owns (profile is untouched). */
@RestController
public class DataController {

    private final TransactionRepository transactions;
    private final AccountRepository accounts;
    private final Scope scope;

    public DataController(
        TransactionRepository transactions, AccountRepository accounts, Scope scope) {
        this.transactions = transactions;
        this.accounts = accounts;
        this.scope = scope;
    }

    @DeleteMapping("/api/transactions/purge-all")
    @Transactional
    public ResponseEntity<Void> purge() {
        scope.requireAdmin();
        transactions.deleteAllInBatch(); // referencing side first (FK to account)
        accounts.deleteAllInBatch();
        return ResponseEntity.noContent().build();
    }
}
