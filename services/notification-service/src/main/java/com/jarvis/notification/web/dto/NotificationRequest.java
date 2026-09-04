package com.jarvis.notification.web.dto;

import jakarta.validation.constraints.NotBlank;

/** Create a notification (from the rule engine or another service via the internal endpoint). */
public record NotificationRequest(
    @NotBlank String type,
    @NotBlank String title,
    @NotBlank String message,
    String href,
    String color,
    @NotBlank String dedupeKey) {}
