package com.jarvis.notification.repo;

import com.jarvis.notification.domain.Notification;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    boolean existsByDedupeKey(String dedupeKey);

    List<Notification> findTop100ByOrderByCreatedAtDesc();

    long countByReadFalse();

    @Modifying
    @Query("update Notification n set n.read = true where n.read = false")
    int markAllRead();
}
