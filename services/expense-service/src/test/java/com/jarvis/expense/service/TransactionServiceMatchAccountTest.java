package com.jarvis.expense.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.jarvis.expense.domain.Account;
import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.repo.AccountRepository;
import com.jarvis.expense.repo.CategoryRepository;
import com.jarvis.expense.repo.TransactionRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TransactionServiceMatchAccountTest {

    private AccountRepository accounts;
    private TransactionService service;

    private final Account savings = account(5L, "ICICI", AccountType.SAVINGS, "1380");
    private final Account card3007 = account(8L, "ICICI Bank", AccountType.CREDIT_CARD, "3007");
    private final Account hdfc2380 = account(9L, "HDFC", AccountType.SAVINGS, "2380");

    @BeforeEach
    void setUp() {
        accounts = mock(AccountRepository.class);
        when(accounts.findByLast4(anyString())).thenReturn(List.of());
        service = new TransactionService(
            mock(TransactionRepository.class), accounts, mock(CategoryRepository.class), mock(DedupHasher.class),
            mock(TransferService.class), mock(RuleService.class));
    }

    @Test
    void exactLast4Wins() {
        when(accounts.findByLast4("3007")).thenReturn(List.of(card3007));
        assertEquals(Optional.of(card3007), service.matchAccount("3007", null));
    }

    @Test
    void threeDigitSuffixMatchesTheOnlyAccountEndingWithIt() {
        when(accounts.findAll()).thenReturn(List.of(savings, card3007));
        assertEquals(Optional.of(savings), service.matchAccount("380", "ICICI"));
    }

    @Test
    void ambiguousSuffixWithoutBankHintMatchesNothing() {
        when(accounts.findAll()).thenReturn(List.of(savings, hdfc2380));
        assertTrue(service.matchAccount("380", null).isEmpty());
    }

    @Test
    void bankHintBreaksTheTie() {
        when(accounts.findAll()).thenReturn(List.of(savings, hdfc2380));
        assertEquals(Optional.of(hdfc2380), service.matchAccount("380", "HDFC"));
        assertEquals(Optional.of(savings), service.matchAccount("380", "ICICI"));
    }

    @Test
    void fourDigitsNeverFallBackToSuffix() {
        when(accounts.findAll()).thenReturn(List.of(savings));
        assertTrue(service.matchAccount("9380", null).isEmpty());
    }

    @Test
    void nonDigitsNeverFallBackToSuffix() {
        when(accounts.findAll()).thenReturn(List.of(savings));
        assertTrue(service.matchAccount("X80", null).isEmpty());
    }

    private static Account account(Long id, String bank, AccountType type, String last4) {
        Account a = new Account();
        a.setId(id);
        a.setBank(bank);
        a.setType(type);
        a.setLast4(last4);
        return a;
    }
}
