package com.jarvis.ai.agent;

import com.jarvis.ai.client.ExpenseClient;
import com.jarvis.ai.client.FinanceClient;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
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

    private final ExpenseClient expense;
    private final FinanceClient finance;

    public BudgetTools(ExpenseClient expense, FinanceClient finance) {
        this.expense = expense;
        this.finance = finance;
    }

    @Tool(description = """
        Spending against the limits set per category, for a period. Use this for "am I over budget",
        "how am I doing on food", "which budgets have I blown", or any question naming a budget or a
        limit. Only categories with a limit set appear.""")
    public String budgetStatus(
        @ToolParam(
            description = "the period to check, usually this_month. Also accepts: " + Period.ACCEPTED)
        String period) {
        Period p = Period.resolve(period, LocalDate.now(ZoneId.systemDefault()));
        if (p == null) {
            return "I could not read '%s' as a period. Call again with one of: %s."
                .formatted(period, Period.ACCEPTED);
        }

        Map<String, BigDecimal> limits;
        try {
            limits = finance.thresholds();
        } catch (Exception e) {
            return "The budget limits are unavailable right now.";
        }
        if (limits == null || limits.isEmpty()) {
            return "No category budgets have been set, so there is nothing to measure against. "
                + "Spending by category still works.";
        }

        // Limits belong to the household, not to a person, so the spend measured against them has
        // to be the household's too — comparing one member's spend to a family limit means nothing.
        List<ExpenseClient.CategorySpend> spent = expense.byCategory(p.from(), p.to(), null);
        Map<String, BigDecimal> byCategory = spent == null
            ? Map.of()
            : spent.stream().collect(Collectors.toMap(
                ExpenseClient.CategorySpend::category, ExpenseClient.CategorySpend::total, BigDecimal::add));

        List<Visual.Point> points = new ArrayList<>();
        List<String> said = new ArrayList<>();
        int over = 0;
        for (Map.Entry<String, BigDecimal> limit : limits.entrySet()) {
            BigDecimal used = byCategory.getOrDefault(limit.getKey(), BigDecimal.ZERO);
            boolean blown = used.compareTo(limit.getValue()) > 0;
            if (blown) {
                over++;
            }
            points.add(new Visual.Point(
                limit.getKey(), used, limit.getValue(),
                blown
                    ? Money.rupees(used.subtract(limit.getValue())) + " over"
                    : Money.rupees(limit.getValue().subtract(used)) + " left"));
            said.add("%s: INR %s of INR %s%s".formatted(
                limit.getKey(), Money.inr(used), Money.inr(limit.getValue()), blown ? " — OVER" : ""));
        }
        points.sort((a, b) -> share(b).compareTo(share(a)));

        ChatVisuals.add(new Visual(
            Visual.PROGRESS, "Budgets", "the household · " + p.label(), null,
            over == 0
                ? "all %d within their limit".formatted(points.size())
                : "%d of %d over".formatted(over, points.size()),
            Visual.SPEND, points));
        return "Budgets are set for the household as a whole. %s — %s."
            .formatted(p.label(), String.join("; ", said));
    }

    /** How much of a limit is used, so the tightest budget sorts to the top. */
    private static BigDecimal share(Visual.Point p) {
        BigDecimal limit = p.of();
        if (limit == null || limit.signum() == 0) {
            return BigDecimal.ZERO;
        }
        return p.value().divide(limit, 4, RoundingMode.HALF_UP);
    }

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

        ChatVisuals.add(Visual.spend(
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

        ChatVisuals.add(Visual.spend(
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
