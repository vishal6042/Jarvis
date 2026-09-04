package com.jarvis.notification.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class NotificationEngineTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 5);

    @Test
    void oneOffReminderKeepsItsDate() {
        assertEquals(LocalDate.of(2026, 7, 5),
            NotificationEngine.nextOccurrence(LocalDate.of(2026, 7, 5), "none", TODAY));
        assertEquals(LocalDate.of(2026, 9, 20),
            NotificationEngine.nextOccurrence(LocalDate.of(2026, 9, 20), null, TODAY));
    }

    @Test
    void monthlyReminderDueTodayRollsToToday() {
        assertEquals(TODAY, NotificationEngine.nextOccurrence(LocalDate.of(2026, 7, 5), "monthly", TODAY));
    }

    @Test
    void monthlyReminderLaterThisMonthStaysThisMonth() {
        assertEquals(LocalDate.of(2026, 9, 6),
            NotificationEngine.nextOccurrence(LocalDate.of(2026, 7, 6), "monthly", TODAY));
    }

    @Test
    void monthlyReminderAlreadyPassedThisMonthRollsToNextMonth() {
        assertEquals(LocalDate.of(2026, 10, 2),
            NotificationEngine.nextOccurrence(LocalDate.of(2026, 7, 2), "monthly", TODAY));
    }

    @Test
    void monthlyReminderInTheFutureIsNotPulledBackward() {
        LocalDate base = LocalDate.of(2026, 11, 15);
        assertEquals(base, NotificationEngine.nextOccurrence(base, "monthly", TODAY));
    }

    @Test
    void monthlyReminderClampsToShortMonths() {
        LocalDate base = LocalDate.of(2026, 1, 31);
        assertEquals(LocalDate.of(2026, 9, 30),
            NotificationEngine.nextOccurrence(base, "monthly", LocalDate.of(2026, 9, 5)));
        assertEquals(LocalDate.of(2026, 10, 31),
            NotificationEngine.nextOccurrence(base, "monthly", LocalDate.of(2026, 10, 1)));
        assertEquals(LocalDate.of(2026, 2, 28),
            NotificationEngine.nextOccurrence(base, "monthly", LocalDate.of(2026, 2, 10)));
    }

    @Test
    void repeatIsCaseInsensitive() {
        assertEquals(TODAY, NotificationEngine.nextOccurrence(LocalDate.of(2026, 7, 5), "MONTHLY", TODAY));
    }

    @Test
    void nullDateYieldsNull() {
        assertNull(NotificationEngine.nextOccurrence(null, "monthly", TODAY));
    }
}
