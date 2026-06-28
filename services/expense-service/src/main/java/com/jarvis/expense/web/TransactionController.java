package com.jarvis.expense.web;

import com.jarvis.expense.service.TransactionService;
import com.jarvis.expense.web.dto.CreateTransactionRequest;
import com.jarvis.expense.web.dto.TransactionDto;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/transactions")
public class TransactionController {

    private final TransactionService service;

    public TransactionController(TransactionService service) {
        this.service = service;
    }

    @GetMapping
    public List<TransactionDto> list(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size) {
        return service.list(page, size);
    }

    @GetMapping("/{id}")
    public TransactionDto get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public ResponseEntity<TransactionDto> create(@Valid @RequestBody CreateTransactionRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createManual(req));
    }
}
