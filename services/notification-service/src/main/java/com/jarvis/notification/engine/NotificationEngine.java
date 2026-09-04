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

    /**
     * A reminder (rent/bill/EMI/SIP) is due within the next 7 days. Monthly reminders are rolled
     * forward to their next occurrence on or after today, so a "rent on the 2nd" reminder created
     * months ago keeps firing every month (mirrors the FE's upcomingReminders roll-forward).
     */
    private void detectPayments() {
        LocalDate today = LocalDate.now();
        for (ReminderInfo r : insight.reminders()) {
            LocalDate due = nextOccurrence(r.date(), r.repeat(), today);
            if (due == null) {
                continue;
            }
            long days = ChronoUnit.DAYS.between(today, due);
            if (days >= 0 && days <= 7) {
                // Already paid? A debit of that amount in the week around the due date closes it.
                if (r.amount() != null && insight.paymentSeen(
                        r.amount(),
                        due.minusDays(5).atStartOfDay(java.time.ZoneOffset.UTC).toInstant(),
                        due.plusDays(2).atStartOfDay(java.time.ZoneOffset.UTC).toInstant())) {
                    continue;
                }
                String dueLabel = days == 0 ? "due today" : days == 1 ? "due tomorrow" : "due in " + days + " days";
                String amount = r.amount() != null ? money(r.amount().doubleValue()) + " · " : "";
                notifications.create(new NotificationRequest(
                    "PAYMENT",
                    r.title() + " " + dueLabel,
                    amount + (r.type() == null ? "Reminder" : r.type()),
                    "/calendar",
                    "#6366f1",
                    "payment:" + r.id() + ":" + due));
            }
        }
    }

    /**
     * The next date this reminder falls due on or after {@code today}. One-off reminders return
     * their stored date (even if past — the caller's window check drops those). Monthly reminders
     * return this month's occurrence if it hasn't passed, else next month's, clamped to the month's
     * length (a "31st" reminder falls on the 30th in a 30-day month), and never before the base date.
     */
    static LocalDate nextOccurrence(LocalDate base, String repeat, LocalDate today) {
        if (base == null) {
            return null;
        }
        if (!"monthly".equalsIgnoreCase(repeat)) {
            return base;
        }
        int day = base.getDayOfMonth();
        YearMonth ym = YearMonth.from(today);
        LocalDate candidate = ym.atDay(Math.min(day, ym.lengthOfMonth()));
        if (candidate.isBefore(today)) {
            ym = ym.plusMonths(1);
            candidate = ym.atDay(Math.min(day, ym.lengthOfMonth()));
        }
        return candidate.isBefore(base) ? base : candidate;
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
