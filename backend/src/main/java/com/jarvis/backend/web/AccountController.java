package com.jarvis.backend.web;

import com.jarvis.backend.domain.Account;
import com.jarvis.backend.repo.AccountRepository;
import com.jarvis.backend.web.dto.AccountDto;
import com.jarvis.backend.web.dto.AccountRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/accounts")
public class AccountController {

    private final AccountRepository accounts;

    public AccountController(AccountRepository accounts) {
        this.accounts = accounts;
    }

    @GetMapping
    public List<AccountDto> list() {
        return accounts.findAll().stream().map(AccountDto::from).toList();
    }

    @GetMapping("/{id}")
    public AccountDto get(@PathVariable Long id) {
        return accounts.findById(id).map(AccountDto::from).orElseThrow(this::notFound);
    }

    @PostMapping
    public ResponseEntity<AccountDto> create(@Valid @RequestBody AccountRequest req) {
        Account a = new Account();
        apply(a, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(AccountDto.from(accounts.save(a)));
    }

    @PutMapping("/{id}")
    public AccountDto update(@PathVariable Long id, @Valid @RequestBody AccountRequest req) {
        Account a = accounts.findById(id).orElseThrow(this::notFound);
        apply(a, req);
        return AccountDto.from(accounts.save(a));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        if (!accounts.existsById(id)) {
            throw notFound();
        }
        accounts.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /** Copy all editable fields from the request onto the entity. */
    private void apply(Account a, AccountRequest req) {
        a.setBank(req.bank());
        a.setType(req.type());
        a.setLast4(req.last4());
        a.setDisplayName(req.displayName());
        a.setCurrency(req.currency() == null || req.currency().isBlank() ? "INR" : req.currency());
        a.setNetwork(req.network());
        a.setCardHolderName(req.cardHolderName());
        a.setCreditLimit(req.creditLimit());
        a.setBillingCycleDay(req.billingCycleDay());
        a.setPaymentDueDay(req.paymentDueDay());
        a.setExpiryMonth(req.expiryMonth());
        a.setExpiryYear(req.expiryYear());
        a.setIfsc(req.ifsc());
        a.setBranch(req.branch());
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found");
    }
}
