package com.jarvis.ai.agent;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * The forecast the web app has already worked out for the person asking: what is safe to spend,
 * where the balance is heading, and what is due before it gets there.
 *
 * <p>This arrives from the browser rather than being computed here because that is where it is
 * computed — the same projection the dashboard draws, so the chat cannot quietly disagree with the
 * page behind it. It used to be flattened into a paragraph and pasted into the system prompt, which
 * meant the model paraphrased it and no figure could be drawn or checked. As a tool's input it is
 * fetched on purpose and comes back as a card.
 *
 * @param safeToSpend    left for the rest of the month after known bills and the reserve
 * @param reserve        the emergency money the user keeps back
 * @param savings        cash in savings right now
 * @param spentThisMonth what has gone out so far this month
 * @param projected      the balance expected on {@code projectedOn}
 * @param minBalance     the lowest the balance is expected to get, on {@code minOn}
 * @param upcoming       what is due inside the horizon, soonest first
 */
public record Snapshot(
    BigDecimal safeToSpend,
    BigDecimal reserve,
    BigDecimal savings,
    BigDecimal spentThisMonth,
    BigDecimal projected,
    LocalDate projectedOn,
    BigDecimal minBalance,
    LocalDate minOn,
    List<Upcoming> upcoming) {

    /**
     * One thing due.
     *
     * @param amount   negative for money going out, positive for money coming in
     * @param estimate true when the amount is not known and this is a guess or a placeholder
     */
    public record Upcoming(LocalDate on, String label, BigDecimal amount, boolean estimate) {}

    /** Whether there is enough here to answer with. An app that sent nothing gets told so. */
    public boolean hasHeadroom() {
        return safeToSpend != null;
    }
}
