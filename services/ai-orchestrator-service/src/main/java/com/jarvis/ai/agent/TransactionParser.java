package com.jarvis.ai.agent;

/**
 * Turns a raw bank alert into a structured {@link ParsedTransaction}.
 * Provider-agnostic: the default impl uses local Ollama, but a cloud/hybrid impl can replace
 * it via Spring profiles without touching the orchestrator's callers.
 */
public interface TransactionParser {

    ParsedTransaction parse(String alertText);
}
