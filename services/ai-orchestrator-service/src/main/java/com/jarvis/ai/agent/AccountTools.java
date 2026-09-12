package com.jarvis.ai.agent;

import com.jarvis.ai.client.ExpenseClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.YearMonth;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

/**
 * The standing state of the money rather than a period of it: what the cards are carrying, which
 * way the balance is trending, and what goes out every month whether or not anyone notices.
 *
 * <p>All three were computed already and reachable only from a page. A question like "when is my
 * card bill due" is one a person asks far more often than they open the cards screen.
 */
@Component
public class AccountTools {

    private static final String PERSON_DOC =
        "whose, ONLY when the user singles someone out: a name, a relation like wife, or 'me'. "
            + "Leave blank for the whole household together";

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MMM yy", Locale.ENGLISH);

    private final ExpenseClient expense;
    private final People people;

    public AccountTools(ExpenseClient expense, People people) {
        this.expense = expense;
        this.people = people;
    }

    @Tool(description = """
        Every credit card: what is unbilled, what is due and by when, and how much of the limit is
        in use. Use this for "when is my card bill due", "how much do I owe on the card", "what is
        my credit utilisation" — anything about the cards themselves rather than what was bought.""")
    public String creditCards(@ToolParam(description = PERSON_DOC, required = false) String person) {
        People.Choice who = people.resolve(person);
        if (who.refused()) {
            return who.refusal();
        }
        List<ExpenseClient.Card> cards = expense.cards(who.memberId());
        if (cards == null || cards.isEmpty()) {
            return "No credit cards are recorded for " + who.label() + ".";
        }

        // Every card on a consolidated statement reports that whole statement's bill, so the bill
        // is counted once per billing group and only the unbilled part is added up card by card.
        BigDecimal bills = cards.stream()
            .collect(Collectors.toMap(
                ExpenseClient.Card::groupKey,
                c -> c.billDue() == null ? BigDecimal.ZERO : c.billDue(),
                (a, b) -> a))
            .values().stream()
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal owed = cards.stream()
            .map(ExpenseClient.Card::ownUnbilled)
            .reduce(bills, BigDecimal::add);
        // A bar per card against its limit: utilisation is the thing a person is judged on, and it
        // is the one figure here that means nothing without what it is a fraction of.
        ChatVisuals.add(new Visual(
            Visual.PROGRESS, "Credit cards", who.label(), owed,
            "carried across %d %s".formatted(cards.size(), cards.size() == 1 ? "card" : "cards"),
            Visual.SPEND,
            cards.stream()
                .map(c -> new Visual.Point(
                    name(c), c.owed(), c.creditLimit(), describe(c)))
                .toList()));
        return "%s — %s".formatted(who.label(), cards.stream()
            .map(c -> "%s: INR %s outstanding (bill INR %s%s, unbilled INR %s)%s".formatted(
                name(c), Money.inr(c.owed()), Money.inr(c.billDue()),
                c.dueOn() == null ? "" : " due " + c.dueOn(),
                Money.inr(c.unbilled()),
                c.utilisationPct() == null ? "" : ", " + c.utilisationPct() + "% of the limit used"))
            .collect(Collectors.joining("; ")));
    }

    @Tool(description = """
        Savings cash at the end of each of the last N months, so the direction is visible. Use this
        for "how is my net worth doing", "am I saving more than last year", "show me the trend" —
        anything asking which way things are going rather than what one period cost.""")
    public String netWorthTrend(
        @ToolParam(description = "how many months back to show, e.g. 12") int months,
        @ToolParam(description = PERSON_DOC, required = false) String person) {
        People.Choice who = people.resolve(person);
        if (who.refused()) {
            return who.refusal();
        }
        int span = months <= 0 ? 12 : months;
        List<ExpenseClient.NetWorthPoint> points = expense.netWorthTrend(span, who.memberId());
        if (points == null || points.isEmpty()) {
            return "No balance history recorded for " + who.label() + ".";
        }

        BigDecimal first = points.get(0).netWorth();
        BigDecimal last = points.get(points.size() - 1).netWorth();
        BigDecimal change = last.subtract(first);
        ChatVisuals.add(new Visual(
            Visual.TREND, "Savings balance", who.label(), last,
            "%s %s over %d months".formatted(
                change.signum() < 0 ? "down" : "up", Money.rupees(change.abs()), points.size()),
            Visual.EARN,
            points.stream()
                .map(p -> Visual.Point.of(monthLabel(p.month()), p.netWorth()))
                .toList()));
        return "%s — savings balance now INR %s, %s INR %s over the last %d months. By month: %s"
            .formatted(who.label(), Money.inr(last), change.signum() < 0 ? "down" : "up",
                Money.inr(change.abs()), points.size(),
                points.stream()
                    .map(p -> "%s INR %s".formatted(p.month(), Money.inr(p.netWorth())))
                    .collect(Collectors.joining("; ")));
    }

    @Tool(description = """
        Payments that repeat on a regular cadence — subscriptions, rent, EMIs — with what each costs
        a month. Use this for "what subscriptions am I paying for", "what goes out every month",
        "what am I paying regularly". Detected from history, so it is a good list rather than a
        certain one: say so if the user is deciding something on it.""")
    public String recurringPayments(@ToolParam(description = PERSON_DOC, required = false) String person) {
        People.Choice who = people.resolve(person);
        if (who.refused()) {
            return who.refusal();
        }
        List<ExpenseClient.Recurring> found = expense.recurring(who.memberId());
        if (found == null || found.isEmpty()) {
            return "Nothing repeating on a regular cadence was found for " + who.label() + ".";
        }

        BigDecimal monthly = found.stream()
            .map(ExpenseClient.Recurring::monthlyEstimate)
            .filter(v -> v != null)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        ChatVisuals.add(Visual.spend(
            Visual.BREAKDOWN, "Repeating payments", who.label(), monthly,
            "a month across %d %s, detected from history".formatted(
                found.size(), found.size() == 1 ? "payment" : "payments"),
            found.stream()
                .map(r -> Visual.Point.of(
                    r.merchant(), r.monthlyEstimate(),
                    "%s · %s each · %s".formatted(r.cadence(), Money.rupees(r.amount()), when(r))))
                .toList()));
        return "%s — INR %s a month across %d repeating payments: %s".formatted(
            who.label(), Money.inr(monthly), found.size(),
            found.stream()
                .map(r -> "%s %s INR %s (about INR %s a month%s)".formatted(
                    r.merchant(), r.cadence().toLowerCase(Locale.ENGLISH), Money.inr(r.amount()),
                    Money.inr(r.monthlyEstimate()),
                    r.nextExpected() == null ? "" : ", " + when(r)))
                .collect(Collectors.joining("; ")));
    }

    /**
     * When the next one is due — or that it looks finished. Detection works from history, so a
     * subscription cancelled months ago keeps its regular past and goes on being "recurring"; the
     * date it was last actually paid is what tells a person it has stopped.
     */
    private static String when(ExpenseClient.Recurring r) {
        LocalDate next = r.nextExpected();
        if (next == null) {
            return "next date unknown";
        }
        if (next.isBefore(LocalDate.now(ZoneId.systemDefault()).minusDays(30))) {
            return "none since " + (r.lastPaid() == null ? next : r.lastPaid()).format(DAY) + ", may have stopped";
        }
        return "next " + next.format(DAY);
    }

    private static String name(ExpenseClient.Card c) {
        if (c.displayName() != null && !c.displayName().isBlank()) {
            return c.displayName();
        }
        return (c.bank() == null ? "Card" : c.bank()) + (c.last4() == null ? "" : " ••••" + c.last4());
    }

    /** The line under a card: when it is due, and how much of the limit that leaves. */
    private static String describe(ExpenseClient.Card c) {
        StringBuilder note = new StringBuilder();
        if (c.billDue() != null && c.billDue().signum() > 0 && c.dueOn() != null) {
            note.append("bill ").append(Money.rupees(c.billDue())).append(" due ").append(c.dueOn().format(DAY));
        } else if (c.nextStatementOn() != null) {
            note.append("nothing due; next statement ").append(c.nextStatementOn().format(DAY));
        }
        if (c.utilisationPct() != null) {
            note.append(note.isEmpty() ? "" : " · ").append(c.utilisationPct()).append("% of limit used");
        }
        return note.isEmpty() ? null : note.toString();
    }

    /** "2026-09" is how the service says it; "Sep 26" is how a chart axis should. */
    private static String monthLabel(String month) {
        try {
            return YearMonth.parse(month).format(MONTH);
        } catch (DateTimeParseException | NullPointerException e) {
            return month;
        }
    }
}
