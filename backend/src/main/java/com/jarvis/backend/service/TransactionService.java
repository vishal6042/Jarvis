package com.jarvis.backend.service;

import com.jarvis.backend.domain.Account;
import com.jarvis.backend.domain.Category;
import com.jarvis.backend.domain.MessageSource;
import com.jarvis.backend.domain.Transaction;
import com.jarvis.backend.repo.AccountRepository;
import com.jarvis.backend.repo.CategoryRepository;
import com.jarvis.backend.repo.TransactionRepository;
import com.jarvis.backend.web.dto.CreateTransactionRequest;
import com.jarvis.backend.web.dto.TransactionDto;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TransactionService {

    private final TransactionRepository transactions;
    private final AccountRepository accounts;
    private final CategoryRepository categories;
    private final DedupHasher dedupHasher;

    public TransactionService(
        TransactionRepository transactions,
        AccountRepository accounts,
        CategoryRepository categories,
        DedupHasher dedupHasher) {
        this.transactions = transactions;
        this.accounts = accounts;
        this.categories = categories;
        this.dedupHasher = dedupHasher;
    }

    @Transactional(readOnly = true)
    public List<TransactionDto> list(int page, int size) {
        return transactions
            .findByOrderByOccurredAtDesc(PageRequest.of(page, size))
            .map(TransactionDto::from)
            .getContent();
    }

    @Transactional(readOnly = true)
    public TransactionDto get(Long id) {
        return transactions
            .findById(id)
            .map(TransactionDto::from)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Transaction not found"));
    }

    @Transactional
    public TransactionDto createManual(CreateTransactionRequest req) {
        Transaction t = new Transaction();
        t.setAmount(req.amount());
        t.setCurrency(req.currency() == null ? "INR" : req.currency());
        t.setDirection(req.direction());
        t.setMerchant(req.merchant());
        t.setOccurredAt(req.occurredAt() == null ? Instant.now() : req.occurredAt());
        t.setSource(MessageSource.MANUAL);
        t.setNote(req.note());

        if (req.accountId() != null) {
            Account account = accounts
                .findById(req.accountId())
                .orElseThrow(
                    () -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown accountId"));
            t.setAccount(account);
        }
        if (req.category() != null && !req.category().isBlank()) {
            t.setCategory(findOrCreateCategory(req.category().trim()));
        }

        String last4 = t.getAccount() != null ? t.getAccount().getLast4() : null;
        t.setDedupHash(dedupHasher.hash(last4, t.getAmount(), t.getOccurredAt(), t.getMerchant()));

        return TransactionDto.from(save(t).orElseThrow(
            () -> new ResponseStatusException(HttpStatus.CONFLICT, "Duplicate transaction")));
    }

    /**
     * Persist a transaction unless its dedup hash already exists.
     * Returns empty when it was a duplicate. Shared by manual entry and the parser pipeline.
     */
    @Transactional
    public Optional<Transaction> save(Transaction t) {
        if (t.getDedupHash() != null && transactions.existsByDedupHash(t.getDedupHash())) {
            return Optional.empty();
        }
        return Optional.of(transactions.save(t));
    }

    @Transactional
    public Category findOrCreateCategory(String name) {
        return categories
            .findByNameIgnoreCase(name)
            .orElseGet(() -> categories.save(new Category(name)));
    }
}
