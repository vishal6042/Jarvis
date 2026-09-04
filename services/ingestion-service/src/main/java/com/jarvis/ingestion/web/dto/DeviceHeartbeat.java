package com.jarvis.ingestion.web.dto;

import java.time.Instant;

/** What the phone reports about itself on each heartbeat. */
public record DeviceHeartbeat(
    String name,
    String manufacturer,
    String model,
    String osVersion,
    String appVersion,
    Boolean forwardingEnabled,
    Integer pendingCount,
    Long forwardedTotal,
    Instant lastSyncAt) {}
