package com.jarvis.ai.agent;

import java.math.BigDecimal;
import java.util.List;

/**
 * The figures behind an answer, in the shape the web app can draw.
 *
 * <p>A tool already holds the data structured — a total, a row per day, a row per merchant — and
 * then flattens it to a sentence for the model to read. This is the same data kept on the way past,
 * so the reply can be a card or a chart instead of a paragraph of digits. The model's prose still
 * carries the answer; this only decides how it is shown.
 *
 * @param kind    what to draw: stat, series, breakdown, comparison, list or progress
 * @param title   the measure, e.g. "Spending"
 * @param subtitle whose money and over what window
 * @param amount  the headline figure, null where a list has no meaningful total
 * @param caption a line of context under the figure
 * @param tone    which way is good: money going out, money coming in, or neither
 * @param points  the rows, in the order they should be drawn
 */
public record Visual(
    String kind,
    String title,
    String subtitle,
    BigDecimal amount,
    String caption,
    String tone,
    List<Point> points) {

    /** Money going out — the default, and the app's rose. */
    public static final String SPEND = "spend";

    /** Money coming in or building up: income, net worth, a goal filling. Emerald. */
    public static final String EARN = "earn";

    /** Kinds the web app knows how to draw. */
    public static final String STAT = "stat";
    public static final String SERIES = "series";
    public static final String BREAKDOWN = "breakdown";
    public static final String COMPARISON = "comparison";
    public static final String LIST = "list";
    public static final String PROGRESS = "progress";
    /** A line over months rather than bars over days: net worth, where direction is the point. */
    public static final String TREND = "trend";

    /** Spend is what almost everything here measures, so it is what a visual is unless it says. */
    public Visual {
        tone = tone == null ? SPEND : tone;
    }

    /** The common case: an outgoing figure. */
    public static Visual spend(
        String kind, String title, String subtitle, BigDecimal amount, String caption, List<Point> points) {
        return new Visual(kind, title, subtitle, amount, caption, SPEND, points);
    }

    /**
     * One row.
     *
     * @param of   what {@code value} is out of, for a progress bar; null everywhere else
     * @param note a secondary label — a date, a count, a category
     */
    public record Point(String label, BigDecimal value, BigDecimal of, String note) {

        public static Point of(String label, BigDecimal value) {
            return new Point(label, value, null, null);
        }

        public static Point of(String label, BigDecimal value, String note) {
            return new Point(label, value, null, note);
        }
    }
}
