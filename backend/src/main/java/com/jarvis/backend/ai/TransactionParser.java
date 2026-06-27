package com.jarvis.backend.ai;

/**
 * Turns a raw bank alert into a structured {@link ParsedTransaction}.
 * Provider-agnostic: the default impl uses local Ollama, but a cloud/hybrid impl can replace
 * it via Spring profiles without touching ingestion logic (see plan §Model portability).
 */
public interface TransactionParser {

    ParsedTransaction parse(String alertText);
}
