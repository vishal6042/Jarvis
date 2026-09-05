package com.jarvis.expense.web;

import com.jarvis.expense.service.Scope;
import com.jarvis.expense.service.TransferService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/transactions")
public class TransferController {

    private final TransferService transfers;
    private final Scope scope;

    public TransferController(TransferService transfers, Scope scope) {
        this.transfers = transfers;
        this.scope = scope;
    }

    /** Scan all rows and flag debit/credit pairs across the user's own accounts as transfers. */
    @PostMapping("/detect-transfers")
    public Map<String, Integer> detectTransfers() {
        scope.requireAdmin();
        return Map.of("pairs", transfers.detectAll());
    }
}
