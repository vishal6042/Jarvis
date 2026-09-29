import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, ExternalLink } from "lucide-react";
import { cardSummaries, listTransactions, type CardSummary } from "@/api";
import type { Account, Transaction } from "@/types";
import { formatINR, formatDate, formatOriginal } from "@/lib/format";
import { Button } from "@/components/ui/button";

/**
 * Live detail for one account inside the details dialog: for a card, a line on its current bill
 * (the full statement opens in the statement panel), and the latest transactions.
 */
export default function AccountActivity({ account, onViewStatement }: { account: Account; onViewStatement?: () => void }) {
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
        // The bill itself lives in the statement panel, so it reads the same wherever it is opened.
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/60 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {summary.billDue > 0 ? `${formatINR(summary.billDue)} due${summary.dueOn ? ` ${formatDate(summary.dueOn)}` : ""}` : "Nothing due on the current bill"}
              {summary.billingGroup && <span className="ml-2 text-xs font-normal text-muted-foreground">shared statement · {summary.billingGroup}</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatINR(summary.unbilled)} unbilled on this card
              {summary.utilisationPct != null ? ` · ${summary.utilisationPct}% of limit used` : ""}
            </p>
          </div>
          {onViewStatement && (
            <Button size="sm" className="h-9" onClick={onViewStatement}>
              View statement
            </Button>
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
                      {formatOriginal(t) ? ` · ${formatOriginal(t)}` : ""}
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
