package com.jarvis.expense.service;

import com.jarvis.expense.domain.Category;
import com.jarvis.expense.domain.CategoryRule;
import com.jarvis.expense.domain.Transaction;
import com.jarvis.expense.repo.CategoryRepository;
import com.jarvis.expense.repo.CategoryRuleRepository;
import com.jarvis.expense.repo.TransactionRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** User-defined "merchant contains X → category" rules; they beat the AI's guess. */
@Service
public class RuleService {

    private final CategoryRuleRepository rules;
    private final CategoryRepository categories;
    private final TransactionRepository transactions;

    public RuleService(CategoryRuleRepository rules, CategoryRepository categories, TransactionRepository transactions) {
        this.rules = rules;
        this.categories = categories;
        this.transactions = transactions;
    }

    @Transactional(readOnly = true)
    public List<CategoryRule> list() {
        return rules.findAllByOrderByCreatedAtAsc();
    }

    @Transactional
    public CategoryRule create(String pattern, String category) {
        CategoryRule r = new CategoryRule();
        r.setPattern(pattern.trim());
        r.setCategory(category.trim());
        return rules.save(r);
    }

    @Transactional
    public void delete(Long id) {
        rules.deleteById(id);
    }

    /** The category a merchant string maps to, if any rule matches (first created wins). */
    @Transactional(readOnly = true)
    public Optional<String> categoryFor(String merchant) {
        if (merchant == null || merchant.isBlank()) {
            return Optional.empty();
        }
        return rules.findAllByOrderByCreatedAtAsc().stream().filter(r -> r.matches(merchant)).map(CategoryRule::getCategory).findFirst();
    }

    /**
     * Apply every rule to stored transactions. With {@code onlyUncategorized} only rows whose
     * category is empty or "Uncategorized" change; otherwise every matching row is re-categorised.
     * Returns how many rows changed.
     */
    @Transactional
    public int applyToExisting(boolean onlyUncategorized) {
        List<CategoryRule> all = rules.findAllByOrderByCreatedAtAsc();
        if (all.isEmpty()) {
            return 0;
        }
        int changed = 0;
        for (Transaction t : transactions.findAll()) {
            if (t.getMerchant() == null || t.isTransfer() || t.isSettlement()) {
                continue;
            }
            String current = t.getCategory() == null ? null : t.getCategory().getName();
            if (onlyUncategorized && current != null && !current.equalsIgnoreCase("Uncategorized")) {
                continue;
            }
            for (CategoryRule r : all) {
                if (r.matches(t.getMerchant())) {
                    if (!r.getCategory().equalsIgnoreCase(current)) {
                        t.setCategory(findOrCreate(r.getCategory()));
                        transactions.save(t);
                        changed++;
                    }
                    break;
                }
            }
        }
        return changed;
    }

    Category findOrCreate(String name) {
        return categories.findByNameIgnoreCase(name).orElseGet(() -> {
            Category c = new Category();
            c.setName(name);
            return categories.save(c);
        });
    }
}
