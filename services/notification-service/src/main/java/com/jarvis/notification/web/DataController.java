package com.jarvis.notification.web;

import com.jarvis.notification.repo.NotificationRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RestController;

/** GDPR-style purge: clear the notification feed. */
@RestController
public class DataController {

    private final NotificationRepository notifications;

    public DataController(NotificationRepository notifications) {
        this.notifications = notifications;
    }

    @DeleteMapping("/api/notifications/purge-all")
    @Transactional
    public ResponseEntity<Void> purge() {
        notifications.deleteAllInBatch();
        return ResponseEntity.noContent().build();
    }
}
