import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Store } from "lucide-react";
import CardArt from "@/components/CardArt";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import { merchantTotals, paymentMethodTotals } from "@/lib/breakdown";
import { isRealFlow } from "@/lib/forecast";
import { periodLabel, periodWindow } from "@/lib/txnseries";
import type { Period } from "@/lib/sample";
import type { Transaction } from "@/types";

type View = "merchant" | "method" | "category";
type Row = { key: string; label: string; sub: string; total: number; q: string | null; category?: string };

/** "Where your money actually goes": top merchants, payment method split, or category — for the selected period. */
export default function MerchantBreakdownCard({ txns, period, offset }: { txns: Transaction[]; period: Period; offset: number }) {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("merchant");
  const inPeriod = useMemo(() => {
    const { from, to } = periodWindow(period, offset);
    return txns.filter((t) => {
      const at = new Date(t.occurredAt);
      return at >= from && at < to;
    });
  }, [txns, period, offset]);

  const rows = useMemo<Row[]>(() => {
    if (view === "merchant") return merchantTotals(inPeriod, 8).map((r) => ({ key: r.merchant, label: r.merchant, sub: `${r.count} txn${r.count === 1 ? "" : "s"}`, total: r.total, q: r.merchant }));
    if (view === "method") return paymentMethodTotals(inPeriod).map((r) => ({ key: r.method, label: r.method, sub: "", total: r.total, q: null }));
    const m = new Map<string, number>();
    inPeriod.filter((t) => t.direction === "DEBIT" && isRealFlow(t)).forEach((t) => m.set(t.category ?? "Uncategorized", (m.get(t.category ?? "Uncategorized") ?? 0) + t.amount));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ key: k, label: k, sub: "", total: v, q: null, category: k }));
  }, [inPeriod, view]);
  const max = rows.reduce((s, r) => Math.max(s, r.total), 0);
  const total = rows.reduce((s, r) => s + r.total, 0);

  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="#14b8a6" subtle />
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Store className="size-4 text-teal-500" /> Where your money actually goes
          </CardTitle>
          <CardDescription>{periodLabel(period, offset)} · click a row to see its transactions</CardDescription>
        </div>
        <div className="inline-flex rounded-lg border p-0.5 text-xs">
          {(["merchant", "method", "category"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 capitalize transition-colors ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {v === "method" ? "Payment method" : v}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spending in this period.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (r.q) params.set("q", r.q);
                  if (r.category) params.set("category", r.category);
                  navigate(`/transactions?${params.toString()}`);
                }}
                className="group w-full text-left"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{r.label}</span>
                    {r.sub && <span className="shrink-0 text-xs text-muted-foreground">· {r.sub}</span>}
                    <ChevronRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className="font-semibold">{formatINR(r.total)}</span>
                    <span className="w-9 text-right text-xs text-muted-foreground">{total > 0 ? Math.round((r.total / total) * 100) : 0}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-teal-500/80 transition-[width] duration-700" style={{ width: `${max > 0 ? Math.max(2, (r.total / max) * 100) : 0}%` }} />
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
