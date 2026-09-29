import type { CardSummary } from "@/api";
import { formatINR } from "@/lib/format";
import { networkName, statementList } from "@/lib/statements";
import { networkColor } from "@/components/CardArt";
import { DueChip, useOpenStatement } from "@/components/StatementPanel";

/**
 * The bills first: one card per statement with what is outstanding, what has been paid, what is
 * building up for the next one, and the limit used. Each opens the statement panel.
 */
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function StatementsStrip({ cards }: { cards: CardSummary[] }) {
  const openStatement = useOpenStatement();
  // The bill due soonest first; paid ones after.
  const statements = statementList(cards).sort((a, b) => {
    const ka = a.summary.billDue > 0 ? (a.summary.dueOn ?? "9") : "z";
    const kb = b.summary.billDue > 0 ? (b.summary.dueOn ?? "9") : "z";
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  if (statements.length === 0) return null;
  const outstanding = statements.reduce((s, st) => s + st.summary.billDue, 0);
  const due = statements
    .filter((st) => st.summary.billDue > 0 && st.summary.dueOn)
    .map((st) => st.summary.dueOn as string)
    .sort()[0];

  return (
    <section className="space-y-3.5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-lg font-semibold">Statements</h2>
        <span className="text-sm text-muted-foreground">
          {outstanding > 0
            ? `${formatINR(outstanding)} outstanding across ${statements.length} bill${statements.length > 1 ? "s" : ""}${due ? ` · next due ${fmtDay(due)}` : ""}`
            : "Every bill is paid"}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {statements.map((st) => {
          const s = st.summary;
          const util = s.utilisationPct;
          return (
            <button
              key={s.accountId}
              type="button"
              onClick={() => openStatement(s.accountId)}
              className="flex flex-col gap-3.5 rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-center gap-3">
                <div className="relative h-8 shrink-0" style={{ width: 44 + (st.members.length - 1) * 8 }}>
                  {st.members.map((m, i) => (
                    <div
                      key={m.accountId}
                      className="absolute top-0 h-8 w-11 rounded-md ring-1 ring-black/10"
                      style={{ left: i * 8, backgroundColor: networkColor(m.network, "#16132a") }}
                    />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{st.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {st.members.map((m) => `${networkName(m.network)} ${m.last4}`.trim()).join(" · ")}
                    {s.lastStatementOn ? ` · statement of ${fmtDay(s.lastStatementOn)}` : ""}
                  </div>
                </div>
                <DueChip s={s} long />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Outstanding</div>
                  <div className="text-2xl font-semibold tabular-nums">{formatINR(s.billDue)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Paid so far</div>
                  <div className="pt-1.5 font-mono font-semibold tabular-nums">{formatINR(s.paid)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Unbilled</div>
                  <div className="pt-1.5 font-mono font-semibold tabular-nums">{formatINR(s.unbilled)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Last paid</div>
                  <div className="pt-1.5 text-sm font-medium">
                    {s.lastPaidOn && s.lastPaidAmount != null ? `${formatINR(s.lastPaidAmount)} · ${fmtDay(s.lastPaidOn)}` : "—"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 rounded-full bg-muted">
                  {util != null && (
                    <div
                      className={`h-1.5 rounded-full ${util >= 60 ? "bg-rose-500" : util >= 30 ? "bg-amber-500" : "bg-emerald-600"}`}
                      style={{ width: `${Math.max(2, Math.min(100, util))}%` }}
                    />
                  )}
                </div>
                {util != null && (
                  <span className="text-xs text-muted-foreground">
                    {util}% of {s.creditLimit ? formatINR(s.creditLimit, { compact: true }) : "limit"}
                    {st.members.length > 1 ? " shared" : ""}
                  </span>
                )}
                <span className="text-sm font-semibold text-primary">View statement →</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
