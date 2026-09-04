package com.jarvis.ingestion.web.dto;

/** Outcome of a relink pass over alert transactions that had no account. */
public record ReprocessResult(
    int examined, int relinked, int stillUnlinked, int duplicate, int ignored, int failed) {}
