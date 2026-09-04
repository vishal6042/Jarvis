package com.jarvis.notification.web;

import com.jarvis.notification.service.NotificationService;
import com.jarvis.notification.sse.NotificationStream;
import com.jarvis.notification.web.dto.NotificationView;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** The bell's feed: initial list + live SSE stream + read-state. JWT-protected via the gateway. */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService service;
    private final NotificationStream stream;

    public NotificationController(NotificationService service, NotificationStream stream) {
        this.service = service;
        this.stream = stream;
    }

    @GetMapping
    public List<NotificationView> list() {
        return service.recent();
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return stream.subscribe();
    }

    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount() {
        return Map.of("count", service.unreadCount());
    }

    @PostMapping("/read-all")
    public void readAll() {
        service.markAllRead();
    }

    @PostMapping("/{id}/read")
    public void read(@PathVariable Long id) {
        service.markRead(id);
    }
}
