package com.jarvis.backend.web.dto;

import com.jarvis.backend.domain.ParseStatus;

/** Result of ingesting a raw alert. transactionId is set when a transaction was created. */
public record IngestResponse(
    Long rawMessageId, ParseStatus status, Long transactionId, String detail) {}
