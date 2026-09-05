import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Check, ChevronRight } from "lucide-react";
import CardArt from "@/components/CardArt";
import type { CardSummary } from "@/api";
import type { Transaction } from "@/types";
import type { Investment, Loan, Reminder } from "@/lib/sample";
import { agendaBetween, monthRange } from "@/lib/calendarEvents";
import { reminderKey, reminderStatus } from "@/lib/reminderStatus";
import { formatINR, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Everything owed this calendar month in one place: hand-made reminders plus the dues Jarvis
 * derives itself (credit-card bills, loan EMIs, RD/SIP instalments). Paid rows stay, greyed, so
 * the month reads as a complete picture rather than a shrinking list.
 */
export default function DueThisMonthCard({
  cards,
  txns,
  investments,
  loans,
  reminders,
  paidKeys,
}: {
  cards: CardSummary[];
  txns: Transaction[];
  investments: Investment[];
  loans: Loan[];
  reminders: Reminder[];
  paidKeys: ReadonlySet<string>;
}) {
  const navigate = useNavigate();
  const now = new Date();
  const { from, to } = monthRange(now.getFullYear(), now.getMonth());

  const rows = useMemo(
    () =>
      agendaBetween(from, to, { cards, txns, investments, loans, reminders, paidKeys })
        .filter((r) => r.direction === "out")
        .map((r) => {
          const rem = r.reminderId ? reminders.find((x) => x.id === r.reminderId) : undefined;
          const st = rem ? reminderStatus(r.on, r.amount, txns, now, reminderKey(rem.id, r.on), paidKeys) : null;
          return { ...r, settled: r.paid || st?.state === "paid" };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, to, cards, txns, investments, loans, reminders, paidKeys],
  );

  if (rows.length === 0) return null;

  const outstanding = rows.filter((r) => !r.settled);
  const toPay = outstanding.reduce((s, r) => s + (r.amount ?? 0), 0);
  const unknown = outstanding.filter((r) => r.amount == null).length;
  const monthLabel = now.toLocaleDateString("en-IN", { month: "long" });

  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="#f59e0b" subtle />
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" /> Due in {monthLabel}
          </CardTitle>
          <CardDescription>
            {outstanding.length === 0
              ? "Everything this month is paid."
              : `${formatINR(toPay)} still to pay across ${outstanding.length} ${outstanding.length === 1 ? "item" : "items"}` +
                (unknown > 0 ? ` · ${unknown} without an amount` : "")}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/calendar")}>
          Calendar <ChevronRight className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => navigate(r.href ?? "/calendar")}
            className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 ${
              r.settled ? "opacity-55" : ""
            }`}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {formatDate(r.on)}
                {r.detail ? ` · ${r.detail}` : ""}
              </div>
            </div>
            {r.settled && <Check className="size-3.5 shrink-0 text-[color:var(--ok)]" />}
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {r.amount != null ? formatINR(r.amount) : "—"}
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
