package com.jarvis.ai.agent;

/**
 * The {@link Snapshot} the web app sent with this question, on the thread answering it.
 *
 * <p>Same arrangement as {@link ChatVisuals} and for the same reason: the tools run on the request
 * thread, so per-request input reaches them here rather than through every tool signature. Set by
 * the controller and always cleared, or the next question on this thread would answer from the last
 * one's figures.
 */
public final class ChatSnapshot {

    private static final ThreadLocal<Snapshot> CURRENT = new ThreadLocal<>();

    private ChatSnapshot() {}

    public static void set(Snapshot snapshot) {
        CURRENT.set(snapshot);
    }

    /** What the app sent, or null when it sent nothing — the tools say so rather than guess. */
    static Snapshot get() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }
}
