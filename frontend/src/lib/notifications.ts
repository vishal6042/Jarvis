import { useEffect, useState } from "react";
import { listAccounts } from "@/api";
import type { Account } from "@/types";
import { categoryBreakdown, dueLabel, REMINDER_META, upcomingReminders } from "@/lib/sample";
import { useReminders, useThresholds } from "@/lib/store";
import { formatINR } from "@/lib/format";

export type NotifType = "payment" | "threshold" | "expiry";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  date: string; // yyyy-MM-dd (for sorting/recency)
  href: string; // page to deep-link to
  color: string;
}

const SEEN_KEY = "jarvis_notifs_seen";
const loadSeen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
  } catch {
    return [];
  }
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Derives the alerts the backend will eventually push (upcoming payments, over-threshold
 * categories, card expiry) from the data we already have on the client. FE-now, BE-ready.
 */
export function useNotifications() {
  const { items: reminders } = useReminders();
  const { items: thresholds } = useThresholds();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [seen, setSeen] = useState<string[]>(() => loadSeen());

  useEffect(() => {
    let alive = true;
    listAccounts()
      .then((a) => alive && setAccounts(a))
      .catch(() => alive && setAccounts([]));
    return () => {
      alive = false;
    };
  }, []);

  const items: AppNotification[] = [];

  // 1. Upcoming payments (reminders due within 7 days)
  for (const r of upcomingReminders(reminders, 50, 7)) {
    items.push({
      id: `pay-${r.id}-${r.occursOn}`,
      type: "payment",
      title: `${r.title} ${dueLabel(r.occursOn).toLowerCase()}`,
      message: r.amount != null ? `${formatINR(r.amount)} · ${REMINDER_META[r.type].label}` : REMINDER_META[r.type].label,
      date: r.occursOn,
      href: "/calendar",
      color: REMINDER_META[r.type].color,
    });
  }

  // 2. Category spend over threshold
  for (const c of categoryBreakdown) {
    const limit = thresholds[c.name];
    if (limit && c.value > limit) {
      items.push({
        id: `thr-${c.name}`,
        type: "threshold",
        title: `${c.name} over budget`,
        message: `Spent ${formatINR(c.value)} of ${formatINR(limit)} this month`,
        date: new Date().toISOString().slice(0, 10),
        href: "/analytics",
        color: "#f43f5e",
      });
    }
  }

  // 3. Card expiry (within ~60 days or already past)
  const now = new Date();
  for (const a of accounts) {
    if ((a.type === "CREDIT_CARD" || a.type === "DEBIT_CARD") && a.expiryMonth && a.expiryYear) {
      const exp = new Date(a.expiryYear, a.expiryMonth, 0); // last day of expiry month
      const days = Math.round((+exp - +now) / 86400000);
      if (days <= 60) {
        items.push({
          id: `exp-${a.id}`,
          type: "expiry",
          title: days < 0 ? `${a.bank} card expired` : `${a.bank} card expiring soon`,
          message: `•••• ${a.last4} · expires ${pad(a.expiryMonth)}/${a.expiryYear}`,
          date: exp.toISOString().slice(0, 10),
          href: "/accounts",
          color: "#f59e0b",
        });
      }
    }
  }

  items.sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const unreadCount = items.filter((n) => !seen.includes(n.id)).length;
  const markAllRead = () => {
    const ids = items.map((n) => n.id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
    setSeen(ids);
  };

  return { items, unreadCount, markAllRead, seen };
}
