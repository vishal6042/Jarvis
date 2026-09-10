package com.jarvis.ingestion.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.jarvis.ingestion.client.AiClient;
import com.jarvis.ingestion.client.ExpenseClient;
import com.jarvis.ingestion.client.FinanceClient;
import com.jarvis.ingestion.domain.MessageSource;
import com.jarvis.ingestion.domain.RawMessage;
import com.jarvis.ingestion.repo.RawMessageRepository;
import com.jarvis.ingestion.web.dto.IngestRequest;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * SBI reports one home-loan EMI with two different alerts: a generic debit naming the beneficiary
 * (the loan is in the borrower's own name, so it reads "Transferred to Mr. VISHALBHARTI"), and,
 * hours later, the standing-instruction confirmation naming the loan account. Only the merchant
 * text differs, and that is part of the dedup hash — so one debit was stored as two transactions
 * and counted twice as spending. Both shapes have to reach expense-service under one name.
 */
class IngestionServiceLoanEmiTest {

    private static final String DEBIT_ALERT =
        "Your A/C XXXXX036971 Debited INR 68,339.00 on 10/09/26 -Transferred to Mr. VISHALBHARTI."
            + " Avl Balance INR 4,079.04-SBI";
    private static final String STANDING_INSTRUCTION =
        "Dear Customer, Standing Instruction has been successfully executed for Rs. 68,339.00"
            + " from A/c No.XXXXX036971 to Loan A/c No.XXXXX432573 on 10/09/26.  - SBI.";

    private RawMessageRepository rawMessages;
    private AiClient ai;
    private ExpenseClient expense;
    private FinanceClient finance;
    private IngestionService service;

    @BeforeEach
    void setUp() {
        rawMessages = mock(RawMessageRepository.class);
        ai = mock(AiClient.class);
        expense = mock(ExpenseClient.class);
        finance = mock(FinanceClient.class);
        service = new IngestionService(rawMessages, ai, expense, finance, new PayloadHasher());
        when(rawMessages.save(any(RawMessage.class))).thenAnswer(inv -> {
            RawMessage m = inv.getArgument(0);
            if (m.getId() == null) {
                m.setId(99L);
            }
            return m;
        });
        when(rawMessages.findFirstByPayloadHashAndStatusInOrderByIdAsc(anyString(), any()))
            .thenReturn(Optional.empty());
        when(expense.create(any())).thenReturn(new ExpenseClient.CreateResult(true, 900L, 10L));
        when(finance.findByLast4(any(), any())).thenReturn(Optional.empty());

        // The SBI home loan: EMI paid by standing instruction from savings 6971 to loan a/c 2573.
        FinanceClient.LinkedLoan loan =
            new FinanceClient.LinkedLoan(1L, "SBI", "HOME", new BigDecimal("68339.00"), "2573", "6971");
        when(finance.findLoan(any(), any(), any(), any())).thenReturn(Optional.of(loan));
        when(finance.recordLoanPayment(any(), any(), any(), any()))
            .thenReturn(new FinanceClient.LoanPaymentResult(1L, "SBI", new BigDecimal("425313.93"), true));
    }

    private void ingest(String payload, String merchant, String category, String amount, String last4, String on) {
        when(ai.parse(payload)).thenReturn(new AiClient.ParsedTransaction(
            true, amount, "INR", "DEBIT", merchant, last4, "SBI", on, category, null));
        service.ingest(new IngestRequest(
            MessageSource.SMS, payload, "AX-CBSSBI-S", Instant.parse(on + "T09:03:24Z")));
    }

    /** Everything ingestion handed to expense-service, in order. */
    private List<ExpenseClient.CreateTransactionRequest> sent(int count) {
        ArgumentCaptor<ExpenseClient.CreateTransactionRequest> captor =
            ArgumentCaptor.forClass(ExpenseClient.CreateTransactionRequest.class);
        verify(expense, times(count)).create(captor.capture());
        return captor.getAllValues();
    }

    @Test
    void bothAlertsForOneEmiArriveUnderTheSameName() {
        ingest(DEBIT_ALERT, "Mr. VISHALBHARTI", "Transfers", "68339.00", "6971", "2026-09-10");
        ingest(STANDING_INSTRUCTION, "Loan A/c No.XXXXX432573", "Loan EMI", "68339.00", "6971", "2026-09-10");

        List<ExpenseClient.CreateTransactionRequest> both = sent(2);
        var fromDebit = both.get(0);
        var fromInstruction = both.get(1);

        // Account, amount and day already matched; the merchant was the only thing keeping the
        // dedup hash apart, so making it equal is what collapses the pair into one transaction.
        assertEquals("SBI loan EMI ••••2573", fromDebit.merchant());
        assertEquals(fromDebit.merchant(), fromInstruction.merchant());
        assertEquals(fromDebit.last4(), fromInstruction.last4());
        assertEquals(fromDebit.amount(), fromInstruction.amount());
        assertEquals(fromDebit.occurredAt(), fromInstruction.occurredAt());
        // The parser read the generic alert as a transfer; a matched loan settles it either way.
        assertEquals("Loan EMI", fromDebit.category());
        assertEquals("Loan EMI", fromInstruction.category());
    }

    @Test
    void repayingALoanIsNotTreatedAsAMoveBetweenOwnAccounts() {
        // The loan account is named in the instruction, but money reaching it has left the
        // household — it is spending, and must not be handed over as a transfer counterparty.
        ingest(STANDING_INSTRUCTION, "Loan A/c No.XXXXX432573", "Loan EMI", "68339.00", "6971", "2026-09-10");
        assertNull(sent(1).get(0).counterpartyLast4());
    }

    @Test
    void aDebitWithNoMatchingLoanKeepsTheParsersMerchant() {
        when(finance.findLoan(any(), any(), any(), any())).thenReturn(Optional.empty());
        ingest("ICICI Bank Acct XX380 debited for Rs 2300.00 on 09-Sep-26; POOJA GAS AGENC credited.",
            "POOJA GAS AGENC", "Bills & Utilities", "2300.00", "380", "2026-09-09");

        var req = sent(1).get(0);
        assertEquals("POOJA GAS AGENC", req.merchant());
        assertNull(req.counterpartyLast4(), "a merchant credited is not an account of ours");
    }

    @Test
    void aTransferBetweenOwnAccountsPassesOnTheCreditedAccount() {
        when(finance.findLoan(any(), any(), any(), any())).thenReturn(Optional.empty());
        ingest("ICICI Bank Acct XX380 debited with Rs 70,000.00 on 06-Sep-26 & Acct XX971 credited."
                + " IMPS:624917380061. Call 18002662 for dispute or SMS BLOCK 380 to 9215676766",
            null, "Transfers", "70000.00", "380", "2026-09-06");

        assertEquals("971", sent(1).get(0).counterpartyLast4(),
            "expense-service decides whether XX971 is one of the household's own");
    }
}
