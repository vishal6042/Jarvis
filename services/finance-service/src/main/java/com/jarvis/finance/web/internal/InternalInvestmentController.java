package com.jarvis.finance.web.internal;

import com.jarvis.finance.domain.Investment;
import com.jarvis.finance.repo.InvestmentRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Lets ingestion-service route bank/post-office alerts for a linked account to the investment it
 * belongs to (e.g. a post office RD receiving Rs 5,000 every month) instead of creating a stray
 * transaction. Internal-key guarded.
 */
@RestController
@RequestMapping("/internal/investments")
public class InternalInvestmentController {

    private final InvestmentRepository investments;
    private final String internalKey;

    public InternalInvestmentController(
        InvestmentRepository investments, @Value("${jarvis.internal.key}") String internalKey) {
        this.investments = investments;
        this.internalKey = internalKey;
    }

    /** Investments that have an account number linked. */
    @GetMapping("/linked")
    public List<LinkedInvestment> linked(
        @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireKey(key);
        return investments.findByAccountLast4IsNotNull().stream()
            .map(i -> new LinkedInvestment(i.getId(), i.getName(), i.getAccountLast4()))
            .toList();
    }

    /**
     * Record a credit alert for a linked account: the amount is added to principal once per
     * date (re-running the same alert is a no-op), and the alert's stated balance becomes the
     * current value unless a newer alert already set it.
     */
    @PostMapping("/contribution")
    @Transactional
    public ContributionResult contribution(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @RequestBody ContributionRequest req) {
        requireKey(key);
        Investment i = investments.findFirstByAccountLast4(req.last4())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No investment linked to " + req.last4()));
        LocalDate on = req.date() == null ? LocalDate.now() : req.date();

        boolean applied = false;
        if (req.amount() != null && (i.getLastContributionOn() == null || on.isAfter(i.getLastContributionOn()))) {
            i.setPrincipal(i.getPrincipal().add(req.amount()));
            i.setLastContributionOn(on);
            applied = true;
            if (req.balance() == null) {
                i.setCurrent(i.getCurrent().add(req.amount()));
            }
        }
        if (req.balance() != null && (i.getValueAsOf() == null || !on.isBefore(i.getValueAsOf()))) {
            i.setCurrent(req.balance());
            i.setValueAsOf(on);
        }
        investments.save(i);
        return new ContributionResult(i.getId(), i.getName(), i.getCurrent(), applied);
    }

    private void requireKey(String key) {
        if (!internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bad internal key");
        }
    }

    public record LinkedInvestment(Long id, String name, String accountLast4) {}

    public record ContributionRequest(String last4, BigDecimal amount, BigDecimal balance, LocalDate date) {}

    public record ContributionResult(Long investmentId, String name, BigDecimal current, boolean applied) {}
}
