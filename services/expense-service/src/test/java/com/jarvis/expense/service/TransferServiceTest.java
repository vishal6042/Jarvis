package com.jarvis.expense.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.jarvis.expense.domain.Account;
import com.jarvis.expense.domain.Category;
import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.domain.Direction;
import com.jarvis.expense.domain.Transaction;
import com.jarvis.expense.repo.CategoryRepository;
import com.jarvis.expense.repo.TransactionRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TransferServiceTest {

    private TransactionRepository repo;
    private CategoryRepository categories;
    private TransferService service;
    private final Account icici = account(5L);
    private final Account sbi = account(10L);

    @BeforeEach
    void setUp() {
        repo = mock(TransactionRepository.class);
        categories = mock(CategoryRepository.class);
        Category cardPayment = new Category();
        cardPayment.setName("Card Payment");
        when(categories.findByNameIgnoreCase("Card Payment")).thenReturn(java.util.Optional.of(cardPayment));
        service = new TransferService(repo, categories);
    }

    @Test
    void pairsDebitWithSameAmountCreditOnAnotherAccount() {
        Transaction debit = txn(1L, icici, Direction.DEBIT, "70000", "2026-05-06T00:00:00Z");
        Transaction credit = txn(2L, sbi, Direction.CREDIT, "70000", "2026-05-06T00:00:00Z");
        when(repo.findTransferCandidates(eq(Direction.CREDIT), eq(new BigDecimal("70000")), eq(5L), any(), any()))
            .thenReturn(List.of(credit));

        assertTrue(service.pair(debit));
        assertTrue(debit.isTransfer());
        assertTrue(credit.isTransfer());
        verify(repo).save(debit);
        verify(repo).save(credit);
    }

    @Test
    void picksTheClosestInTimeWhenSeveralMatch() {
        Transaction debit = txn(1L, icici, Direction.DEBIT, "5000", "2026-08-10T12:00:00Z");
        Transaction farther = txn(2L, sbi, Direction.CREDIT, "5000", "2026-08-08T12:00:00Z");
        Transaction nearer = txn(3L, sbi, Direction.CREDIT, "5000", "2026-08-11T00:00:00Z");
        when(repo.findTransferCandidates(any(), any(), any(), any(), any())).thenReturn(List.of(farther, nearer));

        assertTrue(service.pair(debit));
        assertTrue(nearer.isTransfer());
        assertFalse(farther.isTransfer());
    }

    @Test
    void noCandidateLeavesRowUntouched() {
        Transaction debit = txn(1L, icici, Direction.DEBIT, "500000", "2026-07-31T00:00:00Z");
        when(repo.findTransferCandidates(any(), any(), any(), any(), any())).thenReturn(List.of());

        assertFalse(service.pair(debit));
        assertFalse(debit.isTransfer());
        verify(repo, never()).save(any());
    }

    @Test
    void unlinkedOrAlreadyFlaggedRowsAreSkipped() {
        Transaction noAccount = txn(1L, null, Direction.DEBIT, "100", "2026-07-31T00:00:00Z");
        assertFalse(service.pair(noAccount));
        Transaction flagged = txn(2L, icici, Direction.DEBIT, "100", "2026-07-31T00:00:00Z");
        flagged.setTransfer(true);
        assertFalse(service.pair(flagged));
        verify(repo, never()).findTransferCandidates(any(), any(), any(), any(), any());
    }

    @Test
    void creditCardBillPaymentsBecomeSettlementsNotTransfers() {
        // A savings debit that lands on a card is the bill payment: flag both as settlement,
        // categorise both "Card Payment", and never mark them as a bank transfer.
        Account card = account(8L);
        card.setType(AccountType.CREDIT_CARD);
        Transaction billPay = txn(1L, icici, Direction.DEBIT, "118428", "2026-09-02T00:00:00Z");
        Transaction cardCredit = txn(2L, card, Direction.CREDIT, "118428", "2026-09-02T00:00:00Z");
        when(repo.findTransferCandidates(any(), any(), any(), any(), any())).thenReturn(List.of(cardCredit));

        assertTrue(service.pair(billPay));
        assertTrue(billPay.isSettlement());
        assertTrue(cardCredit.isSettlement());
        assertFalse(billPay.isTransfer());
        assertFalse(cardCredit.isTransfer());
        assertEquals("Card Payment", billPay.getCategory().getName());
        assertEquals("Card Payment", cardCredit.getCategory().getName());
    }

    @Test
    void cardPurchasesAndCardToCardNeverPair() {
        Account card = account(8L);
        card.setType(AccountType.CREDIT_CARD);
        Account card2 = account(9L);
        card2.setType(AccountType.CREDIT_CARD);
        // savings CREDIT + card DEBIT is not a bill payment (would be a cash advance / refund shape)
        Transaction savingsCredit = txn(1L, icici, Direction.CREDIT, "5000", "2026-09-02T00:00:00Z");
        Transaction cardDebit = txn(2L, card, Direction.DEBIT, "5000", "2026-09-02T00:00:00Z");
        when(repo.findTransferCandidates(any(), any(), any(), any(), any())).thenReturn(List.of(cardDebit));
        assertFalse(service.pair(savingsCredit));
        // card → card never pairs
        Transaction cardA = txn(3L, card, Direction.DEBIT, "700", "2026-09-02T00:00:00Z");
        Transaction cardB = txn(4L, card2, Direction.CREDIT, "700", "2026-09-02T00:00:00Z");
        when(repo.findTransferCandidates(any(), any(), any(), any(), any())).thenReturn(List.of(cardB));
        assertFalse(service.pair(cardA));
    }

    private static Account account(Long id) {
        Account a = new Account();
        a.setId(id);
        a.setType(AccountType.SAVINGS);
        return a;
    }

    private static Transaction txn(Long id, Account account, Direction dir, String amount, String at) {
        Transaction t = new Transaction();
        t.setId(id);
        t.setAccount(account);
        t.setDirection(dir);
        t.setAmount(new BigDecimal(amount));
        t.setOccurredAt(Instant.parse(at));
        return t;
    }
}
