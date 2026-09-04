import { useEffect, useMemo, useState } from "react";
import {
  analyticsByCategory,
  listAccounts,
  listNotifications,
  markAllNotificationsRead,
  subscribeNotifications,
} from "@/api";
import type { Account, ApiNotification, CategorySpend } from "@/types";
import { dueLabel, REMINDER_META, upcomingReminders } from "@/lib/sample";
import { useReminders, useThresholds } from "@/lib/store";
import { formatINR } from "@/lib/format";

export type NotifType = string;

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  date: string; // ISO or yyyy-MM-dd (for sorting/recency)
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

const fromApi = (n: ApiNotification): AppNotification => ({
  id: n.id,
  type: n.type,
  title: n.title,
  message: n.message,
  date: n.createdAt,
  href: n.href,
  color: n.color,
});

/**
 * The bell's feed. Primary source is the notification-service (server-detected + real-time over
 * SSE). If that service is unreachable we fall back to deriving payment / threshold / expiry alerts
 * on the client (the pre-service behaviour), so the bell always works.
 */
export function useNotifications() {
  // ---- backend feed (preferred) ----
  const [backend, setBackend] = useState<ApiNotification[] | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    listNotifications()
      .then((rows) => {
        if (!alive) return;
        setBackend(rows);
        // Live updates: prepend each pushed notification (dedup by id).
        subscribeNotifications((n) => {
          setBackend((prev) => [n, ...(prev ?? []).filter((x) => x.id !== n.id)]);
        }, controller.signal).catch(() => {
          /* stream dropped — the initial list still shows; ignore */
        });
      })
      .catch(() => alive && setBackend(null)); // service offline → use fallback below
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  // ---- client-derived fallback ----
  const { items: reminders } = useReminders();
  const { items: thresholds } = useThresholds();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categorySpend, setCategorySpend] = useState<CategorySpend[]>([]);
  const [seen, setSeen] = useState<string[]>(() => loadSeen());

  useEffect(() => {
    if (backend !== null) return; // backend is authoritative; skip the client derivation's fetches
    let alive = true;
    listAccounts()
      .then((a) => alive && setAccounts(a))
      .catch(() => alive && setAccounts([]));
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth(), 1);
    analyticsByCategory(from.toISOString(), to.toISOString())
      .then((rows) => alive && setCategorySpend(rows ?? []))
      .catch(() => alive && setCategorySpend([]));
    return () => {
      alive = false;
    };
  }, [backend]);

  const fallbackItems = useMemo<AppNotification[]>(() => {
    const items: AppNotification[] = [];
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
    for (const c of categorySpend) {
      const spent = Number(c.total);
      const limit = thresholds[c.category];
      if (limit && spent > limit) {
        items.push({
          id: `thr-${c.category}`,
          type: "threshold",
          title: `${c.category} over budget`,
          message: `Spent ${formatINR(spent)} of ${formatINR(limit)} this month`,
          date: new Date().toISOString().slice(0, 10),
          href: "/analytics",
          color: "#f43f5e",
        });
      }
    }
    const now = new Date();
    for (const a of accounts) {
      if ((a.type === "CREDIT_CARD" || a.type === "DEBIT_CARD") && a.expiryMonth && a.expiryYear) {
        const exp = new Date(a.expiryYear, a.expiryMonth, 0);
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
    return items;
  }, [reminders, thresholds, accounts, categorySpend]);

  // ---- unified surface ----
  if (backend !== null) {
    const items = backend.map(fromApi);
    const unreadCount = backend.filter((n) => !n.read).length;
    const markAllRead = () => {
      setBackend((prev) => (prev ? prev.map((n) => ({ ...n, read: true })) : prev));
      markAllNotificationsRead().catch(() => {});
    };
    return { items, unreadCount, markAllRead, seen: [] as string[] };
  }

  const unreadCount = fallbackItems.filter((n) => !seen.includes(n.id)).length;
  const markAllRead = () => {
    const ids = fallbackItems.map((n) => n.id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
    setSeen(ids);
  };
  return { items: fallbackItems, unreadCount, markAllRead, seen };
}
