package com.jarvis.ingestion.web.dto;

import java.util.List;

/**
 * Which alerts to read again. {@code ids} are raw message ids, as {@code /api/ingest} returned
 * them; empty means every alert that failed, which only the household administrator may ask for.
 */
public record RetryRequest(List<Long> ids) {}
