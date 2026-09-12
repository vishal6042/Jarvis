package com.jarvis.ai.agent;

import com.jarvis.ai.client.ExpenseClient;
import com.jarvis.common.security.CallerContext;
import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
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
 *
 * <p>Each tool takes a {@code period} in the user's own words ("yesterday", "last_week", "2026-03")
 * and {@link Period} turns it into whole calendar days. The model is never asked to do date
 * arithmetic, and every answer names the window it measured so the user can check it.
 */
@Component
public class ExpenseAnalyticsTools {

    /**
     * Repeated in every tool description so the model sees the accepted words next to the parameter
     * it is filling in, not only once in the system prompt.
     */
    private static final String PERIOD_DOC =
        "the period to measure, in the user's own words: " + Period.ACCEPTED;

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);

    private final ExpenseClient expense;

    public ExpenseAnalyticsTools(ExpenseClient expense) {
        this.expense = expense;
    }

    @Tool(description = """
        Total spend and total earning (INR) over a period. Use this for "how much did I spend
        yesterday / last week / in March", and for any question about one period's total.""")
    public String spendingSummary(@ToolParam(description = PERIOD_DOC) String period) {
        Period p = Period.resolve(period, today());
        if (p == null) {
            return unknown(period);
        }
        ExpenseClient.Summary s = expense.summary(p.from(), p.to(), member());
        return "%s — spent INR %s, earned INR %s"
            .formatted(p.label(), money(s.spend()), money(s.earning()));
    }

    @Tool(description = """
        Spend grouped by category (highest first, INR) over a period. Use this for "what did I spend
        it on", "how much on food", or any breakdown of where the money went by type.""")
    public String spendByCategory(@ToolParam(description = PERIOD_DOC) String period) {
        Period p = Period.resolve(period, today());
        if (p == null) {
            return unknown(period);
        }
        List<ExpenseClient.CategorySpend> rows = expense.byCategory(p.from(), p.to(), member());
        if (rows == null || rows.isEmpty()) {
            return "No spending recorded for " + p.label() + ".";
        }
        return p.label() + " — " + rows.stream()
            .map(c -> "%s: INR %s".formatted(c.category(), money(c.total())))
            .collect(Collectors.joining("; "));
    }

    @Tool(description = """
        Spend for each day inside a period, most recent first, with the total. Use this for
        "how much a day", "which day did I spend the most", or a week's day-by-day picture.
        Days with no spending are left out.""")
    public String dailySpend(@ToolParam(description = PERIOD_DOC) String period) {
        Period p = Period.resolve(period, today());
        if (p == null) {
            return unknown(period);
        }
        List<ExpenseClient.DaySpend> days = expense.daily(p.from(), p.to(), member());
        if (days == null || days.isEmpty()) {
            return "No spending recorded for " + p.label() + ".";
        }
        BigDecimal total = days.stream()
            .map(ExpenseClient.DaySpend::total)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        String rows = days.stream()
            .map(d -> "%s (%s): INR %s across %d %s".formatted(
                d.day(), d.day().format(DAY), money(d.total()), d.count(),
                d.count() == 1 ? "purchase" : "purchases"))
            .collect(Collectors.joining("; "));
        return "%s — total INR %s. By day: %s".formatted(p.label(), money(total), rows);
    }

    @Tool(description = """
        The merchants that took the most money over a period, biggest first, with how many times
        each was paid. Use this for "where did my money go" or "who did I pay the most".""")
    public String topMerchants(
        @ToolParam(description = PERIOD_DOC) String period,
        @ToolParam(description = "how many merchants to list, e.g. 5") int limit) {
        Period p = Period.resolve(period, today());
        if (p == null) {
            return unknown(period);
        }
        List<ExpenseClient.MerchantSpend> rows =
            expense.topMerchants(p.from(), p.to(), orDefault(limit, 10), member());
        if (rows == null || rows.isEmpty()) {
            return "No spending recorded for " + p.label() + ".";
        }
        return p.label() + " — " + rows.stream()
            .map(m -> "%s: INR %s (%d)".formatted(m.merchant(), money(m.total()), m.count()))
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
        @ToolParam(description = "how many purchases to list, e.g. 10") int limit) {
        Period p = Period.resolve(period, today());
        if (p == null) {
            return unknown(period);
        }
        List<ExpenseClient.Txn> rows =
            expense.transactions(p.from(), p.to(), search, orDefault(limit, 20), member());
        if (rows == null || rows.isEmpty()) {
            return search == null || search.isBlank()
                ? "No purchases recorded for " + p.label() + "."
                : "No purchases matching %s for %s.".formatted(search, p.label());
        }
        ZoneId zone = ZoneId.systemDefault();
        return p.label() + " — " + rows.stream()
            .map(t -> "%s %s: INR %s%s%s".formatted(
                t.occurredAt().atZone(zone).toLocalDate(),
                t.name(),
                money(t.amount()),
                t.category() == null ? "" : " [" + t.category() + "]",
                t.accountName() == null ? "" : " on " + t.accountName()))
            .collect(Collectors.joining("; "));
    }

    /**
     * A model that leaves a count out sends 0, and one item is never what it meant. Fall back to a
     * useful number rather than answering "your top 1 merchant".
     */
    private static int orDefault(int limit, int fallback) {
        return limit <= 0 ? fallback : limit;
    }

    /** Whoever is chatting — null when they may see the whole household. */
    private static Long member() {
        return CallerContext.restrictedTo();
    }

    private static LocalDate today() {
        return LocalDate.now(ZoneId.systemDefault());
    }

    /** Say what went wrong and what would work, so the model can fix its own call and try again. */
    private static String unknown(String period) {
        return "I could not read '%s' as a period. Call again with one of: %s."
            .formatted(period, Period.ACCEPTED);
    }

    /**
     * Indian digit grouping (1,14,716) whatever the JVM's default locale is, and a fresh formatter
     * each time because DecimalFormat is not safe to share between the threads answering chats.
     */
    private static String money(BigDecimal amount) {
        DecimalFormat inr = new DecimalFormat("##,##,##0.##", DecimalFormatSymbols.getInstance(Locale.ENGLISH));
        return inr.format(amount == null ? BigDecimal.ZERO : amount);
    }
}
