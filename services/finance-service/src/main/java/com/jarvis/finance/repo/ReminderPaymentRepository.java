package com.jarvis.finance.repo;

import com.jarvis.finance.domain.ReminderPayment;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReminderPaymentRepository extends JpaRepository<ReminderPayment, Long> {

    Optional<ReminderPayment> findByReminder_IdAndOccurredOn(Long reminderId, LocalDate occurredOn);

    List<ReminderPayment> findByOccurredOnGreaterThanEqual(LocalDate from);
}
