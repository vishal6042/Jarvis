package com.jarvis.backend.repo;

import com.jarvis.backend.domain.Direction;
import com.jarvis.backend.domain.Transaction;
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

    Page<Transaction> findByOrderByOccurredAtDesc(Pageable pageable);

    List<Transaction> findByAccountIdOrderByOccurredAtDesc(Long accountId, Pageable pageable);

    /** Total amount in a direction within a time window (used by the query agent). */
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
