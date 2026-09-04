package com.jarvis.notification.service;

import com.jarvis.notification.domain.Notification;
import com.jarvis.notification.repo.NotificationRepository;
import com.jarvis.notification.sse.NotificationStream;
import com.jarvis.notification.web.dto.NotificationRequest;
import com.jarvis.notification.web.dto.NotificationView;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {

    private final NotificationRepository repo;
    private final NotificationStream stream;

    public NotificationService(NotificationRepository repo, NotificationStream stream) {
        this.repo = repo;
        this.stream = stream;
    }

    /** Create-if-absent (by dedupeKey), then broadcast. Returns empty when it already existed. */
    @Transactional
    public Optional<NotificationView> create(NotificationRequest req) {
        if (repo.existsByDedupeKey(req.dedupeKey())) {
            return Optional.empty();
        }
        Notification n = new Notification();
        n.setType(req.type());
        n.setTitle(req.title());
        n.setMessage(req.message());
        n.setHref(req.href() == null || req.href().isBlank() ? "/dashboard" : req.href());
        n.setColor(req.color() == null || req.color().isBlank() ? "#6366f1" : req.color());
        n.setDedupeKey(req.dedupeKey());
        NotificationView view = NotificationView.from(repo.save(n));
        stream.broadcast(view);
        return Optional.of(view);
    }

    @Transactional(readOnly = true)
    public List<NotificationView> recent() {
        return repo.findTop100ByOrderByCreatedAtDesc().stream().map(NotificationView::from).toList();
    }

    @Transactional(readOnly = true)
    public long unreadCount() {
        return repo.countByReadFalse();
    }

    @Transactional
    public void markAllRead() {
        repo.markAllRead();
    }

    @Transactional
    public void markRead(Long id) {
        repo.findById(id).ifPresent(n -> {
            n.setRead(true);
            repo.save(n);
        });
    }
}
