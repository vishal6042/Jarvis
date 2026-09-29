import type { CardSummary } from "@/api";
import { networkColor } from "@/components/CardArt";
import { statementsOf } from "@/lib/cards";
import { daysUntil, networkName } from "@/lib/statements";
import { formatINR } from "@/lib/format";
import { useOpenStatement } from "@/components/StatementPanel";

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/**
 * Credit cards as the bank bills them: one row per statement, so cards on a consolidated bill
 * show their shared amount once, with each card's own unbilled spend underneath.
 */
export default function StatementsCard({ cards }: { cards: CardSummary[] }) {
  const openStatement = useOpenStatement();
  if (cards.length === 0) return null;
  const statements = statementsOf(cards);
  const due = statements.reduce((s, c) => s + c.billDue, 0);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
      <div className="flex items-baseline">
        <h2 className="text-base font-semibold">Card statements</h2>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{due > 0 ? `${formatINR(due)} due in total` : "nothing due"}</span>
      </div>
      {statements.map((s) => {
        const members = s.billingGroup ? cards.filter((c) => c.billingGroup === s.billingGroup) : [s];
        const left = s.dueOn ? daysUntil(s.dueOn) : null;
        const urgent = s.billDue > 0 && left != null && left <= 7;
        const util = s.utilisationPct ?? null;
        return (
          <button
            key={s.accountId}
            type="button"
            onClick={() => openStatement(s.accountId)}
            className="flex flex-col gap-3 rounded-2xl border p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex items-center gap-3">
              <div className="relative h-7 shrink-0" style={{ width: 40 + (members.length - 1) * 8 }}>
                {members.map((m, i) => (
                  <div
                    key={m.accountId}
                    className="absolute top-0 h-7 w-10 rounded-md ring-1 ring-black/10"
                    style={{ left: i * 8, backgroundColor: networkColor(m.network, "#16132a") }}
                  />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{members.length > 1 ? `${s.bank} · one statement` : s.displayName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {members.map((m) => `${m.network ? `${networkName(m.network)} ` : ""}${m.last4}`).join(" · ")}
                </div>
              </div>
              {s.dueOn && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    s.billDue <= 0
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : urgent
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.billDue <= 0 ? "paid" : fmtDay(s.dueOn)}
                </span>
              )}
            </div>
            <div className="flex items-baseline">
              <span className="text-2xl font-semibold tabular-nums">{formatINR(s.billDue)}</span>
              <span className="flex-1" />
              <span className="text-xs text-muted-foreground">{formatINR(s.unbilled)} unbilled</span>
            </div>
            {members.length > 1 && (
              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                {members.map((m) => (
                  <span key={m.accountId} className="rounded-md bg-muted px-2 py-1">
                    {m.last4} · {formatINR(m.unbilled)}
                  </span>
                ))}
              </div>
            )}
            {util != null && (
              <div className="space-y-1.5">
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className={`h-1.5 rounded-full ${util >= 30 ? "bg-amber-500" : "bg-emerald-600"}`}
                    style={{ width: `${Math.max(2, Math.min(100, util))}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {util}% of {s.creditLimit ? formatINR(s.creditLimit, { compact: true }) : "the"} {members.length > 1 ? "shared " : ""}limit used
                </div>
              </div>
            )}
          </button>
        );
      })}
    </section>
  );
}
