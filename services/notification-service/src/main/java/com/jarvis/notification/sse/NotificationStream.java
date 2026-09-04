package com.jarvis.notification.sse;

import com.jarvis.notification.web.dto.NotificationView;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Registry of open Server-Sent-Event connections (browser tabs). {@link #broadcast} pushes each
 * newly-created notification to every open tab so the bell updates without a refresh.
 */
@Component
public class NotificationStream {

    private static final long TIMEOUT_MS = 30 * 60 * 1000L; // 30 min; the browser reconnects
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));
        emitters.add(emitter);
        try {
            emitter.send(SseEmitter.event().name("ping").data("ok"));
        } catch (IOException e) {
            emitters.remove(emitter);
        }
        return emitter;
    }

    public void broadcast(NotificationView view) {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("notification").data(view));
            } catch (Exception e) {
                emitter.complete();
                emitters.remove(emitter);
            }
        }
    }
}
