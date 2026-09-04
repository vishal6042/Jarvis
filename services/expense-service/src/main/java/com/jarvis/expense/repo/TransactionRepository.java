package com.jarvis.expense.repo;

import com.jarvis.expense.domain.AccountType;
import com.jarvis.expense.domain.Direction;
import com.jarvis.expense.domain.Transaction;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TransactionRepository extends JpaRepository<Transaction, Long> {

    boolean existsByDedupHash(String dedupHash);

    /** Would this hash collide with a *different* transaction? Guards the unique index on edit. */
    boolean existsByDedupHashAndIdNot(String dedupHash, Long id);

    Page<Transaction> findByOrderByOccurredAtDesc(Pageable pageable);

    List<Transaction> findByAccountIdOrderByOccurredAtDesc(Long accountId, Pageable pageable);

    /** All DEBIT transactions since a date — grouped by merchant for recurring-payment detection. */
    @Query(
        """
        select t from Transaction t
        where t.direction = com.jarvis.expense.domain.Direction.DEBIT
          and t.occurredAt >= :from
        """)
    List<Transaction> findDebitsSince(@Param("from") Instant from);

    /** Savings-account transactions in a window — bucketed by month for the net-worth trend. */
    @Query(
        """
        select t from Transaction t
        where t.account.type = com.jarvis.expense.domain.AccountType.SAVINGS
          and t.occurredAt >= :from and t.occurredAt < :to
        """)
    List<Transaction> findSavingsBetween(@Param("from") Instant from, @Param("to") Instant to);

    /** Total amount in a direction within a time window (used by analytics / the query agent). */
    @Query(
        """
        select coalesce(sum(t.amount), 0) from Transaction t
        where t.direction = :direction
          and t.occurredAt >= :from and t.occurredAt < :to
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
        """)
    BigDecimal sumByDirectionAndAccountType(
        @Param("direction") Direction direction,
        @Param("type") AccountType type,
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
        group by c.name
        order by sum(t.amount) desc
        """)
    List<Object[]> sumByCategoryAndPeriod(
        @Param("direction") Direction direction,
        @Param("from") Instant from,
        @Param("to") Instant to);
}
