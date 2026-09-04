package com.jarvis.ingestion.client;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/** Routes alerts for accounts linked to an investment (e.g. a post office RD) to finance-service. */
@Component
public class FinanceClient {

    private static final Logger log = LoggerFactory.getLogger(FinanceClient.class);

    private final WebClient web;
    private final String internalKey;

    public FinanceClient(
        @LoadBalanced WebClient.Builder builder,
        @Value("${jarvis.finance.base-url:lb://finance-service}") String baseUrl,
        @Value("${jarvis.internal.key}") String internalKey) {
        this.web = builder.baseUrl(baseUrl).build();
        this.internalKey = internalKey;
    }

    /** The investment linked to these account digits, if any. Failures (finance down) → empty. */
    public Optional<LinkedInvestment> findByLast4(String last4) {
        if (last4 == null || last4.isBlank()) {
            return Optional.empty();
        }
        try {
            List<LinkedInvestment> linked = web.get()
                .uri("/internal/investments/linked")
                .header("X-Internal-Key", internalKey)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<LinkedInvestment>>() {})
                .block();
            if (linked == null) {
                return Optional.empty();
            }
            return linked.stream()
                .filter(i -> i.accountLast4() != null
                    && (i.accountLast4().equals(last4) || (last4.length() < 4 && i.accountLast4().endsWith(last4))))
                .findFirst();
        } catch (Exception e) {
            log.warn("Could not look up linked investments: {}", e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * The loan an EMI debit pays: by the loan account digits named in the alert, else by an
     * EMI-sized amount (within 2%) leaving the account the loan is linked to. Failures → empty.
     */
    public Optional<LinkedLoan> findLoan(String loanDigits, String fromLast4, BigDecimal amount) {
        try {
            List<LinkedLoan> linked = web.get()
                .uri("/internal/loans/linked")
                .header("X-Internal-Key", internalKey)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<LinkedLoan>>() {})
                .block();
            if (linked == null || linked.isEmpty()) {
                return Optional.empty();
            }
            if (loanDigits != null) {
                Optional<LinkedLoan> byRef = linked.stream()
                    .filter(l -> l.loanAccountLast4() != null
                        && (l.loanAccountLast4().equals(loanDigits) || l.loanAccountLast4().endsWith(loanDigits)))
                    .findFirst();
                if (byRef.isPresent()) {
                    return byRef;
                }
            }
            if (fromLast4 != null && amount != null) {
                return linked.stream()
                    .filter(l -> fromLast4.equals(l.emiFromLast4()) && l.emi() != null && l.emi().signum() > 0)
                    .filter(l -> amount.subtract(l.emi()).abs().doubleValue() <= l.emi().doubleValue() * 0.02)
                    .findFirst();
            }
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Could not look up linked loans: {}", e.getMessage());
            return Optional.empty();
        }
    }

    public LoanPaymentResult recordLoanPayment(Long loanId, BigDecimal amount, LocalDate date) {
        return web.post()
            .uri("/internal/loans/payment")
            .header("X-Internal-Key", internalKey)
            .bodyValue(new LoanPaymentRequest(loanId, amount, date))
            .retrieve()
            .bodyToMono(LoanPaymentResult.class)
            .block();
    }

    public ContributionResult contribute(String last4, BigDecimal amount, BigDecimal balance, LocalDate date) {
        return web.post()
            .uri("/internal/investments/contribution")
            .header("X-Internal-Key", internalKey)
            .bodyValue(new ContributionRequest(last4, amount, balance, date))
            .retrieve()
            .bodyToMono(ContributionResult.class)
            .block();
    }

    public record LinkedInvestment(Long id, String name, String accountLast4) {}

    public record ContributionRequest(String last4, BigDecimal amount, BigDecimal balance, LocalDate date) {}

    public record ContributionResult(Long investmentId, String name, BigDecimal current, boolean applied) {}

    public record LinkedLoan(
        Long id, String lender, String kind, BigDecimal emi, String loanAccountLast4, String emiFromLast4) {}

    public record LoanPaymentRequest(Long loanId, BigDecimal amount, LocalDate date) {}

    public record LoanPaymentResult(Long loanId, String lender, BigDecimal outstanding, boolean applied) {}
}
