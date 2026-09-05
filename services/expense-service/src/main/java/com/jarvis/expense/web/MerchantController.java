package com.jarvis.expense.web;

import com.jarvis.expense.service.MerchantService;
import com.jarvis.expense.service.Scope;
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
    private final Scope scope;

    public MerchantController(MerchantService merchants, Scope scope) {
        this.merchants = merchants;
        this.scope = scope;
    }

    /** Every distinct raw merchant string, busiest first, with any alias accepted for it. */
    @GetMapping
    public List<MerchantSummary> list() {
        return merchants.list();
    }

    /** Accept a batch of aliases and apply them to stored transactions. */
    @PostMapping("/aliases")
    public ApplyResult upsert(@RequestBody List<AliasRequest> aliases) {
        scope.requireAdmin();
        return merchants.upsert(aliases);
    }

    /** Re-run every stored alias across the ledger. */
    @PostMapping("/aliases/apply")
    public ApplyResult applyAll() {
        scope.requireAdmin();
        return merchants.applyAll();
    }

    @DeleteMapping("/aliases")
    public ResponseEntity<Void> delete(@RequestParam String raw) {
        scope.requireAdmin();
        merchants.delete(raw);
        return ResponseEntity.noContent().build();
    }
}
