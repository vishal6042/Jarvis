package com.jarvis.ai.agent;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The whole point of {@link Period} is that the model never does date arithmetic, so the
 * arithmetic here has to be right. "Today" is pinned to a Friday in mid-month, far enough from
 * either end that a week or a month landing wrongly shows up as an obviously different date.
 */
class PeriodTest {

    /** Friday, 11 September 2026. */
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 11);

    private static Period resolve(String spec) {
        return Period.resolve(spec, TODAY);
    }

    @Test
    @DisplayName("yesterday is the single day before today")
    void yesterdayIsOneDay() {
        Period p = resolve("yesterday");
        assertThat(p.from()).isEqualTo(LocalDate.of(2026, 9, 10));
        assertThat(p.to()).isEqualTo(LocalDate.of(2026, 9, 10));
        assertThat(p.label()).contains("yesterday").contains("10 Sep 2026");
    }

    @Test
    @DisplayName("today is a window of one day, not an empty one")
    void todayIsOneDay() {
        Period p = resolve("today");
        assertThat(p.from()).isEqualTo(TODAY);
        assertThat(p.to()).isEqualTo(TODAY);
    }

    @Test
    @DisplayName("this week runs from Monday to today; last week is the whole Monday-to-Sunday before it")
    void weeks() {
        Period thisWeek = resolve("this week");
        assertThat(thisWeek.from()).isEqualTo(LocalDate.of(2026, 9, 7));
        assertThat(thisWeek.to()).isEqualTo(TODAY);

        Period lastWeek = resolve("last_week");
        assertThat(lastWeek.from()).isEqualTo(LocalDate.of(2026, 8, 31));
        assertThat(lastWeek.to()).isEqualTo(LocalDate.of(2026, 9, 6));
    }

    @Test
    @DisplayName("this month stops at today; last month is the whole calendar month")
    void months() {
        Period thisMonth = resolve("this_month");
        assertThat(thisMonth.from()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(thisMonth.to()).isEqualTo(TODAY);

        Period lastMonth = resolve("last_month");
        assertThat(lastMonth.from()).isEqualTo(LocalDate.of(2026, 8, 1));
        assertThat(lastMonth.to()).isEqualTo(LocalDate.of(2026, 8, 31));
        assertThat(lastMonth.label()).isEqualTo("August 2026");
    }

    @Test
    @DisplayName("a rolling window counts today as one of its days")
    void rollingDaysIncludeToday() {
        Period p = resolve("last_7_days");
        assertThat(p.from()).isEqualTo(LocalDate.of(2026, 9, 5));
        assertThat(p.to()).isEqualTo(TODAY);

        assertThat(resolve("last 30 days").from()).isEqualTo(LocalDate.of(2026, 8, 13));
        assertThat(resolve("last-90-days").from()).isEqualTo(LocalDate.of(2026, 6, 14));
    }

    @Test
    @DisplayName("years run from January, and last year is the whole of it")
    void years() {
        assertThat(resolve("this_year").from()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(resolve("this_year").to()).isEqualTo(TODAY);
        assertThat(resolve("last_year").from()).isEqualTo(LocalDate.of(2025, 1, 1));
        assertThat(resolve("last_year").to()).isEqualTo(LocalDate.of(2025, 12, 31));
    }

    @Test
    @DisplayName("an explicit date is that day, and hyphens in it survive keyword normalising")
    void explicitDate() {
        Period p = resolve("2026-03-04");
        assertThat(p.from()).isEqualTo(LocalDate.of(2026, 3, 4));
        assertThat(p.to()).isEqualTo(LocalDate.of(2026, 3, 4));
    }

    @Test
    @DisplayName("a bare month is the whole month, including its last day")
    void explicitMonth() {
        Period p = resolve("2026-02");
        assertThat(p.from()).isEqualTo(LocalDate.of(2026, 2, 1));
        assertThat(p.to()).isEqualTo(LocalDate.of(2026, 2, 28));
    }

    @Test
    @DisplayName("a range includes both ends, whichever order it is given in")
    void ranges() {
        Period p = resolve("2026-09-01..2026-09-05");
        assertThat(p.from()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(p.to()).isEqualTo(LocalDate.of(2026, 9, 5));

        Period spoken = resolve("2026-09-05 to 2026-09-01");
        assertThat(spoken.from()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(spoken.to()).isEqualTo(LocalDate.of(2026, 9, 5));
    }

    @Test
    @DisplayName("nothing given falls back to the last 30 days rather than to nothing")
    void blankDefaults() {
        assertThat(resolve(null).from()).isEqualTo(LocalDate.of(2026, 8, 13));
        assertThat(resolve("  ").to()).isEqualTo(TODAY);
    }

    @Test
    @DisplayName("a phrase we cannot read is refused, not guessed at")
    void unreadableIsNull() {
        assertThat(resolve("since the wedding")).isNull();
        assertThat(resolve("2026-13-45")).isNull();
    }
}
