package com.jarvis.expense.web.internal;

import com.jarvis.expense.domain.Account;
import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.repo.AccountRepository;
import com.jarvis.expense.web.dto.AccountDto;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

    /** All accounts (used by ingestion to learn the user's credit-card last-4s). */
    @GetMapping
    public List<AccountDto> list(
        @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireKey(key);
        return accounts.findAll().stream().map(AccountDto::from).toList();
    }

    /** Look up an existing account without creating one — used by statement preview to set isNew. */
    @GetMapping("/find")
    public ResponseEntity<AccountDto> find(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @RequestParam(required = false) String bank,
        @RequestParam String last4) {
        requireKey(key);
        if (last4 == null || last4.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "last4 is required");
        }
        return lookup(bank, last4.trim())
            .map(a -> ResponseEntity.ok(AccountDto.from(a)))
            .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/resolve")
    @Transactional
    public AccountDto resolve(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @RequestBody ResolveAccountRequest req) {
        requireKey(key);
        if (req.last4() == null || req.last4().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "last4 is required to resolve an account");
        }
        String last4 = req.last4().trim();

        // Match an existing account first…
        Optional<Account> existing = lookup(req.bank(), last4);
        if (existing.isPresent()) return AccountDto.from(existing.get());

        // …else auto-create a minimal account.
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

    /** Match by exact bank + last-4, else by any account with that last-4. */
    private Optional<Account> lookup(String bank, String last4) {
        if (bank != null && !bank.isBlank()) {
            var byBank = accounts.findByBankIgnoreCaseAndLast4(bank.trim(), last4);
            if (byBank.isPresent()) return byBank;
        }
        List<Account> byLast4 = accounts.findByLast4(last4);
        return byLast4.isEmpty() ? Optional.empty() : Optional.of(byLast4.get(0));
    }

    private void requireKey(String key) {
        if (!internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bad internal key");
        }
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
