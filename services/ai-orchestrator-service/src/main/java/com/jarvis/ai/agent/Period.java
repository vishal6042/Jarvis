package com.jarvis.ai.agent;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.TemporalAdjusters;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A window of whole days, resolved here from the words a person actually uses.
 *
 * <p>The agent used to be handed a {@code days} number and had to turn "yesterday" into one itself.
 * A local 27B model is poor at date arithmetic and has no reliable idea what today is, so it either
 * guessed or — as it should — refused. Resolving the phrase on this side removes the arithmetic
 * from the model entirely: it passes the words through, and gets back a window it can quote.
 *
 * @param from  first day, inclusive
 * @param to    last day, inclusive
 * @param label how to describe the window to the user, e.g. "yesterday, Fri 11 Sep 2026"
 */
public record Period(LocalDate from, LocalDate to, String label) {

    /** Everything {@link #resolve} understands, quoted back to the model when it sends something else. */
    public static final String ACCEPTED =
        "today, yesterday, this_week, last_week, this_month, last_month, this_year, last_year, "
            + "last_7_days, last_30_days, last_90_days (or last_N_days), a single date like "
            + "2026-09-11, a month like 2026-09, or a range like 2026-09-01..2026-09-30";

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.ENGLISH);
    private static final DateTimeFormatter SHORT_DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH);
    private static final Pattern LAST_N_DAYS = Pattern.compile("last_(\\d{1,3})_days?");

    /** The window, or null when the phrase is not one we understand — the caller then says so. */
    public static Period resolve(String spec, LocalDate today) {
        String raw = spec == null ? "" : spec.trim();
        if (raw.isEmpty()) {
            return lastDays(today, 30);
        }

        // Explicit dates come first: normalising the keywords would eat the hyphens out of 2026-09-11.
        String[] parts = raw.split("\\.\\.|\\s+to\\s+");
        if (parts.length == 2) {
            LocalDate a = date(parts[0]);
            LocalDate b = date(parts[1]);
            if (a != null && b != null) {
                return a.isAfter(b) ? span(b, a) : span(a, b);
            }
        }
        LocalDate one = date(raw);
        if (one != null) {
            return new Period(one, one, one.format(DAY));
        }
        YearMonth month = month(raw);
        if (month != null) {
            return new Period(month.atDay(1), month.atEndOfMonth(), month.format(MONTH));
        }

        String key = raw.toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        switch (key) {
            case "today":
                return new Period(today, today, "today, " + today.format(DAY));
            case "yesterday": {
                LocalDate d = today.minusDays(1);
                return new Period(d, d, "yesterday, " + d.format(DAY));
            }
            case "this_week": {
                LocalDate start = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                return new Period(start, today, "this week so far (" + range(start, today) + ")");
            }
            case "last_week": {
                LocalDate weekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(1);
                LocalDate weekEnd = weekStart.plusDays(6);
                return new Period(weekStart, weekEnd, "last week (" + range(weekStart, weekEnd) + ")");
            }
            case "this_month": {
                LocalDate start = today.withDayOfMonth(1);
                return new Period(start, today, "this month so far (" + range(start, today) + ")");
            }
            case "last_month": {
                YearMonth previous = YearMonth.from(today).minusMonths(1);
                return new Period(previous.atDay(1), previous.atEndOfMonth(), previous.format(MONTH));
            }
            case "this_year": {
                LocalDate start = today.withDayOfYear(1);
                return new Period(start, today, "this year so far (" + range(start, today) + ")");
            }
            case "last_year": {
                int year = today.getYear() - 1;
                return new Period(LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31), String.valueOf(year));
            }
            default:
                break;
        }

        Matcher m = LAST_N_DAYS.matcher(key);
        if (m.matches()) {
            return lastDays(today, Integer.parseInt(m.group(1)));
        }
        return null;
    }

    /** Rolling window ending today, counted so that "the last 7 days" includes today as one of them. */
    private static Period lastDays(LocalDate today, int days) {
        int span = Math.max(1, Math.min(days, 3650));
        LocalDate start = today.minusDays(span - 1L);
        return new Period(start, today, "the last " + span + " days (" + range(start, today) + ")");
    }

    private static Period span(LocalDate from, LocalDate to) {
        return new Period(from, to, range(from, to));
    }

    private static String range(LocalDate from, LocalDate to) {
        return from.equals(to) ? from.format(SHORT_DAY) : from.format(SHORT_DAY) + " to " + to.format(SHORT_DAY);
    }

    private static LocalDate date(String text) {
        try {
            return LocalDate.parse(text.trim());
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static YearMonth month(String text) {
        try {
            return YearMonth.parse(text.trim());
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
