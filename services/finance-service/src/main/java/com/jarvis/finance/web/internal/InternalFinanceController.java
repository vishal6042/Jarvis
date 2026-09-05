package com.jarvis.finance.web.internal;

import com.jarvis.finance.domain.CategoryThreshold;
import com.jarvis.finance.domain.Reminder;
import com.jarvis.finance.repo.CategoryThresholdRepository;
import com.jarvis.finance.repo.ReminderPaymentRepository;
import com.jarvis.finance.repo.ReminderRepository;
import com.jarvis.finance.web.dto.ReminderPaymentDto;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Service-to-service reads for the notification engine (thresholds + reminders). No user JWT;
 * guarded by the shared internal key.
 */
@RestController
@RequestMapping("/internal")
public class InternalFinanceController {

    private final CategoryThresholdRepository thresholds;
    private final ReminderRepository reminders;
    private final ReminderPaymentRepository reminderPayments;
    private final String internalKey;

    public InternalFinanceController(
        CategoryThresholdRepository thresholds,
        ReminderRepository reminders,
        ReminderPaymentRepository reminderPayments,
        @Value("${jarvis.internal.key}") String internalKey) {
        this.thresholds = thresholds;
        this.reminders = reminders;
        this.reminderPayments = reminderPayments;
        this.internalKey = internalKey;
    }

    @GetMapping("/thresholds")
    public Map<String, BigDecimal> thresholds(
        @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireKey(key);
        Map<String, BigDecimal> out = new LinkedHashMap<>();
        for (CategoryThreshold t : thresholds.findAll()) {
            out.put(t.getCategory(), t.getAmount());
        }
        return out;
    }

    /** Occurrences the user marked paid by hand — the notifier skips these. */
    @GetMapping("/reminder-payments")
    public List<ReminderPaymentDto> reminderPayments(
        @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireKey(key);
        return reminderPayments.findByOccurredOnGreaterThanEqual(LocalDate.now().minusMonths(3)).stream()
            .map(ReminderPaymentDto::from)
            .toList();
    }

    @GetMapping("/reminders")
    public List<Reminder> reminders(
        @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireKey(key);
        return reminders.findAll();
    }

    private void requireKey(String key) {
        if (!internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bad internal key");
        }
    }
}
