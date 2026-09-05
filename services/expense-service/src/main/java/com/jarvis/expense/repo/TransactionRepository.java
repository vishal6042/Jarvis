package com.jarvis.expense.repo;

import java.util.Optional;
import java.util.Collection;
import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.domain.Direction;
import com.jarvis.expense.domain.Transaction;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TransactionRepository extends JpaRepository<Transaction, Long> {

    /** Every distinct raw merchant string with how often it appears and how much is uncategorised. */
    @Query(
        "select t.merchant, count(t), sum(t.amount), "
            + "sum(case when t.category is null or t.category.name = 'Uncategorized' then 1 else 0 end) "
            + "from Transaction t where t.merchant is not null and t.merchant <> '' "
            + "group by t.merchant order by count(t) desc")
    List<Object[]> merchantGroups();

    List<Transaction> findByMerchant(String merchant);

    boolean existsByDedupHash(String dedupHash);

    /** Would this hash collide with a *different* transaction? Guards the unique index on edit. */
    boolean existsByDedupHashAndIdNot(String dedupHash, Long id);

    Page<Transaction> findByOrderByOccurredAtDesc(Pageable pageable);

    /** Other-side candidates for transfer pairing: opposite direction, same amount, a different account, inside the window. */
    @Query(
        """
        select t from Transaction t
        where t.direction = :direction and t.amount = :amount
          and t.account is not null and t.account.id <> :accountId
          and t.occurredAt >= :from and t.occurredAt <= :to
          and t.transfer = false and t.settlement = false
        order by t.occurredAt asc
        """)
    List<Transaction> findTransferCandidates(
        @Param("direction") Direction direction,
        @Param("amount") BigDecimal amount,
        @Param("accountId") Long accountId,
        @Param("from") Instant from,
        @Param("to") Instant to);

    /** Reset every transfer flag (the backfill recomputes pairs from scratch). */
    @Modifying
    /**
     * Reset before a fresh pairing pass — but never on manual or imported rows. Pairing re-derives
     * a flag from the opposite side of the transaction; when that side is not a tracked account (a
     * payin to one's own fixed deposit, say) only a human can know, and clearing it would silently
     * turn their answer back into spending.
     */
    @Query("update Transaction t set t.transfer = false, t.settlement = false where t.transfer = true or t.settlement = true")
    int clearTransferFlags();

    /** Re-apply the transfers a person declared, which pairing cannot derive. */
    @Modifying
    @Query("update Transaction t set t.transfer = true where t.transferDeclared = true and t.transfer = false")
    int applyDeclaredTransfers();

    /** Every account-linked row not yet marked as a transfer — scanned by the backfill. */
    @Query("select t from Transaction t where t.account is not null and t.transfer = false and t.settlement = false order by t.occurredAt asc")
    List<Transaction> findLinkedNotTransfer();

    /** Ids of imported (non-manual) transactions with no account — candidates for a relink pass. */
    @Query(
        """
        select t.id from Transaction t
        where t.account is null and t.source <> com.jarvis.expense.domain.MessageSource.MANUAL
        order by t.occurredAt asc
        """)
    List<Long> findUnlinkedIds();

    List<Transaction> findByAccountIdOrderByOccurredAtDesc(Long accountId, Pageable pageable);

    /** All DEBIT transactions since a date — grouped by merchant for recurring-payment detection. */
    @Query(
        """
        select t from Transaction t
        where t.direction = com.jarvis.expense.domain.Direction.DEBIT
          and t.occurredAt >= :from
          and t.transfer = false and t.settlement = false
        """)
    List<Transaction> findDebitsSince(@Param("from") Instant from);

    /** Savings-account transactions in a window — bucketed by month for the net-worth trend. */
    @Query(
        """
        select t from Transaction t
        where t.account.type = com.jarvis.expense.domain.AccountType.SAVINGS
          and t.occurredAt >= :from and t.occurredAt < :to
          and t.transfer = false
        """)
    List<Transaction> findSavingsBetween(@Param("from") Instant from, @Param("to") Instant to);

    /** Total amount in a direction within a time window (used by analytics / the query agent). */
    @Query(
        """
        select coalesce(sum(t.amount), 0) from Transaction t
        where t.direction = :direction
          and t.occurredAt >= :from and t.occurredAt < :to
          and t.transfer = false and t.settlement = false
        """)
    BigDecimal sumByDirectionAndPeriod(
        @Param("direction") Direction direction,
        @Param("from") Instant from,
        @Param("to") Instant to);

    /**
     * Σ amount for a direction within a window, on accounts of a given type. Earning/spend use
     * {@code (CREDIT, SAVINGS)} / {@code (DEBIT, SAVINGS)} — money in/out of the savings account.
     */
    @Query(
        """
        select coalesce(sum(t.amount), 0) from Transaction t
        where t.direction = :direction and t.account.type = :type
          and t.occurredAt >= :from and t.occurredAt < :to
          and t.transfer = false and t.settlement = false
        """)
    BigDecimal sumByDirectionAndAccountType(
        @Param("direction") Direction direction,
        @Param("type") AccountType type,
        @Param("from") Instant from,
        @Param("to") Instant to);

    /** Σ amount on one account, in a direction, for settlement or non-settlement rows, inside [from, to). */
    @Query(
        """
        select coalesce(sum(t.amount), 0) from Transaction t
        where t.account.id = :accountId and t.direction = :direction
          and t.settlement = :settlement and t.transfer = false
          and t.occurredAt >= :from and t.occurredAt < :to
        """)
    BigDecimal sumOnAccount(
        @Param("accountId") Long accountId,
        @Param("direction") Direction direction,
        @Param("settlement") boolean settlement,
        @Param("from") Instant from,
        @Param("to") Instant to);

    /** The most recent bill payment landing on a card. */
    Optional<Transaction> findFirstByAccountIdAndDirectionAndSettlementTrueOrderByOccurredAtDesc(Long accountId, Direction direction);

    /** Reminder auto-close: debits of about this amount inside a window (newest first). */
    @Query(
        """
        select t from Transaction t
        where t.direction = :direction and t.transfer = false and t.settlement = false
          and t.amount between :min and :max
          and t.occurredAt >= :from and t.occurredAt < :to
        order by t.occurredAt desc
        """)
    List<Transaction> findByAmountBetweenInWindow(
        @Param("direction") Direction direction,
        @Param("min") BigDecimal min,
        @Param("max") BigDecimal max,
        @Param("from") Instant from,
        @Param("to") Instant to);

    /** Total in a direction across several account types (spend = savings + card debits). */
    @Query(
        """
        select coalesce(sum(t.amount), 0) from Transaction t
        where t.direction = :direction and t.account.type in :types
          and t.occurredAt >= :from and t.occurredAt < :to
          and t.transfer = false and t.settlement = false
        """)
    BigDecimal sumByDirectionAndAccountTypes(
        @Param("direction") Direction direction,
        @Param("types") Collection<AccountType> types,
        @Param("from") Instant from,
        @Param("to") Instant to);

    /**
     * Spend-by-category for the breakdown: DEBITs on savings + credit-card accounts, EXCLUDING the
     * "Card Payment" category (savings→card bill payments, already covered by the card's own debits).
     * Rows of [categoryName, total].
     */
    @Query(
        """
        select coalesce(c.name, 'Uncategorized'), coalesce(sum(t.amount), 0)
        from Transaction t left join t.category c
        where t.direction = com.jarvis.expense.domain.Direction.DEBIT
          and t.occurredAt >= :from and t.occurredAt < :to
          and t.transfer = false and t.settlement = false
          and t.account.type in (com.jarvis.expense.domain.AccountType.SAVINGS,
                                 com.jarvis.expense.domain.AccountType.CREDIT_CARD)
          and (c is null or c.name <> 'Card Payment')
        group by c.name
        order by sum(t.amount) desc
        """)
    List<Object[]> spendByCategoryDetail(@Param("from") Instant from, @Param("to") Instant to);

    /**
     * Income-by-source for the breakdown: CREDITs on the savings account (money in), grouped by
     * category. Rows of [categoryName, total]; uncategorized income falls under 'Other income'.
     */
    @Query(
        """
        select coalesce(c.name, 'Other income'), coalesce(sum(t.amount), 0)
        from Transaction t left join t.category c
        where t.direction = com.jarvis.expense.domain.Direction.CREDIT
          and t.account.type = com.jarvis.expense.domain.AccountType.SAVINGS
          and t.occurredAt >= :from and t.occurredAt < :to
          and t.transfer = false and t.settlement = false
        group by c.name
        order by sum(t.amount) desc
        """)
    List<Object[]> incomeBySourceDetail(@Param("from") Instant from, @Param("to") Instant to);

    /** Spend per category within a window: rows of [categoryName, total]. */
    @Query(
        """
        select coalesce(c.name, 'Uncategorized'), coalesce(sum(t.amount), 0)
        from Transaction t left join t.category c
        where t.direction = :direction
          and t.occurredAt >= :from and t.occurredAt < :to
          and t.transfer = false and t.settlement = false
        group by c.name
        order by sum(t.amount) desc
        """)
    List<Object[]> sumByCategoryAndPeriod(
        @Param("direction") Direction direction,
        @Param("from") Instant from,
        @Param("to") Instant to);
}
