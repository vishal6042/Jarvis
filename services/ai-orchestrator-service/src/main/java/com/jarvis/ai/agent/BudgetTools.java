package com.jarvis.ai.agent;

import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.stereotype.Component;

/**
 * How much is left to spend, and what is due before the month is out.
 *
 * <p>The other tools measure what already happened; these two answer what can happen next. Both
 * read the forecast the web app sent with the question — see {@link Snapshot} for why it is
 * computed there — so the assistant's answer and the dashboard's figure are the same figure.
 *
 * <p>They exist as tools rather than as prose in the prompt because a question like "how much
 * should I spend this month" was being answered by paraphrasing that prose: right often enough, but
 * nothing was fetched, so nothing could be drawn and nothing could be checked.
 */
@Component
public class BudgetTools {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);

    private static final String NO_SNAPSHOT =
        "The app did not send a forecast with this question, so I cannot say. Answer from the "
            + "spending figures instead, and say the forecast was unavailable.";

    @Tool(description = """
        How much is safe to spend for the rest of this month, after the bills already known about
        and the emergency reserve the user keeps back — plus where the balance is heading. Use this
        for "how much should I spend", "how much can I spend", "can I afford it", "am I overspending"
        and anything else about what is left rather than what has gone.""")
    public String safeToSpend() {
        Snapshot s = ChatSnapshot.get();
        if (s == null || !s.hasHeadroom()) {
            return NO_SNAPSHOT;
        }

        List<Visual.Point> points = new ArrayList<>();
        List<String> said = new ArrayList<>();
        said.add("safe to spend for the rest of the month: INR " + Money.inr(s.safeToSpend()));
        if (s.spentThisMonth() != null) {
            points.add(Visual.Point.of("Spent so far", s.spentThisMonth()));
            said.add("spent so far this month INR " + Money.inr(s.spentThisMonth()));
        }
        if (s.reserve() != null) {
            points.add(Visual.Point.of("Reserve kept back", s.reserve()));
            said.add("emergency reserve held back INR " + Money.inr(s.reserve()));
        }
        if (s.projected() != null) {
            points.add(Visual.Point.of("Projected balance", s.projected()));
            said.add("projected balance "
                + (s.projectedOn() == null ? "" : "on " + s.projectedOn() + " ")
                + "INR " + Money.inr(s.projected()));
        }

        // The low point is the part a headroom figure hides: an average month can still dip.
        String caption = s.minBalance() == null || s.minOn() == null
            ? null
            : "dips to %s on %s".formatted(Money.rupees(s.minBalance()), s.minOn().format(DAY));
        if (caption != null) {
            said.add("the balance dips to INR " + Money.inr(s.minBalance()) + " on " + s.minOn());
        }

        ChatVisuals.add(new Visual(
            Visual.STAT, "Safe to spend", "the rest of this month", s.safeToSpend(), caption, points));
        return "Already worked out by the app — " + String.join(", ", said) + ".";
    }

    @Tool(description = """
        What is due in the next few weeks: bills, EMIs, card payments and expected income, soonest
        first. Use this for "what is coming up", "what do I owe", "what bills are due" or when
        explaining why the amount left to spend is what it is.""")
    public String upcomingBills() {
        Snapshot s = ChatSnapshot.get();
        if (s == null || s.upcoming() == null || s.upcoming().isEmpty()) {
            return s == null
                ? NO_SNAPSHOT
                : "Nothing is recorded as due in the next few weeks.";
        }

        List<Snapshot.Upcoming> due = s.upcoming();
        BigDecimal out = due.stream()
            .map(Snapshot.Upcoming::amount)
            .filter(a -> a != null && a.signum() < 0)
            .map(BigDecimal::abs)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        ChatVisuals.add(new Visual(
            Visual.LIST, "Coming up", "the next few weeks", out,
            "going out, across %d %s".formatted(due.size(), due.size() == 1 ? "item" : "items"),
            due.stream()
                .map(u -> Visual.Point.of(
                    u.label(),
                    u.amount() == null ? null : u.amount().abs(),
                    "%s%s%s".formatted(
                        u.on() == null ? "" : u.on().format(DAY),
                        u.amount() != null && u.amount().signum() > 0 ? " · coming in" : "",
                        u.estimate() ? " · amount not set" : "")))
                .toList()));
        return "Due in the next few weeks — " + due.stream()
            .map(u -> "%s %s: %sINR %s%s".formatted(
                u.on(), u.label(),
                u.amount() != null && u.amount().signum() > 0 ? "+" : "",
                Money.inr(u.amount() == null ? BigDecimal.ZERO : u.amount().abs()),
                u.estimate() ? " (amount not set)" : ""))
            .collect(Collectors.joining("; "));
    }
}
