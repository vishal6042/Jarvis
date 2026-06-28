package com.jarvis.ingestion.web.dto;

import com.jarvis.ingestion.domain.ParseStatus;

/** Result of ingesting a raw alert. transactionId is set when a transaction was created. */
public record IngestResponse(
    Long rawMessageId, ParseStatus status, Long transactionId, String detail) {}
