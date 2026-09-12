package com.jarvis.expense.web.internal;

import com.jarvis.expense.service.AnalyticsService;
import com.jarvis.expense.web.dto.CategorySpend;
import com.jarvis.expense.web.dto.DaySpend;
import com.jarvis.expense.web.dto.MerchantSpend;
import com.jarvis.expense.web.dto.PeriodSummary;
import com.jarvis.expense.web.dto.TransactionDto;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Service-to-service analytics for the AI query agent (no user JWT; shared internal key).
 * Mirrors the public /api/analytics endpoints but reachable only inside the mesh. The caller says
 * which member it is asking for, because there is no user token here to work it out from.
 *
 * <p>Every read takes either a calendar window ({@code from}/{@code to}, both inclusive dates) or a
 * rolling {@code days}. The assistant resolves "yesterday" or "last month" into real dates before
 * it calls, so the window arrives here already decided — and lands on whole local days, which is
 * what a person means by a date.
 */
@RestController
@RequestMapping("/internal/analytics")
public class InternalAnalyticsController {

    private final AnalyticsService analytics;
    private final String internalKey;

    public InternalAnalyticsController(
        AnalyticsService analytics, @Value("${jarvis.internal.key}") String internalKey) {
        this.analytics = analytics;
        this.internalKey = internalKey;
    }

    @GetMapping("/summary")
    public PeriodSummary summary(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @RequestParam(defaultValue = "30") int days,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) Long memberId) {
        checkKey(key);
        Instant[] w = window(from, to, days);
        return analytics.summaryFor(memberId, w[0], w[1]);
    }

    @GetMapping("/by-category")
    public List<CategorySpend> byCategory(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @RequestParam(defaultValue = "30") int days,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) Long memberId) {
        checkKey(key);
        Instant[] w = window(from, to, days);
        return analytics.spendByCategoryFor(memberId, w[0], w[1]);
    }

    /** Spend day by day — what "how much did I spend yesterday" is actually asking for. */
    @GetMapping("/daily")
    public List<DaySpend> daily(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @RequestParam(defaultValue = "30") int days,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) Long memberId) {
        checkKey(key);
        Instant[] w = window(from, to, days);
        return analytics.dailySpendFor(memberId, w[0], w[1]);
    }

    /** Who took the money, biggest first. */
    @GetMapping("/top-merchants")
    public List<MerchantSpend> topMerchants(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @RequestParam(defaultValue = "30") int days,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(defaultValue = "10") int limit,
        @RequestParam(required = false) Long memberId) {
        checkKey(key);
        Instant[] w = window(from, to, days);
        return analytics.topMerchantsFor(memberId, w[0], w[1], limit);
    }

    /** The purchases themselves, so the assistant can name them instead of only totalling them. */
    @GetMapping("/transactions")
    public List<TransactionDto> transactions(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @RequestParam(defaultValue = "30") int days,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "20") int limit,
        @RequestParam(required = false) Long memberId) {
        checkKey(key);
        Instant[] w = window(from, to, days);
        return analytics.spendTransactionsFor(memberId, w[0], w[1], q, limit);
    }

    /**
     * [start, end) from whichever the caller gave. A calendar window runs from the start of
     * {@code from} to the end of {@code to} in local time, so a single date means that whole day
     * and "1st to 15th" includes the 15th. With no dates it falls back to the last {@code days}.
     */
    private static Instant[] window(LocalDate from, LocalDate to, int days) {
        if (from == null && to == null) {
            Instant now = Instant.now();
            return new Instant[] {now.minus(Math.max(1, days), ChronoUnit.DAYS), now};
        }
        ZoneId zone = ZoneId.systemDefault();
        LocalDate start = from == null ? to : from;
        LocalDate end = to == null ? start : to;
        if (end.isBefore(start)) {
            LocalDate swap = start;
            start = end;
            end = swap;
        }
        return new Instant[] {
            start.atStartOfDay(zone).toInstant(), end.plusDays(1).atStartOfDay(zone).toInstant()
        };
    }

    private void checkKey(String key) {
        if (!internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bad internal key");
        }
    }
}
