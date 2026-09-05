package com.jarvis.expense.web;

import java.util.Map;
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

    /** Inline category change. Body: {"category": "Food"}. */
    @PatchMapping("/{id}/category")
    public TransactionDto setCategory(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return service.setCategory(id, body.get("category"));
    }

    /** Replace the tag list. Body: {"tags": ["trip-goa", "reimbursable"]}. */
    @PatchMapping("/{id}/tags")
    public TransactionDto setTags(@PathVariable Long id, @RequestBody Map<String, List<String>> body) {
        return service.setTags(id, body.getOrDefault("tags", List.of()));
    }

    /** Categorise many rows at once. Body: {"ids": [1, 2, 3], "category": "Food"}. */
    @PostMapping("/bulk-category")
    public Map<String, Object> bulkCategory(@RequestBody BulkCategoryRequest req) {
        return Map.of("updated", service.bulkSetCategory(req.ids(), req.category()));
    }

    public record BulkCategoryRequest(List<Long> ids, String category) {}

    /** Probable duplicates (same day / amount / direction on one account, or one side unlinked). */
    @GetMapping("/duplicates")
    public List<List<TransactionDto>> duplicates() {
        return service.duplicateCandidates();
    }

    @PutMapping("/{id}")
    public TransactionDto update(@PathVariable Long id, @Valid @RequestBody CreateTransactionRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
