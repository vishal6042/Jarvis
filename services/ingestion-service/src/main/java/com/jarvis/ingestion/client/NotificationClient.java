package com.jarvis.ingestion.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

/** Pushes a "data synced" notification after a statement import. Best-effort — never blocks import. */
@Component
public class NotificationClient {

    private static final Logger log = LoggerFactory.getLogger(NotificationClient.class);

    private final WebClient web;
    private final String internalKey;

    public NotificationClient(
        @LoadBalanced WebClient.Builder builder,
        @Value("${jarvis.notification.base-url:lb://notification-service}") String baseUrl,
        @Value("${jarvis.internal.key}") String internalKey) {
        this.web = builder.baseUrl(baseUrl).build();
        this.internalKey = internalKey;
    }

    /** Announce that a statement import just added transactions. Swallows any failure. */
    public void statementImported(String accountName, int imported, int duplicates, String dedupeKey) {
        if (imported <= 0) {
            return;
        }
        String where = accountName == null ? "your accounts" : accountName;
        String dupNote = duplicates > 0 ? " · " + duplicates + " duplicate" + (duplicates > 1 ? "s" : "") : "";
        NotificationRequest req = new NotificationRequest(
            "SYNC",
            "Statement imported",
            "Added " + imported + " transaction" + (imported > 1 ? "s" : "") + " into " + where + dupNote,
            "/transactions",
            "#10b981",
            "sync:" + dedupeKey);
        try {
            web.post()
                .uri("/internal/notifications")
                .header("X-Internal-Key", internalKey)
                .bodyValue(req)
                .retrieve()
                .toBodilessEntity()
                .block();
        } catch (Exception e) {
            log.debug("SYNC notification push failed (non-fatal): {}", e.getMessage());
        }
    }

    public record NotificationRequest(
        String type, String title, String message, String href, String color, String dedupeKey) {}
}
