package com.jarvis.ingestion.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.jarvis.ingestion.client.AiClient;
import com.jarvis.ingestion.client.ExpenseClient;
import com.jarvis.ingestion.client.FinanceClient;
import com.jarvis.ingestion.domain.MessageSource;
import com.jarvis.ingestion.domain.ParseStatus;
import com.jarvis.ingestion.domain.RawMessage;
import com.jarvis.ingestion.repo.RawMessageRepository;
import com.jarvis.ingestion.web.dto.IngestRequest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * An EPFO SMS's "passbook balance" leaves out the yearly interest credit, so it reads lakhs below
 * the real passbook. Only its contribution may reach the PF investment; the balance must not
 * replace a value the user set from the passbook.
 */
class IngestionServiceEpfTest {

    private static final String EPFO_SMS =
        "Dear XXXXXXXX8133, your passbook balance against BGBNG**************9425 is Rs. 36,51,714/-."
            + " Contribution of Rs. 53,994/- for due month Jul-26 has been received.";

    private RawMessageRepository rawMessages;
    private FinanceClient finance;
    private IngestionService service;

    @BeforeEach
    void setUp() {
        rawMessages = mock(RawMessageRepository.class);
        finance = mock(FinanceClient.class);
        service = new IngestionService(
            rawMessages, mock(AiClient.class), mock(ExpenseClient.class), finance, new PayloadHasher());
        when(rawMessages.save(any(RawMessage.class))).thenAnswer(inv -> {
            RawMessage m = inv.getArgument(0);
            if (m.getId() == null) {
                m.setId(99L);
            }
            return m;
        });
        when(rawMessages.findFirstByPayloadHashAndStatusInOrderByIdAsc(anyString(), any()))
            .thenReturn(Optional.empty());
        when(finance.findByLast4(eq("9425"), any()))
            .thenReturn(Optional.of(new FinanceClient.LinkedInvestment(5L, "EPF •••• 9425", "9425")));
        when(finance.contribute(any(), any(), any(), any(), any()))
            .thenReturn(new FinanceClient.ContributionResult(5L, "EPF •••• 9425", new BigDecimal("4123990"), true));
    }

    @Test
    void epfoSmsAddsTheContributionButNotItsBalance() {
        service.ingest(new IngestRequest(
            MessageSource.SMS, EPFO_SMS, "VA-EPFOHO-G", Instant.parse("2026-08-15T10:00:00Z")));

        ArgumentCaptor<BigDecimal> amount = ArgumentCaptor.forClass(BigDecimal.class);
        verify(finance).contribute(eq("9425"), amount.capture(), isNull(), eq(LocalDate.of(2026, 7, 1)), any());
        assertEquals(0, new BigDecimal("53994").compareTo(amount.getValue()));

        ArgumentCaptor<RawMessage> saved = ArgumentCaptor.forClass(RawMessage.class);
        verify(rawMessages, org.mockito.Mockito.atLeastOnce()).save(saved.capture());
        assertEquals(ParseStatus.INVESTMENT, saved.getValue().getStatus());
    }

    @Test
    void epfoSmsNeverSendsTheStatedBalance() {
        service.ingest(new IngestRequest(
            MessageSource.SMS, EPFO_SMS, "VA-EPFOHO-G", Instant.parse("2026-08-15T10:00:00Z")));

        verify(finance, never()).contribute(any(), any(), org.mockito.ArgumentMatchers.notNull(), any(), any());
    }
}
