package com.jarvis.ingestion.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
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

/**
 * The same alert reaches the server twice — the phone forwards it live, and the Inbox backfill
 * sends it again. Re-parsing it is what created a second transaction, because the parse is an
 * LLM call whose merchant/date output can differ between runs and so misses the dedup hash
 * computed downstream. It must not be parsed a second time at all.
 */
class IngestionServiceDuplicateTest {

    private static final String ALERT =
        "ICICI Bank Acct XX380 debited for Rs 1420.00 on 05-Sep-26; BESCOM credited. UPI:123456789012.";
    private static final Instant AT = Instant.parse("2026-09-05T09:30:00Z");

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
        // save() returns what it was given, with an id, as the real repository would.
        when(rawMessages.save(any(RawMessage.class))).thenAnswer(inv -> {
            RawMessage m = inv.getArgument(0);
            if (m.getId() == null) {
                m.setId(99L);
            }
            return m;
        });
    }

    private IngestRequest request() {
        return new IngestRequest(MessageSource.SMS, ALERT, "VM-ICICIB", AT);
    }

    @Test
    void repeatOfAnAlreadyStoredAlertIsNotParsedAgain() {
        RawMessage first = new RawMessage();
        first.setId(7L);
        first.setStatus(ParseStatus.PARSED);
        first.setTransactionRef(814L);
        when(rawMessages.findFirstByPayloadHashAndStatusInOrderByIdAsc(anyString(), any()))
            .thenReturn(Optional.of(first));

        IngestResponse res = service.ingest(request());

        assertEquals(ParseStatus.DUPLICATE, res.status());
        assertEquals(814L, res.transactionId(), "the repeat points at the transaction that already exists");
        // The whole point: no second parse, so no second chance to produce a different dedup hash.
        verifyNoInteractions(ai);
        verifyNoInteractions(expense);
    }

    @Test
    void aFirstArrivalStillGoesThroughTheParser() {
        when(rawMessages.findFirstByPayloadHashAndStatusInOrderByIdAsc(anyString(), any()))
            .thenReturn(Optional.empty());
        when(ai.parse(anyString())).thenReturn(null); // classified as not a transaction

        IngestResponse res = service.ingest(request());

        verify(ai).parse(ALERT);
        assertNotEquals(ParseStatus.DUPLICATE, res.status());
    }

    @Test
    void theKeyIsStableForOneAlertAndSeparatesItFromTheSameTextADayLater() {
        PayloadHasher hasher = new PayloadHasher();
        String a = hasher.hash(MessageSource.SMS, "VM-ICICIB", ALERT, AT);
        String b = hasher.hash(MessageSource.SMS, "VM-ICICIB", ALERT, AT.plusSeconds(3600));
        String nextDay = hasher.hash(MessageSource.SMS, "VM-ICICIB", ALERT, AT.plusSeconds(86_400));

        assertEquals(a, b, "the same alert later the same day is the same event");
        assertNotEquals(a, nextDay, "identical text on another day is a new event, not a repeat");
    }

    /** The statuses that mean an earlier arrival already counted, and nothing else. */
    @Test
    void anEarlierArrivalThatProducedNothingDoesNotSuppressTheRetry() {
        // IGNORED / FAILED are not in the lookup, so the repository is asked only about the
        // statuses that really did produce something and the alert is parsed again.
        when(rawMessages.findFirstByPayloadHashAndStatusInOrderByIdAsc(anyString(), any()))
            .thenReturn(Optional.empty());
        when(ai.parse(anyString())).thenReturn(null);

        service.ingest(request());

        verify(rawMessages).findFirstByPayloadHashAndStatusInOrderByIdAsc(
            anyString(),
            org.mockito.ArgumentMatchers.argThat(statuses -> {
                List<ParseStatus> s = List.copyOf(statuses);
                return s.contains(ParseStatus.PARSED)
                    && s.contains(ParseStatus.INVESTMENT)
                    && s.contains(ParseStatus.DUPLICATE)
                    && !s.contains(ParseStatus.IGNORED)
                    && !s.contains(ParseStatus.FAILED);
            }));
    }
}
