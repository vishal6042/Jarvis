package com.jarvis.finance.web.internal;

import com.jarvis.finance.domain.Loan;
import com.jarvis.finance.repo.LoanRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
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

/** Lets ingestion-service record an EMI debit against the loan it pays. Internal-key guarded. */
@RestController
@RequestMapping("/internal/loans")
public class InternalLoanController {

    private final LoanRepository loans;
    private final String internalKey;

    public InternalLoanController(LoanRepository loans, @Value("${jarvis.internal.key}") String internalKey) {
        this.loans = loans;
        this.internalKey = internalKey;
    }

    /** Loans that can be matched from alerts (either link field set). */
    @GetMapping("/linked")
    public List<LinkedLoan> linked(@RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireKey(key);
        return loans.findAll().stream()
            .filter(l -> l.getLoanAccountLast4() != null || l.getEmiFromLast4() != null)
            .map(l -> new LinkedLoan(l.getId(), l.getLender(), l.getKind(), l.getEmi(), l.getLoanAccountLast4(), l.getEmiFromLast4()))
            .toList();
    }

    /**
     * Record one EMI payment (once per date — re-running the same alert is a no-op). With a rate
     * and an outstanding balance, the principal part (EMI minus one month's interest) reduces the
     * outstanding; without them only the payment count and date move.
     */
    @PostMapping("/payment")
    @Transactional
    public PaymentResult payment(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @RequestBody PaymentRequest req) {
        requireKey(key);
        Loan l = loans.findById(req.loanId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loan not found"));
        LocalDate on = req.date() == null ? LocalDate.now() : req.date();
        if (l.getLastPaymentOn() != null && !on.isAfter(l.getLastPaymentOn())) {
            return new PaymentResult(l.getId(), l.getLender(), l.getOutstanding(), false);
        }
        if (l.getOutstanding() != null && l.getOutstanding().signum() > 0 && req.amount() != null) {
            BigDecimal interest = l.getRate() == null ? BigDecimal.ZERO
                : l.getOutstanding().multiply(BigDecimal.valueOf(l.getRate() / 1200.0)).setScale(2, RoundingMode.HALF_UP);
            BigDecimal principalPart = req.amount().subtract(interest).max(BigDecimal.ZERO);
            l.setOutstanding(l.getOutstanding().subtract(principalPart).max(BigDecimal.ZERO));
        }
        l.setLastPaymentOn(on);
        l.setPaymentsRecorded(l.getPaymentsRecorded() + 1);
        loans.save(l);
        return new PaymentResult(l.getId(), l.getLender(), l.getOutstanding(), true);
    }

    private void requireKey(String key) {
        if (!internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bad internal key");
        }
    }

    public record LinkedLoan(
        Long id, String lender, String kind, BigDecimal emi, String loanAccountLast4, String emiFromLast4) {}

    public record PaymentRequest(Long loanId, BigDecimal amount, LocalDate date) {}

    public record PaymentResult(Long loanId, String lender, BigDecimal outstanding, boolean applied) {}
}
