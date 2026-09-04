package com.jarvis.ingestion.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A phone running the Jarvis Sync app, kept fresh by its heartbeats. */
@Entity
@Table(name = "device")
@Getter
@Setter
@NoArgsConstructor
public class Device {

    @Id
    @Column(length = 64)
    private String id;

    @Column(length = 120)
    private String name;

    @Column(length = 80)
    private String manufacturer;

    @Column(length = 120)
    private String model;

    @Column(name = "os_version", length = 40)
    private String osVersion;

    @Column(name = "app_version", length = 40)
    private String appVersion;

    @Column(name = "forwarding_enabled", nullable = false)
    private boolean forwardingEnabled = true;

    @Column(name = "pending_count", nullable = false)
    private int pendingCount;

    @Column(name = "forwarded_total", nullable = false)
    private long forwardedTotal;

    @Column(name = "last_sync_at")
    private Instant lastSyncAt;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt = Instant.now();

    @Column(name = "first_seen_at", nullable = false)
    private Instant firstSeenAt = Instant.now();
}
