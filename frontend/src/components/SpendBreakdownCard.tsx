import { useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import CardArt from "@/components/CardArt";
import CountUp from "@/components/CountUp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import type { MonthBreakdown } from "@/lib/breakdown";

const COLORS = ["#8b5cf6", "#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#14b8a6", "#f97316", "#6b7280"];

/** "Where your money went" this month, each category against its 6-month average, with a why-line. */
export default function SpendBreakdownCard({ b }: { b: MonthBreakdown }) {
  const navigate = useNavigate();
  const monthLabel = new Date(`${b.month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long" });
  const vsLast = b.lastMonthTotal > 0 ? ((b.total - b.lastMonthTotal) / b.lastMonthTotal) * 100 : null;
  const rows = b.rows.slice(0, 6);
  const rest = b.rows.slice(6).reduce((s, r) => s + r.total, 0);
  return (
    <Card className="relative isolate h-full overflow-hidden">
      <CardArt color="#8b5cf6" subtle />
      <CardHeader className="pb-3">
        <CardTitle>Where your money went</CardTitle>
        <CardDescription>
          {monthLabel} ·{" "}
          <span className="font-semibold text-foreground">
            <CountUp value={b.total} format={(n) => formatINR(n)} />
          </span>
          {vsLast != null && (
            <span className={`ml-2 inline-flex items-center gap-0.5 text-xs ${vsLast > 0 ? "text-[var(--danger)]" : "text-[var(--ok)]"}`}>
              {vsLast > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(vsLast).toFixed(1)}% vs last month
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spending recorded yet this month.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <button
                key={r.category}
                type="button"
                onClick={() => navigate(`/transactions?month=${b.month}&category=${encodeURIComponent(r.category)}`)}
                className="group w-full text-left"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {r.category}
                    <ChevronRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {r.deltaPct != null && Math.abs(r.deltaPct) >= 15 && (
                      <span className={`text-[11px] ${r.deltaPct > 0 ? "text-[var(--warn)]" : "text-[var(--ok)]"}`}>
                        {r.deltaPct > 0 ? "+" : ""}
                        {Math.round(r.deltaPct)}% vs avg
                      </span>
                    )}
                    <span className="font-semibold">{formatINR(r.total)}</span>
                    <span className="w-9 text-right text-xs text-muted-foreground">{Math.round(r.share * 100)}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${Math.max(2, r.share * 100)}%`, backgroundColor: COLORS[i % COLORS.length] }}
                  />
                </div>
              </button>
            ))}
            {rest > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Other</span>
                <span>{formatINR(rest)}</span>
              </div>
            )}
          </div>
        )}
        {b.movers.length > 0 && (
          <div className="rounded-lg border bg-background/40 p-3 text-sm">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Why</p>
            <ul className="mt-1 space-y-0.5">
              {b.movers.map((m) => (
                <li key={m.category}>
                  <span className="font-medium">{m.category}</span> is {Math.round(m.deltaPct)}% above your 6-month average
                  <span className="text-muted-foreground"> (+{formatINR(m.excess)})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
