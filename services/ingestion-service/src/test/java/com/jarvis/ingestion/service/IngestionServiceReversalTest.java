package com.jarvis.ingestion.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.jarvis.ingestion.client.AiClient;
import com.jarvis.ingestion.client.ExpenseClient;
import com.jarvis.ingestion.client.FinanceClient;
import com.jarvis.ingestion.domain.MessageSource;
import com.jarvis.ingestion.domain.ParseStatus;
import com.jarvis.ingestion.domain.RawMessage;
import com.jarvis.ingestion.repo.RawMessageRepository;
import com.jarvis.ingestion.web.dto.IngestRequest;
import com.jarvis.ingestion.web.dto.IngestResponse;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * A UPI payment that fails is alerted as a debit and then as a credit "as reversal of transaction
 * with UPI: <ref>". On 6 Oct 2026 one payment of Rs 1119.69 took three attempts: the two failures
 * showed up as two debits and two "Income" credits, and the retry — same amount, same payee, same
 * day — was dropped as a duplicate of the first. Only the bank's reference tells these apart.
 */
class IngestionServiceReversalTest {

    private static final String DEBIT =
        "ICICI Bank Acct XX380 debited for Rs 1119.69 on 06-Oct-26; Mr PRANAV PRASA credited."
            + " UPI:664507457069. Call 18002662 for dispute. SMS BLOCK 380 to 9215676766.";
    private static final String REVERSAL =
        "Dear Customer, your ICICI Bank Account XXX380 has been credited with Rs 1119.69 on 06-Oct-26"
            + " as reversal of transaction with UPI: 664507457069.";
    private static final String RETRY =
        "ICICI Bank Acct XX380 debited for Rs 1119.69 on 06-Oct-26; Mr PRANAV PRASA credited."
            + " UPI:664546784453. Call 18002662 for dispute. SMS BLOCK 380 to 9215676766.";
    private static final Instant AT = Instant.parse("2026-10-06T15:20:00Z");

    private RawMessageRepository rawMessages;
    private AiClient ai;
    private ExpenseClient expense;
    private IngestionService service;

    @BeforeEach
    void setUp() {
        rawMessages = mock(RawMessageRepository.class);
        ai = mock(AiClient.class);
        expense = mock(ExpenseClient.class);
        FinanceClient finance = mock(FinanceClient.class);
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
        when(finance.findByLast4(any(), any())).thenReturn(Optional.empty());
        when(finance.findLoan(any(), any(), any(), any())).thenReturn(Optional.empty());
        when(expense.create(any())).thenReturn(new ExpenseClient.CreateResult(true, 900L, 5L));
        when(ai.parse(anyString())).thenReturn(new AiClient.ParsedTransaction(
            true, "1119.69", "INR", "DEBIT", "Mr PRANAV PRASA", "380", "ICICI", "2026-10-06", "Travel", null));
    }

    private static RawMessage stored(long id, String payload, ParseStatus status, Long txn) {
        RawMessage m = new RawMessage();
        m.setId(id);
        m.setPayload(payload);
        m.setStatus(status);
        m.setTransactionRef(txn);
        return m;
    }

    private IngestResponse ingest(String payload) {
        return service.ingest(new IngestRequest(MessageSource.SMS, payload, "AX-ICICIT-S", AT));
    }

    @Test
    void aReversalRemovesTheDebitItUndoesAndIsNotIncome() {
        RawMessage debit = stored(634L, DEBIT, ParseStatus.PARSED, 1008L);
        when(rawMessages.findByPayloadContaining("664507457069")).thenReturn(List.of(debit));

        IngestResponse res = ingest(REVERSAL);

        assertEquals(ParseStatus.IGNORED, res.status());
        verify(expense).delete(1008L);
        assertEquals(ParseStatus.IGNORED, debit.getStatus());
        assertNull(debit.getTransactionRef());
        verify(expense, never()).create(any());
        verifyNoInteractions(ai);
    }

    @Test
    void aDebitWhoseReversalArrivedFirstIsNotCounted() {
        // The bank sent the reversal a second before the debit it reverses.
        RawMessage reversal = stored(633L, REVERSAL, ParseStatus.IGNORED, null);
        when(rawMessages.findByPayloadContaining("664507457069")).thenReturn(List.of(reversal));

        IngestResponse res = ingest(DEBIT);

        assertEquals(ParseStatus.IGNORED, res.status());
        verify(expense, never()).create(any());
    }

    @Test
    void aRetryOfTheSameAmountCarriesItsOwnReference() {
        ingest(RETRY);

        ArgumentCaptor<ExpenseClient.CreateTransactionRequest> sent =
            ArgumentCaptor.forClass(ExpenseClient.CreateTransactionRequest.class);
        verify(expense).create(sent.capture());
        assertEquals("664546784453", sent.getValue().reference(),
            "expense-service hashes on this, so the retry is not a duplicate of the first attempt");
    }
}
