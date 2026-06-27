package com.jarvis.backend.domain;

/** Where a transaction (or raw message) originated. */
public enum MessageSource {
    SMS,
    EMAIL,
    STATEMENT,
    MANUAL
}
