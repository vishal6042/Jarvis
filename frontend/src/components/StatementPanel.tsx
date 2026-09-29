import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { cardSummaries, listTransactions, type CardSummary } from "@/api";
import type { Transaction } from "@/types";
import { networkColor } from "@/components/CardArt";
import { formatINR, formatOriginal } from "@/lib/format";
import {
  billPeriod,
  daysUntil,
  netOf,
  networkName,
  pastStatements,
  purchasesBetween,
  relativeDays,
  statementFor,
  type PastStatement,
  type Statement,
} from "@/lib/statements";
import { isoDay } from "@/lib/forecast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/*
 * One credit-card statement, as a panel over whatever page opened it. Every place that shows a
 * bill opens this same panel through the `statement` URL parameter, so the numbers never differ
 * between pages and a statement has a link of its own (/accounts?tab=cards&statement=7).
 */

const PARAM = "statement";

/** Open the statement a card is billed on, over the current page. */
export function useOpenStatement() {
  const [params, setParams] = useSearchParams();
  return (accountId: number) => {
    const next = new URLSearchParams(params);
    next.set(PARAM, String(accountId));
    setParams(next);
  };
}

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const merchantOf = (t: Transaction) =>
  (t.merchantNorm ?? t.merchant ?? "").replace(/^UPI[-/]\d+[-/]/i, "").replace(/\s+IN$/, "").trim() || (t.direction === "CREDIT" ? "Credit" : "Purchase");

function CardStack({ members }: { members: CardSummary[] }) {
  return (
    <div className="relative h-8 shrink-0" style={{ width: 44 + (members.length - 1) * 8 }}>
      {members.map((m, i) => (
        <div
          key={m.accountId}
          className="absolute top-0 h-8 w-11 rounded-md ring-1 ring-black/10"
          style={{ left: i * 8, backgroundColor: networkColor(m.network, "#16132a") }}
        />
      ))}
    </div>
  );
}

/** The due-date chip: red within a week, green once nothing is left to pay. */
export function DueChip({ s, long = false }: { s: CardSummary; long?: boolean }) {
  if (!s.dueOn) return null;
  const settled = s.billDue <= 0;
  const left = daysUntil(s.dueOn);
  const tone = settled
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
    : left <= 7
      ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300"
      : "bg-primary/10 text-primary";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${tone}`}>
      {settled ? "Paid" : long ? `Due ${fmtDay(s.dueOn)} · ${relativeDays(s.dueOn)}` : fmtDay(s.dueOn)}
    </span>
  );
}

function TxnList({ rows, showCard, more }: { rows: Transaction[]; showCard: boolean; more: () => void }) {
  const shown = rows.slice(0, 8);
  const rest = rows.slice(8);
  if (rows.length === 0) return <p className="py-4 text-sm text-muted-foreground">Nothing here yet.</p>;
  return (
    <div className="divide-y">
      {shown.map((t) => {
        const credit = t.direction === "CREDIT";
        const original = formatOriginal(t);
        return (
          <div key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="w-14 shrink-0 text-xs text-muted-foreground">{fmtDay(isoDay(new Date(t.occurredAt)))}</span>
            <span className="min-w-0 flex-1 truncate">
              {merchantOf(t)}
              {(showCard || original) && (
                <span className="text-xs text-muted-foreground">
                  {showCard && t.accountName ? ` · ${t.accountName.slice(-4)}` : ""}
                  {original ? ` · ${original}` : ""}
                </span>
              )}
            </span>
            <span className={`shrink-0 font-mono tabular-nums ${credit ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
              {credit ? "−" : ""}
              {formatINR(t.amount)}
            </span>
          </div>
        );
      })}
      {rest.length > 0 && (
        <button type="button" onClick={more} className="w-full py-3 text-left text-sm font-medium text-primary hover:underline">
          + {rest.length} more · {formatINR(netOf(rest))}
        </button>
      )}
    </div>
  );
}

const STATUS: Record<PastStatement["status"], { label: string; className: string }> = {
  "on-time": { label: "✓ on time", className: "text-emerald-700 dark:text-emerald-400" },
  late: { label: "paid late", className: "text-amber-700 dark:text-amber-400" },
  short: { label: "short?", className: "text-amber-700 dark:text-amber-400" },
  unpaid: { label: "no payment seen", className: "text-rose-700 dark:text-rose-400" },
  nothing: { label: "nothing billed", className: "text-muted-foreground" },
};

function History({ rows }: { rows: PastStatement[] }) {
  if (rows.length === 0) return <p className="py-4 text-sm text-muted-foreground">Not enough history in the ledger yet.</p>;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_1.4fr_1fr] text-sm">
        {["Statement", "Billed", "Paid", "Status"].map((h) => (
          <div key={h} className="border-b py-2 text-xs text-muted-foreground">
            {h}
          </div>
        ))}
        {rows.map((r) => {
          const st = STATUS[r.status];
          return (
            <div key={r.on} className="contents">
              <div className="border-b border-border/50 py-2">{fmtDay(r.on)}</div>
              <div className="border-b border-border/50 py-2 font-mono tabular-nums">{formatINR(r.billed)}</div>
              <div className="border-b border-border/50 py-2 font-mono tabular-nums">
                {r.paid > 0 ? `${formatINR(r.paid)}${r.paidOn ? ` · ${fmtDay(r.paidOn)}` : ""}` : "—"}
              </div>
              <div className={`border-b border-border/50 py-2 ${st.className}`}>
                {r.status === "short" ? `${formatINR(r.billed - r.paid)} short?` : st.label}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Worked out from SMS alerts and the statement dates. A gap between billed and paid usually means an alert was missed.
      </p>
    </div>
  );
}

function StatementBody({ st, txns }: { st: Statement; txns: Transaction[] }) {
  const navigate = useNavigate();
  const s = st.summary;
  const grouped = st.members.length > 1;
  const period = billPeriod(s);
  const today = isoDay(new Date());
  const onBill = useMemo(() => (period ? purchasesBetween(txns, st.accountIds, period.from, period.to) : []), [txns, st, period]);
  const since = useMemo(
    () => (s.lastStatementOn ? purchasesBetween(txns, st.accountIds, s.lastStatementOn, today) : []),
    [txns, st, s.lastStatementOn, today],
  );
  const history = useMemo(() => pastStatements(txns, st), [txns, st]);
  const util = s.utilisationPct;

  const openTxns = (from?: string, to?: string) => {
    const p = new URLSearchParams({ account: st.accountIds.join(",") });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    navigate(`/transactions?${p.toString()}`);
  };

  return (
    <div className="flex flex-col">
      <div className="space-y-5 border-b p-6 pr-14">
        <div className="flex items-center gap-3.5">
          <CardStack members={st.members} />
          <div className="min-w-0">
            <DialogTitle className="truncate text-lg font-semibold">{st.name}</DialogTitle>
            <DialogDescription className="truncate">
              {st.members.map((m) => `${networkName(m.network)} ${m.last4}`.trim()).join(" · ")}
            </DialogDescription>
          </div>
        </div>

        <div className="flex items-end gap-4">
          <div className="space-y-1">
            <div className="text-[13px] text-muted-foreground">{s.billDue > 0 ? "Outstanding on this bill" : "This bill"}</div>
            <div className="text-4xl font-semibold tracking-tight tabular-nums">{formatINR(s.billDue)}</div>
          </div>
          <div className="flex-1" />
          <div className="flex flex-col items-end gap-1.5">
            <DueChip s={s} long />
            {s.lastStatementOn && <span className="text-xs text-muted-foreground">statement of {fmtDay(s.lastStatementOn)}</span>}
          </div>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-xl border">
          <div className="space-y-0.5 border-r p-3">
            <div className="text-xs text-muted-foreground">Billed</div>
            <div className="font-mono font-semibold tabular-nums">{formatINR(s.billed)}</div>
            {period && (
              <div className="text-[11px] text-muted-foreground">
                {fmtDay(period.from)} – {fmtDay(period.to)}
              </div>
            )}
          </div>
          <div className="space-y-0.5 border-r p-3">
            <div className="text-xs text-muted-foreground">Paid so far</div>
            <div className="font-mono font-semibold tabular-nums">{formatINR(s.paid)}</div>
            <div className="text-[11px] text-muted-foreground">since the statement</div>
          </div>
          <div className="space-y-0.5 bg-primary/5 p-3">
            <div className="text-xs text-primary">Outstanding</div>
            <div className="font-mono font-semibold text-primary tabular-nums">{formatINR(s.billDue)}</div>
            <div className="text-[11px] text-muted-foreground">{s.billDue > 0 && s.dueOn ? `by ${fmtDay(s.dueOn)}` : "nothing to pay"}</div>
          </div>
        </div>

        <div className="flex gap-2.5">
          <Button className="h-11 flex-1" onClick={() => (period ? openTxns(period.from, period.to) : openTxns())}>
            Open in Transactions
          </Button>
          <Button variant="outline" className="h-11 flex-1" onClick={() => navigate(`/accounts?tab=cards`)}>
            <CreditCard className="size-4" /> Cards
          </Button>
        </div>
      </div>

      <div className="space-y-3.5 border-b p-6">
        <div className="flex items-baseline">
          <div className="text-[15px] font-semibold">{s.nextStatementOn ? `Next statement · ${fmtDay(s.nextStatementOn)}` : "Next statement"}</div>
          <div className="flex-1" />
          <div className="font-mono text-sm tabular-nums">{formatINR(s.unbilled)} unbilled</div>
        </div>
        {grouped && (
          <div className="flex gap-2">
            {st.members.map((m) => (
              <div key={m.accountId} className="flex-1 rounded-lg bg-muted/70 px-3 py-2">
                <div className="text-xs text-muted-foreground">
                  {networkName(m.network)} {m.last4}
                </div>
                <div className="text-sm font-semibold tabular-nums">{formatINR(m.unbilled)}</div>
              </div>
            ))}
          </div>
        )}
        {util != null && (
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-muted">
              <div
                className={`h-2 rounded-full ${util >= 60 ? "bg-rose-500" : util >= 30 ? "bg-amber-500" : "bg-emerald-600"}`}
                style={{ width: `${Math.max(2, Math.min(100, util))}%` }}
              />
            </div>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="flex-1">
                {util}% of {s.creditLimit ? formatINR(s.creditLimit, { compact: true }) : "the"} {grouped ? "shared " : ""}limit used
              </span>
              {s.lastPaidOn && s.lastPaidAmount != null && (
                <span>
                  last payment {formatINR(s.lastPaidAmount)} · {fmtDay(s.lastPaidOn)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-6">
        <Tabs defaultValue="bill">
          <TabsList>
            <TabsTrigger value="bill">On this bill · {onBill.length}</TabsTrigger>
            <TabsTrigger value="since">Since the statement · {since.length}</TabsTrigger>
            <TabsTrigger value="past">Past statements</TabsTrigger>
          </TabsList>
          <TabsContent value="bill" className="pt-2">
            <TxnList rows={onBill} showCard={grouped} more={() => period && openTxns(period.from, period.to)} />
          </TabsContent>
          <TabsContent value="since" className="pt-2">
            <TxnList rows={since} showCard={grouped} more={() => s.lastStatementOn && openTxns(s.lastStatementOn, today)} />
          </TabsContent>
          <TabsContent value="past" className="pt-2">
            <History rows={history} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * Mounted once in the shell: shows the statement named by the `statement` URL parameter over the
 * current page, and clears the parameter when closed.
 */
export default function StatementHost() {
  const [params, setParams] = useSearchParams();
  const raw = params.get(PARAM);
  const accountId = raw ? Number(raw) : null;
  const [cards, setCards] = useState<CardSummary[] | null>(null);
  const [txns, setTxns] = useState<Transaction[] | null>(null);

  useEffect(() => {
    if (accountId == null) return;
    let alive = true;
    // Fresh each time it opens: a payment may have landed since the page loaded.
    cardSummaries()
      .then((c) => alive && setCards(c))
      .catch(() => alive && setCards([]));
    listTransactions(0, 5000)
      .then((t) => alive && setTxns(t))
      .catch(() => alive && setTxns([]));
    return () => {
      alive = false;
    };
  }, [accountId]);

  const close = () => {
    const next = new URLSearchParams(params);
    next.delete(PARAM);
    setParams(next, { replace: true });
  };

  const st = cards && accountId != null ? statementFor(cards, accountId) : null;

  return (
    <Dialog open={accountId != null} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="top-0 right-0 left-auto flex h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none p-0 sm:max-w-[580px] data-open:slide-in-from-right data-open:zoom-in-100 data-closed:slide-out-to-right data-closed:zoom-out-100"
      >
        {!cards || !txns ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading statement…
            <DialogTitle className="sr-only">Card statement</DialogTitle>
          </div>
        ) : !st ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="size-5" />
            <DialogTitle>No statement for this card</DialogTitle>
            <DialogDescription>It may not be a credit card, or its billing day isn't set yet.</DialogDescription>
          </div>
        ) : (
          <StatementBody st={st} txns={txns} />
        )}
      </DialogContent>
    </Dialog>
  );
}
