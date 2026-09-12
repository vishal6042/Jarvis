package com.jarvis.ai.agent;

import java.util.ArrayList;
import java.util.List;

/**
 * Collects the {@link Visual}s a turn's tool calls produced, on the thread answering it.
 *
 * <p>The tools return a sentence because that is what the model reads; the web app wants the
 * numbers. Rather than parse the sentence back apart, or make every tool return a pair the model
 * would then have to be taught to ignore, each tool drops its figures here on the way past and the
 * controller picks them up after the agent has finished.
 *
 * <p>Only collected between {@link #begin} and {@link #take}: a tool called from anywhere else
 * simply has nowhere to put them, which is the right answer for the alert parser and the scorer.
 */
public final class ChatVisuals {

    private static final ThreadLocal<List<Visual>> CURRENT = new ThreadLocal<>();

    private ChatVisuals() {}

    /** Start collecting for one chat turn. */
    public static void begin() {
        CURRENT.set(new ArrayList<>());
    }

    /** Everything collected, and the collector taken off the thread. Never null. */
    public static List<Visual> take() {
        List<Visual> collected = CURRENT.get();
        CURRENT.remove();
        return collected == null ? List.of() : List.copyOf(collected);
    }

    /** Called by the tools. A no-op when nothing is collecting. */
    static void add(Visual visual) {
        List<Visual> collecting = CURRENT.get();
        if (collecting != null && visual != null) {
            collecting.add(visual);
        }
    }
}
