package com.jarvis.backend.web.dto;

import com.jarvis.backend.domain.MessageSource;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

/** A raw alert pushed in by the SMS forwarder, Gmail poller, or statement importer. */
public record IngestRequest(
    @NotNull MessageSource source,
    @NotBlank String payload,
    String sender,
    Instant receivedAt) {}
