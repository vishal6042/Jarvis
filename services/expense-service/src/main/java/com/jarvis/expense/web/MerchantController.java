package com.jarvis.expense.web;

import com.jarvis.expense.service.MerchantService;
import com.jarvis.expense.service.MerchantService.AliasRequest;
import com.jarvis.expense.service.MerchantService.ApplyResult;
import com.jarvis.expense.web.dto.MerchantSummary;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Merchant identity: what the alerts call a shop, and what the user calls it. */
@RestController
@RequestMapping("/api/merchants")
public class MerchantController {

    private final MerchantService merchants;

    public MerchantController(MerchantService merchants) {
        this.merchants = merchants;
    }

    /** Every distinct raw merchant string, busiest first, with any alias accepted for it. */
    @GetMapping
    public List<MerchantSummary> list() {
        return merchants.list();
    }

    /** Accept a batch of aliases and apply them to stored transactions. */
    @PostMapping("/aliases")
    public ApplyResult upsert(@RequestBody List<AliasRequest> aliases) {
        return merchants.upsert(aliases);
    }

    /** Re-run every stored alias across the ledger. */
    @PostMapping("/aliases/apply")
    public ApplyResult applyAll() {
        return merchants.applyAll();
    }

    @DeleteMapping("/aliases")
    public ResponseEntity<Void> delete(@RequestParam String raw) {
        merchants.delete(raw);
        return ResponseEntity.noContent().build();
    }
}
