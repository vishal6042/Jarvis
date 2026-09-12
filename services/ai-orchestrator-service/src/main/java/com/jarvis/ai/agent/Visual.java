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
 * @param points  the rows, in the order they should be drawn
 */
public record Visual(
    String kind,
    String title,
    String subtitle,
    BigDecimal amount,
    String caption,
    List<Point> points) {

    /** Kinds the web app knows how to draw. */
    public static final String STAT = "stat";
    public static final String SERIES = "series";
    public static final String BREAKDOWN = "breakdown";
    public static final String COMPARISON = "comparison";
    public static final String LIST = "list";
    public static final String PROGRESS = "progress";

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
