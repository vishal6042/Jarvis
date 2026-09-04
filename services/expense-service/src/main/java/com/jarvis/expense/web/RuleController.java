package com.jarvis.expense.web;

import com.jarvis.expense.domain.CategoryRule;
import com.jarvis.expense.service.RuleService;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rules")
public class RuleController {

    private final RuleService rules;

    public RuleController(RuleService rules) {
        this.rules = rules;
    }

    @GetMapping
    public List<CategoryRule> list() {
        return rules.list();
    }

    @PostMapping
    public ResponseEntity<CategoryRule> create(@RequestBody RuleRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(rules.create(req.pattern(), req.category()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        rules.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** Re-categorise stored transactions with the current rules. */
    @PostMapping("/apply")
    public Map<String, Integer> apply(@RequestParam(defaultValue = "true") boolean onlyUncategorized) {
        return Map.of("changed", rules.applyToExisting(onlyUncategorized));
    }

    public record RuleRequest(@NotBlank String pattern, @NotBlank String category) {}
}
