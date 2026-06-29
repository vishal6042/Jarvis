package com.jarvis.expense.service;

import com.jarvis.expense.domain.Account;
import com.jarvis.expense.domain.Category;
import com.jarvis.expense.domain.MessageSource;
import com.jarvis.expense.domain.Transaction;
import com.jarvis.expense.repo.AccountRepository;
import com.jarvis.expense.repo.CategoryRepository;
import com.jarvis.expense.repo.TransactionRepository;
import com.jarvis.expense.web.dto.CreateTransactionRequest;
import com.jarvis.expense.web.dto.InternalTransactionRequest;
import com.jarvis.expense.web.dto.TransactionDto;
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
     * Create a transaction from a parsed alert (ingestion-service → expense internal endpoint):
     * matches the account by last-4, assigns the category, and dedups. Returns empty on duplicate.
     */
    @Transactional
    public Optional<TransactionDto> ingestParsed(InternalTransactionRequest req) {
        Transaction t = new Transaction();
        t.setAmount(req.amount());
        t.setCurrency(req.currency() == null ? "INR" : req.currency());
        t.setDirection(req.direction());
        t.setMerchant(req.merchant());
        t.setOccurredAt(req.occurredAt() == null ? Instant.now() : req.occurredAt());
        t.setSource(req.source() == null ? MessageSource.SMS : req.source());
        t.setSourceRef(req.sourceRef());

        // Prefer an explicit account (statement import); else match by last-4 when unambiguous.
        if (req.accountId() != null) {
            accounts.findById(req.accountId()).ifPresent(t::setAccount);
        } else if (req.last4() != null && !req.last4().isBlank()) {
            List<Account> matches = accounts.findByLast4(req.last4());
            if (matches.size() == 1) {
                t.setAccount(matches.get(0));
            }
        }
        if (req.category() != null && !req.category().isBlank()) {
            t.setCategory(findOrCreateCategory(req.category().trim()));
        }

        String last4 = t.getAccount() != null ? t.getAccount().getLast4() : req.last4();
        t.setDedupHash(dedupHasher.hash(last4, t.getAmount(), t.getOccurredAt(), t.getMerchant()));

        return save(t).map(TransactionDto::from);
    }

    /**
     * Persist a transaction unless its dedup hash already exists.
     * Returns empty when it was a duplicate. Shared by manual entry and the ingestion pipeline.
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
