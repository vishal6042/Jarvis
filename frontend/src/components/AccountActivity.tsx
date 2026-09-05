import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, ExternalLink } from "lucide-react";
import { cardSummaries, listTransactions, type CardSummary } from "@/api";
import type { Account, Transaction } from "@/types";
import { formatINR, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";

/**
 * Live detail for one account inside the details dialog: the current billing cycle for a card
 * (statement, due, billed / paid / unbilled, utilisation) and the latest transactions.
 */
export default function AccountActivity({ account }: { account: Account }) {
  const navigate = useNavigate();
  const isCard = account.type === "CREDIT_CARD";
  const [summary, setSummary] = useState<CardSummary | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const jobs: Promise<unknown>[] = [
      listTransactions(0, 500).then((t) => alive && setTxns(t.filter((x) => x.accountId === account.id))),
    ];
    if (isCard) jobs.push(cardSummaries().then((cs) => alive && setSummary(cs.find((c) => c.accountId === account.id) ?? null)));
    Promise.allSettled(jobs).finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [account.id, isCard]);

  const recent = useMemo(() => txns.slice(0, 8), [txns]);
  const monthSpend = useMemo(() => {
    const key = new Date().toISOString().slice(0, 7);
    return txns.filter((t) => t.direction === "DEBIT" && !t.transfer && !t.settlement && t.occurredAt.startsWith(key)).reduce((s, t) => s + t.amount, 0);
  }, [txns]);

  return (
    <div className="space-y-4">
      {isCard && summary && (
        <div className="rounded-xl border bg-card/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Current cycle</p>
            {summary.utilisationPct != null && (
              <span className="text-xs text-muted-foreground">
                {summary.utilisationPct}% of limit used
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Cell label="Statement" value={summary.lastStatementOn ? formatDate(summary.lastStatementOn) : "—"} sub={summary.nextStatementOn ? `next ${formatDate(summary.nextStatementOn)}` : undefined} />
            <Cell label="Due" value={summary.dueOn ? formatDate(summary.dueOn) : "—"} sub={summary.billDue > 0 ? `${formatINR(summary.billDue)} to pay` : "nothing due"} highlight={summary.billDue > 0} />
            <Cell label="Billed / paid" value={formatINR(summary.billed)} sub={`${formatINR(summary.paid)} paid${summary.lastPaidOn ? ` on ${formatDate(summary.lastPaidOn)}` : ""}`} />
            <Cell label="Unbilled" value={formatINR(summary.unbilled)} sub="since last statement" />
          </div>
          {summary.creditLimit != null && summary.creditLimit > 0 && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, summary.utilisationPct ?? 0)}%`,
                  backgroundColor: (summary.utilisationPct ?? 0) > 60 ? "var(--danger)" : (summary.utilisationPct ?? 0) > 30 ? "var(--warn)" : "var(--ok)",
                }}
              />
            </div>
          )}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">
            Recent transactions
            {monthSpend > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{formatINR(monthSpend)} spent this month</span>}
          </p>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => navigate(`/transactions?account=${account.id}`)}>
            View all <ExternalLink className="size-3" />
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions linked to this account yet.</p>
        ) : (
          <div className="divide-y rounded-xl border">
            {recent.map((t) => {
              const income = t.direction === "CREDIT";
              return (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">{formatDate(t.occurredAt)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.merchant ?? "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {t.category ?? "Uncategorized"}
                      {t.settlement ? " · bill payment" : t.transfer ? " · transfer" : ""}
                    </div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-0.5 font-semibold tabular-nums ${income ? "text-[color:var(--ok)]" : ""}`}>
                    {income ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                    {formatINR(t.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Cell({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-medium ${highlight ? "text-[color:var(--danger)]" : ""}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
