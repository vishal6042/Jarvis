package com.jarvis.finance.repo;

import com.jarvis.finance.domain.ReminderPayment;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReminderPaymentRepository extends JpaRepository<ReminderPayment, Long> {

    Optional<ReminderPayment> findByReminder_IdAndOccurredOn(Long reminderId, LocalDate occurredOn);

    /**
     * Payments from {@code from} onward, with the reminder already loaded.
     *
     * <p>The association is LAZY and these are read outside a transaction (open-in-view is off),
     * so touching anything on the reminder beyond its id — the member it belongs to, which the
     * visibility filter needs — throws LazyInitializationException and fails the whole request.
     * Fetching it here is what keeps that from happening; don't replace this with a derived query.
     */
    @Query("select p from ReminderPayment p join fetch p.reminder where p.occurredOn >= :from")
    List<ReminderPayment> findFromWithReminder(@Param("from") LocalDate from);
}
