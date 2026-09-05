package com.jarvis.expense.service;

import com.jarvis.expense.domain.Category;
import com.jarvis.expense.domain.MerchantAlias;
import com.jarvis.expense.domain.Transaction;
import com.jarvis.expense.repo.CategoryRepository;
import com.jarvis.expense.repo.MerchantAliasRepository;
import com.jarvis.expense.repo.TransactionRepository;
import com.jarvis.expense.web.dto.MerchantSummary;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Merchant identity. Alerts spell one shop several ways ("AMAZON PAY", "AMAZON PAY IN"), which
 * splits it across every breakdown, so an alias maps each raw string to one clean name and,
 * optionally, to the category it belongs in.
 */
@Service
public class MerchantService {

    /** Categories that mean "not decided yet" and may therefore be overwritten. */
    private static final String UNCATEGORISED = "Uncategorized";

    private final TransactionRepository transactions;
    private final MerchantAliasRepository aliases;
    private final CategoryRepository categories;

    public MerchantService(
        TransactionRepository transactions, MerchantAliasRepository aliases, CategoryRepository categories) {
        this.transactions = transactions;
        this.aliases = aliases;
        this.categories = categories;
    }

    /** Every distinct raw merchant string, busiest first, with any alias already accepted for it. */
    @Transactional(readOnly = true)
    public List<MerchantSummary> list() {
        Map<String, MerchantAlias> byRaw = aliases.findAll().stream()
            .collect(Collectors.toMap(MerchantAlias::getRaw, Function.identity(), (a, b) -> a));
        List<MerchantSummary> out = new ArrayList<>();
        for (Object[] row : transactions.merchantGroups()) {
            String raw = (String) row[0];
            MerchantAlias a = byRaw.get(raw);
            out.add(new MerchantSummary(
                raw,
                a != null ? a.getCanonical() : null,
                a != null ? a.getCategory() : null,
                ((Number) row[1]).longValue(),
                row[2] == null ? BigDecimal.ZERO : (BigDecimal) row[2],
                ((Number) row[3]).longValue(),
                a != null ? a.getSource() : null));
        }
        return out;
    }

    public record AliasRequest(String raw, String canonical, String category, String source) {}

    public record ApplyResult(int aliases, int renamed, int categorised) {}

    /**
     * Save a batch of aliases and apply them to stored transactions: every matching row gets the
     * clean name, and rows with no category yet get the alias's category. A category the user
     * already chose is never overwritten.
     */
    @Transactional
    public ApplyResult upsert(List<AliasRequest> requests) {
        int renamed = 0;
        int categorised = 0;
        int saved = 0;
        for (AliasRequest req : requests) {
            if (req.raw() == null || req.raw().isBlank() || req.canonical() == null || req.canonical().isBlank()) {
                continue;
            }
            String raw = req.raw();
            MerchantAlias alias = aliases.findByRaw(raw).orElseGet(() -> {
                MerchantAlias a = new MerchantAlias();
                a.setRaw(raw);
                return a;
            });
            alias.setCanonical(req.canonical().trim());
            alias.setCategory(req.category() == null || req.category().isBlank() ? null : req.category().trim());
            alias.setSource("ai".equals(req.source()) ? "ai" : "user");
            aliases.save(alias);
            saved++;

            Category cat = alias.getCategory() == null ? null : findOrCreateCategory(alias.getCategory());
            for (Transaction t : transactions.findByMerchant(raw)) {
                boolean touched = false;
                if (!alias.getCanonical().equals(t.getMerchantNorm())) {
                    t.setMerchantNorm(alias.getCanonical());
                    renamed++;
                    touched = true;
                }
                if (cat != null && isUndecided(t)) {
                    t.setCategory(cat);
                    categorised++;
                    touched = true;
                }
                if (touched) {
                    transactions.save(t);
                }
            }
        }
        return new ApplyResult(saved, renamed, categorised);
    }

    /** Re-run every stored alias over the whole ledger (after an import, say). */
    @Transactional
    public ApplyResult applyAll() {
        return upsert(aliases.findAll().stream()
            .map(a -> new AliasRequest(a.getRaw(), a.getCanonical(), a.getCategory(), a.getSource()))
            .toList());
    }

    @Transactional
    public void delete(String raw) {
        aliases.findByRaw(raw).ifPresent(a -> {
            aliases.delete(a);
            for (Transaction t : transactions.findByMerchant(raw)) {
                t.setMerchantNorm(null);
                transactions.save(t);
            }
        });
    }

    private boolean isUndecided(Transaction t) {
        return t.getCategory() == null || UNCATEGORISED.equalsIgnoreCase(t.getCategory().getName());
    }

    private Category findOrCreateCategory(String name) {
        return categories.findByNameIgnoreCase(name).orElseGet(() -> categories.save(new Category(name)));
    }
}
