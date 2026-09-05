package com.jarvis.finance.repo;

import com.jarvis.finance.domain.Reminder;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReminderRepository extends JpaRepository<Reminder, Long> {

    List<Reminder> findByMemberId(Long memberId);
}
