package com.jarvis.expense.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.jarvis.expense.domain.Account;
import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.domain.Category;
import com.jarvis.expense.domain.Direction;
import com.jarvis.expense.domain.MessageSource;
import com.jarvis.expense.domain.Transaction;
import com.jarvis.expense.repo.AccountRepository;
import com.jarvis.expense.repo.CategoryRepository;
import com.jarvis.expense.repo.TransactionRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CardPaymentServiceTest {

    private TransactionRepository transactions;
    private AccountRepository accounts;
    private TransferService transfers;
    private CardPaymentService service;
    private final Account card = new Account();

    @BeforeEach
    void setUp() {
        transactions = mock(TransactionRepository.class);
        accounts = mock(AccountRepository.class);
        CategoryRepository categories = mock(CategoryRepository.class);
        transfers = mock(TransferService.class);
        card.setId(7L);
        card.setType(AccountType.CREDIT_CARD);
        card.setLast4("0009");
        card.setBillingGroup("ICICI");
        when(accounts.findById(7L)).thenReturn(Optional.of(card));
        when(accounts.findAll()).thenReturn(List.of(card));
        when(categories.findByNameIgnoreCase(any())).thenReturn(Optional.of(new Category("Card Payment")));
        when(transactions.save(any(Transaction.class))).thenAnswer(inv -> inv.getArgument(0));
        service = new CardPaymentService(transactions, accounts, categories, transfers, new Scope(accounts));
    }

    @Test
    void aPaymentWithNoSavingsSideYetIsDeclaredSoItCountsAsPaid() {
        when(transfers.pair(any())).thenReturn(false);
        var dto = service.record(7L, new BigDecimal("49675"), null);
        assertTrue(dto.settlement(), "must count as a bill payment, not a refund on the card");
        assertEquals(Direction.CREDIT, dto.direction());
        assertEquals("Card Payment", dto.category());
    }

    @Test
    void aPaymentThatPairsWithItsSavingsDebitIsNotDeclared() {
        when(transfers.pair(any())).thenAnswer(inv -> {
            Transaction t = inv.getArgument(0);
            t.setSettlement(true);
            return true;
        });
        service.record(7L, new BigDecimal("49675"), null);
        verify(transactions, org.mockito.Mockito.atLeastOnce()).save(org.mockito.ArgumentMatchers.argThat(t -> !t.isSettlementDeclared()));
    }

    @Test
    void theBanksAlertConfirmsAHandMarkedPaymentInsteadOfAddingOne() {
        Transaction marked = new Transaction();
        marked.setAccount(card);
        marked.setSource(MessageSource.MANUAL);
        marked.setDirection(Direction.CREDIT);
        marked.setAmount(new BigDecimal("49675"));
        when(transactions.findManualCardPayments(anyCollection(), any(), any(), any(), any())).thenReturn(List.of(marked));

        Transaction alert = new Transaction();
        alert.setAccount(card);
        alert.setDirection(Direction.CREDIT);
        alert.setAmount(new BigDecimal("49675.00"));
        alert.setSource(MessageSource.SMS);
        alert.setSourceRef("612");
        alert.setMerchant("PAYMENT RECEIVED THANK YOU");
        alert.setOccurredAt(Instant.parse("2026-10-01T05:00:00Z"));

        Optional<Transaction> confirmed = service.confirm(alert);
        assertTrue(confirmed.isPresent());
        assertEquals(MessageSource.SMS, marked.getSource());
        assertEquals("612", marked.getSourceRef());
    }

    @Test
    void aPurchaseOnTheCardIsNeverTakenForAConfirmation() {
        Transaction purchase = new Transaction();
        purchase.setAccount(card);
        purchase.setDirection(Direction.DEBIT);
        purchase.setAmount(new BigDecimal("499"));
        assertFalse(service.confirm(purchase).isPresent());
        verify(transactions, never()).findManualCardPayments(anyCollection(), any(), any(), any(), any());
    }
}
