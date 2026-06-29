package com.jarvis.expense.web.internal;

import com.jarvis.expense.domain.Account;
import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.repo.AccountRepository;
import com.jarvis.expense.web.dto.AccountDto;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Resolve the account a statement belongs to (used by statement import): match by bank + last-4,
 * else by last-4, else **auto-create** a minimal account so its transactions have a home.
 * Service-to-service only; guarded by the shared internal key.
 */
@RestController
@RequestMapping("/internal/accounts")
public class InternalAccountController {

    private final AccountRepository accounts;
    private final String internalKey;

    public InternalAccountController(
        AccountRepository accounts, @Value("${jarvis.internal.key}") String internalKey) {
        this.accounts = accounts;
        this.internalKey = internalKey;
    }

    @PostMapping("/resolve")
    @Transactional
    public AccountDto resolve(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @RequestBody ResolveAccountRequest req) {
        if (!internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bad internal key");
        }
        if (req.last4() == null || req.last4().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "last4 is required to resolve an account");
        }
        String last4 = req.last4().trim();

        // 1) exact bank + last4
        if (req.bank() != null && !req.bank().isBlank()) {
            var byBank = accounts.findByBankIgnoreCaseAndLast4(req.bank().trim(), last4);
            if (byBank.isPresent()) return AccountDto.from(byBank.get());
        }
        // 2) any account with this last4
        List<Account> byLast4 = accounts.findByLast4(last4);
        if (!byLast4.isEmpty()) return AccountDto.from(byLast4.get(0));

        // 3) auto-create a minimal account
        AccountType type = parseType(req.type());
        String bank = req.bank() == null || req.bank().isBlank() ? "Unknown" : req.bank().trim();
        Account a = new Account();
        a.setBank(bank);
        a.setType(type);
        a.setLast4(last4);
        a.setDisplayName(bank + " •••• " + last4);
        a.setCurrency("INR");
        return AccountDto.from(accounts.save(a));
    }

    private AccountType parseType(String raw) {
        if (raw == null) return AccountType.SAVINGS;
        try {
            return AccountType.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return AccountType.SAVINGS;
        }
    }

    public record ResolveAccountRequest(String bank, String last4, String type) {}
}
