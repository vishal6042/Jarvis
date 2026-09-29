import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { listRecurring } from "@/api";
import { getGoals, type ApiGoal } from "@/lib/api/finance";
import { allocationByKind, maturityLadder } from "@/lib/portfolio";
import { formatINR, formatOriginal } from "@/lib/format";
import type { Investment } from "@/lib/sample";
import type { RecurringPayment, Transaction } from "@/types";

const lakh = (n: number) => formatINR(n, { compact: true });
const monthYear = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

/** What the portfolio holds, by product, and what goes into it each month. */
export function WealthCard({ investments }: { investments: Investment[] }) {
  const navigate = useNavigate();
  const slices = useMemo(() => allocationByKind(investments), [investments]);
  const total = slices.reduce((s, k) => s + k.value, 0);
  // A yearly premium counts as its monthly share, so the figure is one month of money.
  const monthly = investments.reduce((s, i) => s + (i.sip ?? 0) / (i.contributionFrequency === "yearly" ? 12 : 1), 0);
  const next = maturityLadder(investments).find((m) => m.monthsAway >= 0);
  if (investments.length === 0) return null;

  return (
    <section className="flex cursor-pointer flex-col gap-4 rounded-2xl border bg-card p-6 hover:border-primary/40" onClick={() => navigate("/investments")}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold">Where your {lakh(total)} is invested</h2>
        <div className="flex-1" />
        {monthly > 0 && <span className="text-xs text-muted-foreground">{formatINR(monthly)}/month going in</span>}
      </div>
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
        {slices.map((k) => (
          <div key={k.kind} title={k.label} style={{ width: `${k.pct}%`, backgroundColor: k.color }} />
        ))}
      </div>
      <div className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
        {slices.map((k) => (
          <div key={k.kind} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: k.color }} />
            <span className="flex-1 truncate">
              {k.label}
              {k.count > 1 && <span className="text-muted-foreground"> ×{k.count}</span>}
            </span>
            <span className="font-mono tabular-nums">{lakh(k.value)}</span>
          </div>
        ))}
      </div>
      {next && (
        <p className="mt-auto text-[13px] text-muted-foreground">
          Next maturity: {next.inv.name} · {monthYear(next.on)} · {lakh(next.inv.current)}
        </p>
      )}
    </section>
  );
}

/** Goals still being saved for, with the finished ones folded into a line. */
export function GoalsCard() {
  const navigate = useNavigate();
  const [goals, setGoals] = useState<ApiGoal[] | null>(null);
  useEffect(() => {
    let alive = true;
    getGoals()
      .then((g) => alive && setGoals(g))
      .catch(() => alive && setGoals([]));
    return () => {
      alive = false;
    };
  }, []);
  if (!goals || goals.length === 0) return null;
  const open = goals.filter((g) => g.savedAmount < g.targetAmount);
  const done = goals.filter((g) => g.savedAmount >= g.targetAmount);

  return (
    <section className="flex cursor-pointer flex-col gap-4 rounded-2xl border bg-card p-6 hover:border-primary/40" onClick={() => navigate("/goals")}>
      <h2 className="text-base font-semibold">Goals</h2>
      {open.slice(0, 3).map((g) => {
        const pct = g.targetAmount > 0 ? Math.min(100, (g.savedAmount / g.targetAmount) * 100) : 0;
        return (
          <div key={g.id} className="space-y-1.5">
            <div className="flex text-sm">
              <span className="flex-1 truncate">{g.name}</span>
              <span className="text-muted-foreground">
                {lakh(g.savedAmount)} of {lakh(g.targetAmount)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%`, backgroundColor: g.color ?? "var(--primary)" }} />
            </div>
            <div className="text-xs text-muted-foreground">
              {formatINR(g.targetAmount - g.savedAmount)} to go{g.targetDate ? ` · by ${monthYear(g.targetDate)}` : ""}
            </div>
          </div>
        );
      })}
      {done.length > 0 && (
        <div className="mt-auto flex items-center gap-2 text-[13px] text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          {done.length === 1 ? `${done[0].name} funded · ${lakh(done[0].targetAmount)}` : `${done.length} goals funded`}
        </div>
      )}
    </section>
  );
}

/**
 * A readable name for a repeat payment: the accepted clean name when one exists, else the raw
 * alert text without its UPI reference ("UPI-653782697753-Blinkit IN" → "Blinkit").
 */
function displayName(r: RecurringPayment, same: Transaction[]): string {
  const norm = same.find((t) => t.merchantNorm)?.merchantNorm;
  if (norm) return norm;
  const raw = (r.merchant ?? r.category ?? "Unknown")
    .replace(/^UPI[-/]\d+[-/]/i, "")
    .replace(/\s+IN$/, "")
    .trim();
  return raw || "Unknown";
}

/** Payments that repeat, biggest first, with the merchant's own currency where it is not rupees. */
export function RecurringCard({ txns }: { txns: Transaction[] }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<RecurringPayment[] | null>(null);
  useEffect(() => {
    let alive = true;
    listRecurring()
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);
  const rows = useMemo(
    () =>
      (items ?? [])
        .filter((r) => r.monthlyEstimate > 0)
        .sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)
        .map((r) => {
          const same = txns.filter((t) => t.merchant === r.merchant);
          const foreign = same.find((t) => t.originalCurrency && t.originalCurrency !== "INR");
          return { ...r, name: displayName(r, same), original: foreign ? formatOriginal(foreign) : null };
        }),
    [items, txns],
  );
  if (rows.length === 0) return null;
  const monthly = rows.reduce((s, r) => s + r.monthlyEstimate, 0);

  return (
    <section className="flex cursor-pointer flex-col gap-2 rounded-2xl border bg-card p-6 hover:border-primary/40" onClick={() => navigate("/analytics")}>
      <div className="flex items-baseline pb-1">
        <h2 className="text-base font-semibold">Recurring</h2>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{lakh(monthly)}/month</span>
      </div>
      <div className="divide-y">
        {rows.slice(0, 6).map((r) => (
          <div key={`${r.merchant}-${r.cadence}`} className="flex items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {r.name}
              {r.original && <span className="text-muted-foreground"> · {r.original}</span>}
              {r.cadence !== "Monthly" && <span className="text-muted-foreground"> · {r.cadence.toLowerCase()}</span>}
            </span>
            <span className="font-mono tabular-nums">{formatINR(r.amount)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
