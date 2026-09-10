package com.jarvis.expense.service;

import com.jarvis.expense.domain.Direction;

import java.time.ZoneOffset;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.Comparator;
import java.util.ArrayList;
import java.math.BigDecimal;
import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.domain.Account;
import com.jarvis.expense.domain.Category;
import com.jarvis.expense.domain.MerchantAlias;
import com.jarvis.expense.domain.MessageSource;
import com.jarvis.expense.domain.Transaction;
import com.jarvis.expense.repo.AccountRepository;
import com.jarvis.expense.repo.CategoryRepository;
import com.jarvis.expense.repo.MerchantAliasRepository;
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
    private final TransferService transfers;
    private final RuleService rules;
    private final MerchantAliasRepository aliases;
    private final Scope scope;

    public TransactionService(
        TransactionRepository transactions,
        AccountRepository accounts,
        CategoryRepository categories,
        DedupHasher dedupHasher,
        TransferService transfers,
        RuleService rules,
        MerchantAliasRepository aliases,
        Scope scope) {
        this.transactions = transactions;
        this.accounts = accounts;
        this.categories = categories;
        this.dedupHasher = dedupHasher;
        this.transfers = transfers;
        this.rules = rules;
        this.aliases = aliases;
        this.scope = scope;
    }

    /**
     * Load a row the caller is allowed to touch. A member confined to their own money must not be
     * able to read or edit someone elses transaction by guessing its id, so a row outside their
     * accounts is reported as missing rather than as forbidden.
     */
    private Transaction owned(Long id) {
        Transaction t = transactions
            .findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Transaction not found"));
        if (t.getAccount() == null ? !scope.all() : !scope.canSee(t.getAccount())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transaction not found");
        }
        return t;
    }

    @Transactional(readOnly = true)
    public List<TransactionDto> findByAmountInWindow(Direction direction, BigDecimal min, BigDecimal max, Instant from, Instant to) {
        return transactions.findByAmountBetweenInWindow(direction, min, max, from, to).stream().map(TransactionDto::from).toList();
    }

    /** Replace the tag list (trimmed, de-duplicated, at most 20, stored comma-separated). */
    @Transactional
    public TransactionDto setTags(Long id, List<String> tags) {
        Transaction t = owned(id);
        List<String> clean = tags == null
            ? List.of()
            : tags.stream()
                .filter(s -> s != null)
                .map(s -> s.trim().replace(",", " "))
                .filter(s -> !s.isEmpty())
                .distinct()
                .limit(20)
                .toList();
        t.setTags(clean.isEmpty() ? null : String.join(",", clean));
        return TransactionDto.from(transactions.save(t));
    }

    /** Set one category on many rows at once (bulk action from the Transactions page). */
    @Transactional
    public int bulkSetCategory(List<Long> ids, String category) {
        if (ids == null || ids.isEmpty()) {
            return 0;
        }
        Category c = category == null || category.isBlank() ? null : findOrCreateCategory(category.trim());
        List<Transaction> rows = transactions.findAllById(ids).stream()
            .filter(t -> t.getAccount() != null ? scope.canSee(t.getAccount()) : scope.all())
            .toList();
        rows.forEach(t -> t.setCategory(c));
        transactions.saveAll(rows);
        return rows.size();
    }

    /** Set just the category (inline edit from the Transactions page). */
    @Transactional
    public TransactionDto setCategory(Long id, String category) {
        Transaction t = owned(id);
        t.setCategory(category == null || category.isBlank() ? null : findOrCreateCategory(category.trim()));
        return TransactionDto.from(transactions.save(t));
    }

    /**
     * Same-day, same-amount, same-direction rows that are probably one transaction seen twice
     * (statement import + SMS with different merchant text). Pairs of [first, second].
     */
    @Transactional(readOnly = true)
    public List<List<TransactionDto>> duplicateCandidates() {
        Map<String, List<Transaction>> groups = new LinkedHashMap<>();
        for (Transaction t : transactions.findVisible(scope.all(), scope.accountIds())) {
            if (t.isTransfer() || t.isSettlement()) {
                continue;
            }
            String key = t.getDirection() + "|" + t.getAmount().stripTrailingZeros().toPlainString() + "|"
                + t.getOccurredAt().atZone(ZoneOffset.UTC).toLocalDate();
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(t);
        }
        List<List<TransactionDto>> out = new ArrayList<>();
        for (List<Transaction> g : groups.values()) {
            if (g.size() < 2) {
                continue;
            }
            // Post office RDs etc. legitimately repeat on the same day across DIFFERENT accounts — skip those.
            g.sort(Comparator.comparing(Transaction::getId));
            for (int i = 1; i < g.size(); i++) {
                Transaction a = g.get(0);
                Transaction b = g.get(i);
                // Two rows from the same statement are two real transactions (e.g. two ATM withdrawals).
                if (a.getSource() == MessageSource.STATEMENT && b.getSource() == MessageSource.STATEMENT) {
                    continue;
                }
                boolean sameAccount = a.getAccount() != null && b.getAccount() != null
                    && a.getAccount().getId().equals(b.getAccount().getId());
                boolean oneUnlinked = a.getAccount() == null || b.getAccount() == null;
                if (sameAccount || oneUnlinked) {
                    out.add(List.of(TransactionDto.from(a), TransactionDto.from(b)));
                }
            }
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<TransactionDto> list(int page, int size) {
        return transactions
            .findVisible(scope.all(), scope.accountIds(), PageRequest.of(page, size))
            .map(TransactionDto::from)
            .getContent();
    }

    @Transactional(readOnly = true)
    public TransactionDto get(Long id) {
        return TransactionDto.from(owned(id));
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
        t.setTransfer(Boolean.TRUE.equals(req.transfer()));
        t.setTransferDeclared(Boolean.TRUE.equals(req.transfer()));

        t.setAccount(requireOwnAccount(req.accountId()));
        if (req.category() != null && !req.category().isBlank()) {
            t.setCategory(findOrCreateCategory(req.category().trim()));
        }

        String last4 = t.getAccount() != null ? t.getAccount().getLast4() : null;
        t.setDedupHash(dedupHasher.hash(last4, t.getAmount(), t.getOccurredAt(), t.getMerchant()));

        return TransactionDto.from(save(t).orElseThrow(
            () -> new ResponseStatusException(HttpStatus.CONFLICT, "Duplicate transaction")));
    }

    /** Edit an existing transaction (manual correction of an imported or entered row). */
    @Transactional
    public TransactionDto update(Long id, CreateTransactionRequest req) {
        Transaction t = owned(id);
        t.setAmount(req.amount());
        if (req.currency() != null && !req.currency().isBlank()) {
            t.setCurrency(req.currency());
        }
        t.setDirection(req.direction());
        t.setMerchant(req.merchant());
        if (req.occurredAt() != null) {
            t.setOccurredAt(req.occurredAt());
        }
        t.setNote(req.note());

        t.setAccount(requireOwnAccount(req.accountId()));
        t.setCategory(
            req.category() != null && !req.category().isBlank()
                ? findOrCreateCategory(req.category().trim())
                : null);
        // Only when the caller says so: an edit that omits the field must not undo a pairing.
        if (req.transfer() != null) {
            t.setTransfer(req.transfer());
            t.setTransferDeclared(req.transfer());
        }

        // Recompute the dedup hash so future imports still dedupe against the edited values — but
        // drop it if that would collide with a different row (the column is uniquely indexed).
        String last4 = t.getAccount() != null ? t.getAccount().getLast4() : null;
        String hash = dedupHasher.hash(last4, t.getAmount(), t.getOccurredAt(), t.getMerchant());
        t.setDedupHash(hash != null && transactions.existsByDedupHashAndIdNot(hash, id) ? null : hash);

        return TransactionDto.from(transactions.save(t));
    }

    /** Delete a transaction outright (duplicate / mistaken row). */
    @Transactional
    public void delete(Long id) {
        transactions.delete(owned(id));
    }

    /** The account a manual entry names — and only if the caller may post to it. */
    private Account requireOwnAccount(Long accountId) {
        if (accountId == null) {
            return null;
        }
        Account account = accounts
            .findById(accountId)
            .filter(scope::canSee)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown accountId"));
        return account;
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
        // Either way the account has to be one the forwarder is allowed to post to.
        if (req.accountId() != null) {
            accounts.findById(req.accountId())
                .filter(a -> req.memberId() == null || req.memberId().equals(a.getMemberId()))
                .ifPresent(t::setAccount);
        } else if (req.last4() != null && !req.last4().isBlank()) {
            matchAccount(req.last4().trim(), req.bank(), req.memberId()).ifPresent(t::setAccount);
        }
        // A user rule beats an accepted alias, which beats the parser's guess.
        MerchantAlias alias = req.merchant() == null ? null : aliases.findByRaw(req.merchant()).orElse(null);
        if (alias != null) {
            t.setMerchantNorm(alias.getCanonical());
        }
        String category = rules
            .categoryFor(req.merchant())
            .orElse(alias != null && alias.getCategory() != null ? alias.getCategory() : req.category());
        if (category != null && !category.isBlank()) {
            t.setCategory(findOrCreateCategory(category.trim()));
        }

        String last4 = t.getAccount() != null ? t.getAccount().getLast4() : req.last4();
        t.setDedupHash(dedupHasher.hash(last4, t.getAmount(), t.getOccurredAt(), t.getMerchant()));

        Optional<Transaction> saved = save(t);
        saved.ifPresent(s -> applyBalance(s, req.balanceAfter()));
        // An own-account transfer is neither earning nor spend — whether its other side reached
        // the ledger too, or the alert named it and only one bank ever wrote in.
        saved.ifPresent(s -> transfers.reconcile(s, req.counterpartyLast4()));
        return saved.map(TransactionDto::from);
    }

    /**
     * Match the account an alert refers to. Exact last-4 first; if the alert only shows the last
     * two or three digits (ICICI savings alerts say "Acct XX380"), accept the single account whose
     * last-4 ends with them, using the bank name to break ties. Ambiguous → no account.
     */
    Optional<Account> matchAccount(String digits, String bank) {
        return matchAccount(digits, bank, null);
    }

    /**
     * @param memberId when set, only this member's accounts are candidates — the digits in an alert
     *     say which account, but they must not be able to name one the forwarder does not own.
     */
    Optional<Account> matchAccount(String digits, String bank, Long memberId) {
        List<Account> matches = accounts.findByLast4(digits);
        if (matches.isEmpty() && digits.length() < 4 && digits.chars().allMatch(Character::isDigit)) {
            matches = accounts.findAll().stream()
                .filter(a -> a.getLast4() != null && a.getLast4().endsWith(digits))
                .toList();
        }
        if (memberId != null) {
            matches = matches.stream().filter(a -> memberId.equals(a.getMemberId())).toList();
        }
        if (matches.size() > 1 && bank != null && !bank.isBlank()) {
            String b = bank.trim().toLowerCase();
            List<Account> byBank = matches.stream()
                .filter(a -> a.getBank() != null && a.getBank().toLowerCase().contains(b))
                .toList();
            if (!byBank.isEmpty()) {
                matches = byBank;
            }
        }
        return matches.size() == 1 ? Optional.of(matches.get(0)) : Optional.empty();
    }

    /**
     * Savings-account alerts usually state the balance after the transaction ("Avl Bal Rs …"). Use
     * it as the account's current balance unless a newer alert already set one — this is what keeps
     * net worth moving without manual edits.
     */
    private void applyBalance(Transaction t, BigDecimal balanceAfter) {
        Account a = t.getAccount();
        if (a == null || balanceAfter == null || a.getType() != AccountType.SAVINGS) {
            return;
        }
        if (a.getBalanceAsOf() != null && t.getOccurredAt().isBefore(a.getBalanceAsOf())) {
            return;
        }
        a.setBalance(balanceAfter);
        a.setBalanceAsOf(t.getOccurredAt());
        accounts.save(a);
    }

    /** Alert-created transactions that couldn't be linked to an account (ingestion re-runs these). */
    @Transactional(readOnly = true)
    public List<Long> unlinkedIds() {
        return transactions.findUnlinkedIds();
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
