package com.jarvis.ai.agent;

import com.jarvis.ai.client.ExpenseClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

/**
 * Tools the Query/Chatbot agent can call to answer questions from real expense data. The agent runs
 * on the request thread, so the person who asked is still known here: someone confined to their own
 * money must not learn the household's totals by asking the assistant instead of opening a page.
 * {@link People} enforces that on every call, whatever name the model passes in.
 *
 * <p>Each tool takes a {@code period} in the user's own words ("yesterday", "last_week", "2026-03")
 * and {@link Period} turns it into whole calendar days. The model is never asked to do date
 * arithmetic, and every answer names both the window it measured and whose money it was, so a
 * figure can always be checked against the page it came from.
 *
 * <p>Each also leaves its figures with {@link ChatVisuals} on the way past, so the web app can draw
 * the answer as a card or a chart rather than print the model's paragraph of digits.
 */
@Component
public class ExpenseAnalyticsTools {

    /**
     * Repeated in every tool description so the model sees the accepted words next to the parameter
     * it is filling in, not only once in the system prompt.
     */
    private static final String PERIOD_DOC =
        "the period to measure, in the user's own words: " + Period.ACCEPTED;

    private static final String PERSON_DOC =
        "whose money to measure, ONLY when the user singles someone out: a name, a relation like "
            + "wife, or 'me'. Leave blank for the whole household together, which is what an "
            + "unqualified question means";

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);

    private final ExpenseClient expense;
    private final People people;

    public ExpenseAnalyticsTools(ExpenseClient expense, People people) {
        this.expense = expense;
        this.people = people;
    }

    @Tool(description = """
        Total spend and total earning (INR) over a period, for one person or the whole household.
        Use this for "how much did I spend yesterday", "how much did my wife spend last week", and
        any question about one period's total.""")
    public String spendingSummary(
        @ToolParam(description = PERIOD_DOC) String period,
        @ToolParam(description = PERSON_DOC, required = false) String person) {
        Period p = Period.resolve(period, today());
        if (p == null) {
            return unknown(period);
        }
        People.Choice who = people.resolve(person);
        if (who.refused()) {
            return who.refusal();
        }
        ExpenseClient.Summary s = expense.summary(p.from(), p.to(), who.memberId());
        // What was saved is the question behind half of these, and subtracting it in prose is how
        // the model gets it wrong. Worked out here, and on the card next to the other two.
        BigDecimal saved = s.earning().subtract(s.spend());
        ChatVisuals.add(new Visual(
            Visual.STAT, "Spent", subtitle(who, p), s.spend(), null,
            List.of(
                Visual.Point.of("Spent", s.spend()),
                Visual.Point.of("Earned", s.earning()),
                Visual.Point.of("Saved", saved))));
        return "%s, %s — spent INR %s, earned INR %s, saved INR %s"
            .formatted(who.label(), p.label(), Money.inr(s.spend()), Money.inr(s.earning()),
                Money.inr(saved));
    }

    @Tool(description = """
        Compare the spend across two or more periods, for one person or the whole household. Use
        this whenever the user asks to compare, or says "versus", "against last month", "how does
        this month look next to last month", or asks whether spending is up or down.""")
    public String compareSpending(
        @ToolParam(
            description = "the periods to put side by side, comma separated, e.g. "
                + "'this_month,last_month' or 'last_week,this_week'. Each one: " + Period.ACCEPTED)
        String periods,
        @ToolParam(description = PERSON_DOC, required = false) String person) {
        if (periods == null || periods.isBlank()) {
            return "Name the periods to compare, comma separated, e.g. 'this_month,last_month'.";
        }
        People.Choice who = people.resolve(person);
        if (who.refused()) {
            return who.refusal();
        }

        List<Visual.Point> points = new ArrayList<>();
        List<String> said = new ArrayList<>();
        for (String each : periods.split(",")) {
            if (each.isBlank()) {
                continue;
            }
            Period p = Period.resolve(each, today());
            if (p == null) {
                return unknown(each.trim());
            }
            BigDecimal spend = expense.summary(p.from(), p.to(), who.memberId()).spend();
            points.add(Visual.Point.of(p.label(), spend));
            said.add("%s: INR %s".formatted(p.label(), Money.inr(spend)));
        }
        if (points.size() < 2) {
            return "Give at least two periods to compare, comma separated.";
        }

        // The change between the first two is the thing being asked about; say it rather than
        // leave the model to divide two large numbers, which is where it would go wrong.
        BigDecimal first = points.get(0).value();
        BigDecimal second = points.get(1).value();
        ChatVisuals.add(new Visual(
            Visual.COMPARISON, "Spending compared", who.label(), first, change(first, second), points));
        return "%s — %s. %s".formatted(who.label(), String.join("; ", said), change(first, second));
    }

    @Tool(description = """
        Spend grouped by category (highest first, INR) over a period. Use this for "what did I spend
        it on", "how much on food", or any breakdown of where the money went by type.""")
    public String spendByCategory(
        @ToolParam(description = PERIOD_DOC) String period,
        @ToolParam(description = PERSON_DOC, required = false) String person) {
        Period p = Period.resolve(period, today());
        if (p == null) {
            return unknown(period);
        }
        People.Choice who = people.resolve(person);
        if (who.refused()) {
            return who.refusal();
        }
        List<ExpenseClient.CategorySpend> rows = expense.byCategory(p.from(), p.to(), who.memberId());
        if (rows == null || rows.isEmpty()) {
            return nothing(who, p);
        }
        ChatVisuals.add(new Visual(
            Visual.BREAKDOWN, "Spend by category", subtitle(who, p), total(rows, ExpenseClient.CategorySpend::total),
            rows.size() + (rows.size() == 1 ? " category" : " categories"),
            rows.stream().map(c -> Visual.Point.of(c.category(), c.total())).toList()));
        return header(who, p) + rows.stream()
            .map(c -> "%s: INR %s".formatted(c.category(), Money.inr(c.total())))
            .collect(Collectors.joining("; "));
    }

    @Tool(description = """
        Spend for each day inside a period, most recent first, with the total. Use this for
        "how much a day", "which day did I spend the most", or a week's day-by-day picture.
        Days with no spending are left out.""")
    public String dailySpend(
        @ToolParam(description = PERIOD_DOC) String period,
        @ToolParam(description = PERSON_DOC, required = false) String person) {
        Period p = Period.resolve(period, today());
        if (p == null) {
            return unknown(period);
        }
        People.Choice who = people.resolve(person);
        if (who.refused()) {
            return who.refusal();
        }
        List<ExpenseClient.DaySpend> days = expense.daily(p.from(), p.to(), who.memberId());
        if (days == null || days.isEmpty()) {
            return nothing(who, p);
        }
        BigDecimal total = total(days, ExpenseClient.DaySpend::total);
        // Oldest first: a chart of days that runs backwards reads as a different story.
        ChatVisuals.add(new Visual(
            Visual.SERIES, "Spend by day", subtitle(who, p), total,
            "%d %s with spending".formatted(days.size(), days.size() == 1 ? "day" : "days"),
            days.stream()
                .sorted((a, b) -> a.day().compareTo(b.day()))
                .map(d -> Visual.Point.of(
                    d.day().format(DAY), d.total(),
                    d.count() + (d.count() == 1 ? " purchase" : " purchases")))
                .toList()));
        String rows = days.stream()
            .map(d -> "%s (%s): INR %s across %d %s".formatted(
                d.day(), d.day().format(DAY), Money.inr(d.total()), d.count(),
                d.count() == 1 ? "purchase" : "purchases"))
            .collect(Collectors.joining("; "));
        return "%stotal INR %s. By day: %s".formatted(header(who, p), Money.inr(total), rows);
    }

    @Tool(description = """
        The merchants that took the most money over a period, biggest first, with how many times
        each was paid. Use this for "where did my money go" or "who did I pay the most".""")
    public String topMerchants(
        @ToolParam(description = PERIOD_DOC) String period,
        @ToolParam(description = "how many merchants to list, e.g. 5") int limit,
        @ToolParam(description = PERSON_DOC, required = false) String person) {
        Period p = Period.resolve(period, today());
        if (p == null) {
            return unknown(period);
        }
        People.Choice who = people.resolve(person);
        if (who.refused()) {
            return who.refusal();
        }
        List<ExpenseClient.MerchantSpend> rows =
            expense.topMerchants(p.from(), p.to(), orDefault(limit, 10), who.memberId());
        if (rows == null || rows.isEmpty()) {
            return nothing(who, p);
        }
        ChatVisuals.add(new Visual(
            Visual.BREAKDOWN, "Top merchants", subtitle(who, p), total(rows, ExpenseClient.MerchantSpend::total),
            "the biggest " + rows.size() + " of them",
            rows.stream()
                .map(m -> Visual.Point.of(
                    m.merchant(), m.total(), m.count() + (m.count() == 1 ? " payment" : " payments")))
                .toList()));
        return header(who, p) + rows.stream()
            .map(m -> "%s: INR %s (%d)".formatted(m.merchant(), Money.inr(m.total()), m.count()))
            .collect(Collectors.joining("; "));
    }

    @Tool(description = """
        The individual purchases inside a period, newest first — date, amount, merchant, category
        and account. Use this when the user asks what something was, what they bought somewhere, or
        wants the transactions behind a total. Narrow it with search when they name a merchant or a
        category.""")
    public String findTransactions(
        @ToolParam(description = PERIOD_DOC) String period,
        @ToolParam(
            description = "merchant, category or note to match, e.g. Swiggy; blank for everything",
            required = false)
        String search,
        @ToolParam(description = "how many purchases to list, e.g. 10") int limit,
        @ToolParam(description = PERSON_DOC, required = false) String person) {
        Period p = Period.resolve(period, today());
        if (p == null) {
            return unknown(period);
        }
        People.Choice who = people.resolve(person);
        if (who.refused()) {
            return who.refusal();
        }
        List<ExpenseClient.Txn> rows =
            expense.transactions(p.from(), p.to(), search, orDefault(limit, 20), who.memberId());
        if (rows == null || rows.isEmpty()) {
            return search == null || search.isBlank()
                ? nothing(who, p)
                : "No purchases matching %s for %s, %s.".formatted(search, who.label(), p.label());
        }
        ZoneId zone = ZoneId.systemDefault();
        ChatVisuals.add(new Visual(
            Visual.LIST,
            search == null || search.isBlank() ? "Purchases" : "Purchases matching " + search.trim(),
            subtitle(who, p),
            total(rows, ExpenseClient.Txn::amount),
            rows.size() + (rows.size() == 1 ? " purchase" : " purchases"),
            rows.stream()
                .map(t -> Visual.Point.of(
                    t.name(), t.amount(),
                    "%s%s".formatted(
                        t.occurredAt().atZone(zone).toLocalDate().format(DAY),
                        t.category() == null ? "" : " · " + t.category())))
                .toList()));
        return header(who, p) + rows.stream()
            .map(t -> "%s %s: INR %s%s%s".formatted(
                t.occurredAt().atZone(zone).toLocalDate(),
                t.name(),
                Money.inr(t.amount()),
                t.category() == null ? "" : " [" + t.category() + "]",
                t.accountName() == null ? "" : " on " + t.accountName()))
            .collect(Collectors.joining("; "));
    }

    /** Whose money, over what window — every answer says both, so neither can be assumed wrong. */
    private static String header(People.Choice who, Period p) {
        return who.label() + ", " + p.label() + " — ";
    }

    /** The same pair, as a card's second line. */
    private static String subtitle(People.Choice who, Period p) {
        return who.label() + " · " + p.label();
    }

    private static <T> BigDecimal total(
        List<T> rows, java.util.function.Function<T, BigDecimal> amount) {
        return rows.stream()
            .map(amount)
            .filter(v -> v != null)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** "Up 12% on the last" — worked out here, because the model is unreliable at dividing. */
    private static String change(BigDecimal now, BigDecimal before) {
        if (before == null || before.signum() == 0) {
            return "nothing recorded in the second period to compare against";
        }
        BigDecimal diff = now.subtract(before);
        BigDecimal pct = diff.abs()
            .multiply(BigDecimal.valueOf(100))
            .divide(before.abs(), 0, java.math.RoundingMode.HALF_UP);
        if (diff.signum() == 0) {
            return "exactly the same";
        }
        return "%s %s (%s%%) on the second period"
            .formatted(diff.signum() > 0 ? "Up" : "Down", Money.rupees(diff.abs()), pct);
    }

    private static String nothing(People.Choice who, Period p) {
        return "No spending recorded for %s, %s.".formatted(who.label(), p.label());
    }

    /**
     * A model that leaves a count out sends 0, and one item is never what it meant. Fall back to a
     * useful number rather than answering "your top 1 merchant".
     */
    private static int orDefault(int limit, int fallback) {
        return limit <= 0 ? fallback : limit;
    }

    private static LocalDate today() {
        return LocalDate.now(ZoneId.systemDefault());
    }

    /** Say what went wrong and what would work, so the model can fix its own call and try again. */
    private static String unknown(String period) {
        return "I could not read '%s' as a period. Call again with one of: %s."
            .formatted(period, Period.ACCEPTED);
    }
}
