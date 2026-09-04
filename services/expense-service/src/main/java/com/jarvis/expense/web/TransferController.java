package com.jarvis.expense.web;

import com.jarvis.expense.service.TransferService;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/transactions")
public class TransferController {

    private final TransferService transfers;

    public TransferController(TransferService transfers) {
        this.transfers = transfers;
    }

    /** Scan all rows and flag debit/credit pairs across the user's own accounts as transfers. */
    @PostMapping("/detect-transfers")
    public Map<String, Integer> detectTransfers() {
        return Map.of("pairs", transfers.detectAll());
    }
}
