package com.jarvis.notification.web.dto;

import com.jarvis.notification.domain.Notification;

/** Frontend-facing shape (id stringified to match the bell's existing model). */
public record NotificationView(
    String id,
    String type,
    String title,
    String message,
    String href,
    String color,
    boolean read,
    String createdAt) {

    public static NotificationView from(Notification n) {
        return new NotificationView(
            String.valueOf(n.getId()),
            n.getType(),
            n.getTitle(),
            n.getMessage(),
            n.getHref(),
            n.getColor(),
            n.isRead(),
            n.getCreatedAt().toString());
    }
}
