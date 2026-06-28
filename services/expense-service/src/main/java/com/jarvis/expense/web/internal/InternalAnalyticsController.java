package com.jarvis.expense.web.internal;

import com.jarvis.expense.service.AnalyticsService;
import com.jarvis.expense.web.dto.CategorySpend;
import com.jarvis.expense.web.dto.PeriodSummary;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Service-to-service analytics for the AI query agent (no user JWT; shared internal key).
 * Mirrors the public /api/analytics endpoints but reachable only inside the mesh.
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
        @RequestParam(defaultValue = "30") int days) {
        checkKey(key);
        Instant to = Instant.now();
        return analytics.summary(to.minus(days, ChronoUnit.DAYS), to);
    }

    @GetMapping("/by-category")
    public List<CategorySpend> byCategory(
        @RequestHeader(value = "X-Internal-Key", required = false) String key,
        @RequestParam(defaultValue = "30") int days) {
        checkKey(key);
        Instant to = Instant.now();
        return analytics.spendByCategory(to.minus(days, ChronoUnit.DAYS), to);
    }

    private void checkKey(String key) {
        if (!internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bad internal key");
        }
    }
}
