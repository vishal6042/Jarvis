import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import type { CardSummary } from "@/api";
import type { Transaction } from "@/types";
import type { Investment, Loan, Reminder } from "@/lib/sample";
import { agendaBetween, monthRange, upcomingOutflows } from "@/lib/calendarEvents";
import { reminderKey, reminderStatus } from "@/lib/reminderStatus";
import { formatINR } from "@/lib/format";
import { isoDay } from "@/lib/forecast";

const DAYS = 14;

/**
 * The next two weeks, dated: salary in, bills and instalments out. What this month already
 * settled is folded into one line underneath instead of crowding the list.
 */
export default function UpcomingCard(props: {
  cards: CardSummary[];
  txns: Transaction[];
  investments: Investment[];
  loans: Loan[];
  reminders: Reminder[];
  paidKeys: ReadonlySet<string>;
  earns: boolean;
}) {
  const navigate = useNavigate();
  const { cards, txns, investments, loans, reminders, paidKeys, earns } = props;

  const soon = useMemo(
    () => upcomingOutflows(DAYS, { cards, txns, investments, loans, reminders, paidKeys, earns }),
    [cards, txns, investments, loans, reminders, paidKeys, earns],
  );

  // This month's dues, to say how many are settled already.
  const month = useMemo(() => {
    const now = new Date();
    const { from, to } = monthRange(now.getFullYear(), now.getMonth());
    const rows = agendaBetween(from, to, { cards, txns, investments, loans, reminders, paidKeys, earns }).filter(
      (r) => r.direction === "out" || r.kind === "sip",
    );
    const settled = rows.filter((r) => {
      if (r.paid) return true;
      const rem = r.reminderId ? reminders.find((x) => x.id === r.reminderId) : undefined;
      return rem ? reminderStatus(r.on, r.amount, txns, now, reminderKey(rem.id, r.on), paidKeys).state === "paid" : false;
    }).length;
    return { total: rows.length, settled, name: now.toLocaleDateString("en-IN", { month: "long" }) };
  }, [cards, txns, investments, loans, reminders, paidKeys, earns]);

  const today = new Date();
  // Due within a week reads as urgent.
  const soonIso = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7));

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-6">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold">Next {DAYS} days</h2>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {soon.income > 0 && `+${formatINR(soon.income, { compact: true })} in · `}−{formatINR(soon.total, { compact: true })} out
        </span>
      </div>
      {soon.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing scheduled in the next two weeks.</p>
      ) : (
        <div className="divide-y">
          {soon.items.map((e) => {
            const d = new Date(`${e.on}T00:00:00`);
            const urgent = e.direction === "out" && e.on <= soonIso && (e.amount ?? 0) > 0;
            const muted = e.direction === "info";
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => navigate(e.href ?? "/calendar")}
                className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/40"
              >
                <div className={`w-11 shrink-0 text-center ${urgent ? "text-rose-600 dark:text-rose-400" : muted ? "text-muted-foreground" : ""}`}>
                  <div className="text-lg leading-tight font-semibold">{d.getDate()}</div>
                  <div className="text-[11px] uppercase">{d.toLocaleDateString("en-IN", { month: "short" })}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-medium ${muted ? "text-muted-foreground" : ""}`}>{e.title}</div>
                  {e.detail && <div className="truncate text-xs text-muted-foreground">{e.detail}</div>}
                </div>
                <div
                  className={`shrink-0 font-mono text-sm tabular-nums ${
                    e.direction === "in" ? "text-emerald-600 dark:text-emerald-400" : muted ? "text-muted-foreground" : ""
                  }`}
                >
                  {e.amount != null ? `${e.direction === "in" ? "+" : ""}${formatINR(e.amount)}` : "—"}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {month.total > 0 && (
        <button
          type="button"
          onClick={() => navigate("/calendar")}
          className="mt-auto flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-left text-[13px] text-muted-foreground hover:bg-muted"
        >
          <CheckCircle2 className="size-4 shrink-0 text-[color:var(--ok)]" />
          {month.settled === month.total
            ? `All ${month.total} ${month.name} items paid`
            : `${month.settled} of ${month.total} ${month.name} items paid`}
          <span className="ml-auto text-primary">Calendar →</span>
        </button>
      )}
    </section>
  );
}
