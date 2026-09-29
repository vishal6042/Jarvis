import { useNavigate } from "react-router-dom";
import type { MonthBreakdown } from "@/lib/breakdown";
import { formatINR } from "@/lib/format";
import { isoDay } from "@/lib/forecast";

/**
 * This month's spend: the total against last month, the categories as bars scaled to the largest,
 * and a budget tick where one is set. A category past its budget turns amber.
 */
export default function MonthSpendCard({
  b,
  thresholds,
  today,
}: {
  b: MonthBreakdown;
  thresholds: Record<string, number>;
  /** What has gone out today, and in how many payments. */
  today: { total: number; count: number };
}) {
  const navigate = useNavigate();
  const now = new Date();
  const monthName = now.toLocaleDateString("en-IN", { month: "long" });
  const lastName = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString("en-IN", { month: "short" });
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const change = b.lastMonthTotal > 0 ? Math.round((b.total / b.lastMonthTotal - 1) * 100) : null;
  const rows = b.rows.slice(0, 6);
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.total, thresholds[r.category] ?? 0)));
  const mover = b.movers[0];
  const todayIso = isoDay(now);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
      <div className="flex items-baseline">
        <h2 className="text-base font-semibold">{monthName} spend</h2>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          day {now.getDate()} of {days}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatINR(b.total)}</span>
        {change != null && (
          <span className={`text-sm ${change > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {change > 0 ? "▲" : "▼"} {Math.abs(change)}% vs all of {lastName}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => navigate(`/transactions?from=${todayIso}&to=${todayIso}&type=DEBIT`)}
        className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-left text-sm hover:bg-muted"
      >
        <span className="text-muted-foreground">Today</span>
        <span className="flex-1 font-semibold tabular-nums">
          {today.total > 0 ? formatINR(today.total) : "Nothing spent yet"}
        </span>
        {today.count > 0 && (
          <span className="text-xs text-muted-foreground">
            {today.count} payment{today.count > 1 ? "s" : ""} →
          </span>
        )}
      </button>
      {mover && (
        <p className="text-sm text-muted-foreground">
          {mover.category} is {formatINR(mover.excess)} above your usual month
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No spending recorded yet this month.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const budget = thresholds[r.category];
            const over = budget != null && r.total > budget;
            return (
              <button
                key={r.category}
                type="button"
                className="block w-full space-y-1.5 text-left"
                onClick={() => navigate(`/transactions?month=${b.month}&category=${encodeURIComponent(r.category)}`)}
              >
                <div className="flex text-sm">
                  <span className="flex-1 truncate">
                    {r.category}
                    {over && <span className="text-amber-700 dark:text-amber-400"> · over {formatINR(budget, { compact: true })} budget</span>}
                  </span>
                  <span className="font-mono tabular-nums">{formatINR(r.total)}</span>
                </div>
                <div className="relative h-2 rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full ${over ? "bg-amber-500" : "bg-primary"}`}
                    style={{ width: `${Math.max(2, (r.total / scale) * 100)}%` }}
                  />
                  {budget != null && (
                    <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-foreground/60" style={{ left: `${(budget / scale) * 100}%` }} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <button type="button" className="mt-auto w-fit text-sm font-medium text-primary hover:underline" onClick={() => navigate("/analytics")}>
        Full breakdown →
      </button>
    </section>
  );
}
