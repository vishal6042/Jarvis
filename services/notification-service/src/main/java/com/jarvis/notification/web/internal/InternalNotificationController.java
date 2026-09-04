package com.jarvis.notification.web.internal;

import com.jarvis.notification.service.NotificationService;
import com.jarvis.notification.web.dto.NotificationRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Lets other services (e.g. ingestion after an import) push a notification. Internal-key guarded. */
@RestController
@RequestMapping("/internal/notifications")
public class InternalNotificationController {

    private final NotificationService service;
    private final String internalKey;

    public InternalNotificationController(
        NotificationService service, @Value("${jarvis.internal.key}") String internalKey) {
        this.service = service;
        this.internalKey = internalKey;
    }

    @PostMapping
    public void create(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @Valid @RequestBody NotificationRequest req) {
        if (!internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bad internal key");
        }
        service.create(req);
    }
}
