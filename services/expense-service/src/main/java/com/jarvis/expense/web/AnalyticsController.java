package com.jarvis.expense.web;

import com.jarvis.expense.web.dto.CardSummary;
import com.jarvis.expense.service.AnalyticsService;
import com.jarvis.expense.web.dto.CategorySpend;
import com.jarvis.expense.web.dto.NetWorthPoint;
import com.jarvis.expense.web.dto.PeriodSummary;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsService analytics;

    public AnalyticsController(AnalyticsService analytics) {
        this.analytics = analytics;
    }

    /** Earning vs spend totals over [from, to). Defaults to the last 30 days. */
    @GetMapping("/summary")
    public PeriodSummary summary(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        Instant[] window = window(from, to);
        return analytics.summary(window[0], window[1]);
    }

    /** Spend grouped by category over [from, to). Defaults to the last 30 days. */
    /** Every credit card's current cycle: unbilled, bill due, dates, last payment. */
    @GetMapping("/cards")
    public List<CardSummary> cards() {
        return analytics.cards();
    }

    @GetMapping("/by-category")
    public List<CategorySpend> byCategory(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        Instant[] window = window(from, to);
        return analytics.spendByCategory(window[0], window[1]);
    }

    /** Income grouped by source (savings CREDITs) over [from, to). Defaults to the last 30 days. */
    @GetMapping("/income-by-source")
    public List<CategorySpend> incomeBySource(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        Instant[] window = window(from, to);
        return analytics.incomeBySource(window[0], window[1]);
    }

    /** Net-worth (savings cash) at the end of each of the last {@code months} months (default 12). */
    @GetMapping("/net-worth-trend")
    public List<NetWorthPoint> netWorthTrend(@RequestParam(defaultValue = "12") int months) {
        return analytics.netWorthTrend(months);
    }

    private Instant[] window(Instant from, Instant to) {
        Instant end = to == null ? Instant.now() : to;
        Instant start = from == null ? end.minus(30, ChronoUnit.DAYS) : from;
        return new Instant[] {start, end};
    }
}
