import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatINR, formatOriginal, merchantLabel } from "@/lib/format";
import { fmtDay, localDay, spendOf, type Report } from "@/lib/report";
import { useWidth } from "@/lib/useWidth";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import SidePanel from "@/components/page/SidePanel";

const lakh = (n: number) => formatINR(n, { compact: true });
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function MonthBars({ labels, values, budget, current }: { labels: string[]; values: number[]; budget: number | null; current: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(520);
  const H = 200;
  const top = 26;
  const base = 170;
  const max = Math.max(1, ...values, budget ?? 0);
  const col = W / Math.max(1, values.length);
  const bw = Math.min(56, col * 0.6);
  const y = (v: number) => base - (v / max) * (base - top);
  return (
    <div ref={ref} className="w-full min-w-0 overflow-hidden">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Spend in this category by month">
        <line x1={0} x2={W} y1={base} y2={base} stroke="var(--border)" />
        {values.map((v, i) => {
          const x = col * i + (col - bw) / 2;
          const over = budget != null && v > budget;
          const isCur = i === current;
          return (
            <g key={labels[i]}>
              <rect x={x} y={y(v)} width={bw} height={Math.max(1, base - y(v))} rx={5} fill={isCur ? (over ? "#d97706" : "var(--primary)") : "color-mix(in oklch, var(--primary) 30%, transparent)"} />
              <text x={x + bw / 2} y={y(v) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)">
                {v > 0 ? lakh(v) : ""}
              </text>
              <text x={x + bw / 2} y={base + 18} textAnchor="middle" fontSize={12} fontWeight={isCur ? 600 : 400} fill={isCur ? "var(--foreground)" : "var(--muted-foreground)"}>
                {labels[i]}
              </text>
            </g>
          );
        })}
        {budget != null && (
          <>
            <line x1={0} x2={W} y1={y(budget)} y2={y(budget)} stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="6 5" />
            <text x={W - 2} y={y(budget) - 6} textAnchor="end" fontSize={11} fill="var(--foreground)">
              budget {lakh(budget)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

/** One category for the period: its months, where the money went and every payment. */
export default function CategoryPanel({
  r,
  category,
  cardIds,
  onClose,
}: {
  r: Report;
  category: string | null;
  cardIds: ReadonlySet<number>;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const line = r.categories.find((c) => c.category === category);
  const rows = useMemo(
    () => (category ? r.txns.filter((t) => (t.category ?? "Uncategorized") === category).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)) : []),
    [r.txns, category],
  );
  const purchases = rows.filter((t) => t.direction === "DEBIT");
  const onCards = purchases.filter((t) => t.accountId != null && cardIds.has(t.accountId)).reduce((s, t) => s + t.amount, 0);
  const merchants = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of rows) m.set(merchantLabel(t), (m.get(merchantLabel(t)) ?? 0) + spendOf(t, cardIds));
    return Array.from(m.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [rows, cardIds]);
  const topMerchants = merchants.slice(0, 6);
  const restMerchants = merchants.slice(6);
  const maxMerchant = topMerchants[0]?.[1] ?? 1;
  const monthLabels = r.months.map((m) => m.label);
  const current = r.months.findIndex((m) => m.key === r.window.to.slice(0, 7));
  const series = line?.series ?? [];
  const falling = series.length >= 4 && series.slice(-4).every((v, i, a) => i === 0 || v < a[i - 1]);
  const rising = series.length >= 4 && series.slice(-4).every((v, i, a) => i === 0 || v > a[i - 1]);
  const budget = line?.budget ?? null;
  const maxMonth = Math.max(0, ...series);
  const minMonth = series.length ? Math.min(...series.filter((_, i) => !(i === current && r.window.running))) : 0;

  const openTxns = () => {
    const p = new URLSearchParams({ category: category ?? "", from: r.window.from, to: r.window.to });
    navigate(`/transactions?${p.toString()}`);
  };

  return (
    <SidePanel open={!!category} onClose={onClose}>
        {!line ? (
          <div className="p-8">
            <DialogTitle>{category}</DialogTitle>
            <DialogDescription>Nothing spent in this category in {r.window.label}.</DialogDescription>
          </div>
        ) : (
          <>
            <div className="space-y-4 border-b p-6 pr-14">
              <div className="flex items-center gap-2.5">
                <span className="size-3 rounded-full" style={{ backgroundColor: line.fixed ? "#3f2aa8" : line.oneOff ? "#d97706" : "#9a8cf0" }} />
                <DialogTitle className="text-xl font-semibold">{line.category}</DialogTitle>
              </div>
              <div className="flex items-end gap-4">
                <div className="space-y-1">
                  <DialogDescription>
                    {r.window.label} · {purchases.length} payment{purchases.length === 1 ? "" : "s"}
                  </DialogDescription>
                  <div className="text-4xl font-semibold tracking-tight tabular-nums">{formatINR(line.total)}</div>
                </div>
                <div className="flex-1" />
                <div className="flex flex-col items-end gap-1.5">
                  {budget != null && (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        line.total > budget ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300" : "bg-primary/10 text-primary"
                      }`}
                    >
                      {Math.round((line.total / budget) * 100)}% of {formatINR(budget)} budget
                    </span>
                  )}
                  {line.deltaPct != null && (
                    <span className={`text-xs ${line.deltaPct <= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                      {line.deltaPct <= 0 ? "▼" : "▲"} {Math.abs(Math.round(line.deltaPct))}% vs {r.compare.label}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 overflow-hidden rounded-xl border">
                <div className="border-r p-3">
                  <div className="text-xs text-muted-foreground">Monthly average</div>
                  <div className="font-mono font-semibold tabular-nums">{line.avg > 0 ? formatINR(line.avg) : "—"}</div>
                </div>
                <div className="border-r p-3">
                  <div className="text-xs text-muted-foreground">Typical payment</div>
                  <div className="font-mono font-semibold tabular-nums">{formatINR(median(purchases.map((t) => t.amount)))}</div>
                </div>
                <div className="p-3">
                  <div className="text-xs text-muted-foreground">On cards</div>
                  <div className="font-semibold">{line.total > 0 ? `${Math.round((onCards / Math.max(1, purchases.reduce((s, t) => s + t.amount, 0))) * 100)}%` : "—"}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 border-b p-6">
              <div className="flex items-baseline">
                <h3 className="text-[15px] font-semibold">Month by month</h3>
                <div className="flex-1" />
                {falling && <span className="text-[13px] text-emerald-700 dark:text-emerald-400">down four months running</span>}
                {rising && <span className="text-[13px] text-rose-700 dark:text-rose-400">up four months running</span>}
              </div>
              <MonthBars labels={monthLabels} values={series} budget={budget} current={current} />
              {budget != null && minMonth > budget * 1.5 && (
                <p className="text-[13px] text-muted-foreground">
                  A {lakh(budget)} budget is well under what you have spent in any month so far (lowest {lakh(minMonth)}, highest {lakh(maxMonth)}). Keep it as a stretch goal, or
                  raise it on the Settings page.
                </p>
              )}
            </div>

            <div className="space-y-2.5 border-b p-6">
              <div className="flex items-baseline">
                <h3 className="text-[15px] font-semibold">Where</h3>
                <div className="flex-1" />
                <span className="text-[13px] text-muted-foreground">
                  {merchants.length} merchant{merchants.length === 1 ? "" : "s"} · {purchases.length} payments
                </span>
              </div>
              {topMerchants.map(([name, v]) => (
                <div key={name} className="flex items-center gap-3 text-sm">
                  <span className="w-40 truncate">{name}</span>
                  <span className="h-2 flex-1 rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary/60" style={{ width: `${(v / maxMerchant) * 100}%` }} />
                  </span>
                  <span className="w-20 text-right font-mono tabular-nums">{formatINR(v)}</span>
                </div>
              ))}
              {restMerchants.length > 0 && (
                <p className="text-[13px] text-muted-foreground">
                  + {restMerchants.length} more · {formatINR(restMerchants.reduce((s, [, v]) => s + v, 0))}
                </p>
              )}
            </div>

            <div className="space-y-1 p-6">
              <div className="flex items-baseline pb-1">
                <h3 className="text-[15px] font-semibold">Every payment</h3>
                <div className="flex-1" />
                <button type="button" className="text-[13px] font-medium text-primary hover:underline" onClick={openTxns}>
                  Open in Transactions →
                </button>
              </div>
              <div className="divide-y divide-border/60">
                {rows.slice(0, 25).map((t) => {
                  const refund = t.direction === "CREDIT";
                  const original = formatOriginal(t);
                  return (
                    <div key={t.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-14 shrink-0 text-xs text-muted-foreground">{fmtDay(localDay(t))}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {merchantLabel(t)}
                        <span className="text-xs text-muted-foreground">
                          {t.accountName ? ` · ${t.accountName.slice(-4)}` : ""}
                          {original ? ` · ${original}` : ""}
                          {refund ? " · refund" : ""}
                        </span>
                      </span>
                      <span className={`font-mono tabular-nums ${refund ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                        {refund ? "−" : ""}
                        {formatINR(t.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
              {rows.length > 25 && (
                <button type="button" onClick={openTxns} className="pt-2 text-sm font-medium text-primary hover:underline">
                  + {rows.length - 25} more in Transactions
                </button>
              )}
            </div>
          </>
        )}
    </SidePanel>
  );
}
