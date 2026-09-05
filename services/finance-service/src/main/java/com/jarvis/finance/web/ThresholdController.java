package com.jarvis.finance.web;

import com.jarvis.finance.domain.CategoryThreshold;
import com.jarvis.finance.repo.CategoryThresholdRepository;
import com.jarvis.finance.service.Scope;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Category spend thresholds exposed as a {@code {category: amount}} map. */
@RestController
@RequestMapping("/api/thresholds")
public class ThresholdController {

    private final CategoryThresholdRepository thresholds;
    private final Scope scope;

    public ThresholdController(CategoryThresholdRepository thresholds, Scope scope) {
        this.thresholds = thresholds;
        this.scope = scope;
    }

    @GetMapping
    public Map<String, BigDecimal> get() {
        Map<String, BigDecimal> out = new LinkedHashMap<>();
        for (CategoryThreshold t : thresholds.findAll()) {
            out.put(t.getCategory(), t.getAmount());
        }
        return out;
    }

    @PutMapping
    @Transactional
    public Map<String, BigDecimal> save(@RequestBody Map<String, BigDecimal> body) {
        // Budgets are set for the household, not per person.
        scope.requireAdmin();
        body.forEach((category, amount) -> {
            CategoryThreshold t = thresholds
                .findByCategory(category)
                .orElseGet(() -> new CategoryThreshold(category, BigDecimal.ZERO));
            t.setAmount(amount == null ? BigDecimal.ZERO : amount);
            thresholds.save(t);
        });
        return get();
    }
}
