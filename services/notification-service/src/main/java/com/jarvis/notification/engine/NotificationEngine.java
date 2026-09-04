package com.jarvis.notification.engine;

import com.jarvis.notification.client.InsightClient;
import com.jarvis.notification.client.InsightClient.AccountInfo;
import com.jarvis.notification.client.InsightClient.CategorySpend;
import com.jarvis.notification.client.InsightClient.ReminderInfo;
import com.jarvis.notification.service.NotificationService;
import com.jarvis.notification.web.dto.NotificationRequest;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Rule-based detection: on a timer, pulls the user's spend / thresholds / reminders / accounts and
 * emits notifications for anything noteworthy. Every notification carries a stable dedupe key so
 * re-running the tick never duplicates.
 */
@Component
public class NotificationEngine {

    private static final Logger log = LoggerFactory.getLogger(NotificationEngine.class);

    private final InsightClient insight;
    private final NotificationService notifications;

    public NotificationEngine(InsightClient insight, NotificationService notifications) {
        this.insight = insight;
        this.notifications = notifications;
    }

    /** Runs shortly after startup and then every 5 minutes. */
    @Scheduled(initialDelay = 20_000, fixedDelay = 300_000)
    public void tick() {
        try {
            detectThresholds();
            detectPayments();
            detectExpiries();
        } catch (Exception e) {
            log.warn("Notification tick failed: {}", e.getMessage());
        }
    }

    /** A category's month-to-date spend crossed its configured limit. */
    private void detectThresholds() {
        Map<String, Double> limits = insight.thresholds();
        if (limits.isEmpty()) {
            return;
        }
        String period = YearMonth.now().toString();
        for (CategorySpend cs : insight.spendByCategory()) {
            Double limit = limits.get(cs.category());
            if (limit == null || limit <= 0 || cs.total() == null) {
                continue;
            }
            double spent = cs.total().doubleValue();
            if (spent > limit) {
                notifications.create(new NotificationRequest(
                    "THRESHOLD",
                    cs.category() + " over budget",
                    "Spent " + money(spent) + " of " + money(limit) + " this month",
                    "/analytics",
                    "#f43f5e",
                    "threshold:" + cs.category() + ":" + period));
            }
        }
    }

    /** A reminder (rent/bill/EMI/SIP) is due within the next 7 days. */
    private void detectPayments() {
        LocalDate today = LocalDate.now();
        for (ReminderInfo r : insight.reminders()) {
            if (r.date() == null) {
                continue;
            }
            long days = ChronoUnit.DAYS.between(today, r.date());
            if (days >= 0 && days <= 7) {
                String due = days == 0 ? "due today" : days == 1 ? "due tomorrow" : "due in " + days + " days";
                String amount = r.amount() != null ? money(r.amount().doubleValue()) + " · " : "";
                notifications.create(new NotificationRequest(
                    "PAYMENT",
                    r.title() + " " + due,
                    amount + (r.type() == null ? "Reminder" : r.type()),
                    "/calendar",
                    "#6366f1",
                    "payment:" + r.id() + ":" + r.date()));
            }
        }
    }

    /** A card expires within ~60 days (or already has). */
    private void detectExpiries() {
        LocalDate today = LocalDate.now();
        for (AccountInfo a : insight.accounts()) {
            boolean card = "CREDIT_CARD".equals(a.type()) || "DEBIT_CARD".equals(a.type());
            if (!card || a.expiryMonth() == null || a.expiryYear() == null) {
                continue;
            }
            LocalDate expiry = YearMonth.of(a.expiryYear(), a.expiryMonth()).atEndOfMonth();
            long days = ChronoUnit.DAYS.between(today, expiry);
            if (days <= 60) {
                String bank = a.bank() == null ? "Card" : a.bank();
                notifications.create(new NotificationRequest(
                    "EXPIRY",
                    days < 0 ? bank + " card expired" : bank + " card expiring soon",
                    "•••• " + a.last4() + " · expires " + pad(a.expiryMonth()) + "/" + a.expiryYear(),
                    "/accounts",
                    "#f59e0b",
                    "expiry:" + a.id() + ":" + a.expiryYear() + "-" + a.expiryMonth()));
            }
        }
    }

    private static String money(double v) {
        return "₹" + String.format("%,.0f", v);
    }

    private static String pad(int n) {
        return n < 10 ? "0" + n : String.valueOf(n);
    }
}
