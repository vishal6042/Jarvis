import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, XAxis } from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, Gauge, Minus, ScanSearch, Settings2 } from "lucide-react";
import CardArt from "@/components/CardArt";
import type { Transaction } from "@/types";
import type { Period } from "@/lib/sample";
import { PERIOD_LABEL } from "@/lib/sample";
import { periodLabel } from "@/lib/txnseries";
import { budgetVsActual, compareCategories, detectAnomalies, spendingBehaviour, type NamedValue } from "@/lib/analytics";
import { formatINR, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const SEMANTIC = { ok: "var(--ok)", warn: "var(--warn)", danger: "var(--danger)", info: "var(--info)" };

function Delta({ value, pct, invert = false }: { value: number; pct: number | null; invert?: boolean }) {
  // For spend, up is bad: invert=false paints increases red.
  if (Math.abs(value) < 1) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="size-3" /> flat
      </span>
    );
  }
  const up = value > 0;
  const good = invert ? up : !up;
  const color = good ? SEMANTIC.ok : SEMANTIC.danger;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums" style={{ color }}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {formatINR(Math.abs(value))}
      {pct != null && <span className="font-normal opacity-80">({up ? "+" : "−"}{Math.abs(pct)}%)</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
export function PeriodComparisonCard({ now, prev, period, offset }: { now: NamedValue[]; prev: NamedValue[]; period: Period; offset: number }) {
  const cmp = compareCategories(now, prev);
  if (cmp.totalNow === 0 && cmp.totalPrev === 0) return null;
  const rows = cmp.rows.slice(0, 6);
  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="#3b82f6" subtle />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" /> vs previous {PERIOD_LABEL[period].toLowerCase()}
        </CardTitle>
        <CardDescription>
          {periodLabel(period, offset)} against {periodLabel(period, offset + 1)}
          {offset === 0 && period !== "day" ? " · current period still in progress" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-card/60 p-3">
          <div>
            <p className="text-xs text-muted-foreground">Total spend</p>
            <p className="text-2xl font-semibold tabular-nums">{formatINR(cmp.totalNow)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Previous: {formatINR(cmp.totalPrev)}</p>
            <Delta value={cmp.delta} pct={cmp.pct} />
          </div>
        </div>
        <div className="space-y-2">
          {rows.map((r) => {
            const max = Math.max(1, ...rows.map((x) => Math.max(x.now, x.prev)));
            return (
              <div key={r.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{r.name}</span>
                  <Delta value={r.delta} pct={r.pct} />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(r.now / max) * 100}%` }} title={`Now ${formatINR(r.now)}`} />
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${(r.prev / max) * 100}%` }} title={`Previous ${formatINR(r.prev)}`} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Left bar: this {PERIOD_LABEL[period].toLowerCase()} · right bar: previous. Biggest movers first.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
export function BudgetVsActualCard({ budgets, actual, period }: { budgets: Record<string, number>; actual: NamedValue[]; period: Period }) {
  const navigate = useNavigate();
  const rows = budgetVsActual(budgets, actual);
  const monthly = period === "month";
  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="#f59e0b" subtle />
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="size-4 text-primary" /> Budget vs actual
          </CardTitle>
          <CardDescription>{monthly ? "Monthly category budgets against this month." : "Budgets are monthly. Switch to the month view to compare."}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/settings")}>
          <Settings2 className="size-3.5" /> Edit
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No budgets yet. Set a monthly limit per category in Settings and track it here.</p>
        ) : (
          rows.map((r) => {
            const color = r.state === "over" ? SEMANTIC.danger : r.state === "warn" ? SEMANTIC.warn : SEMANTIC.ok;
            return (
              <div key={r.category} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{r.category}</span>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatINR(r.actual)}</span> / {formatINR(r.budget)}
                    <span className="ml-2 font-semibold" style={{ color }}>
                      {r.pct}%
                    </span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, monthly ? r.pct : 0)}%`, backgroundColor: color }} />
                </div>
                {monthly && r.state === "over" && (
                  <p className="text-[11px]" style={{ color }}>
                    Over by {formatINR(r.actual - r.budget)}
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
const dowConfig = { total: { label: "Spent", color: "#8b5cf6" } } satisfies ChartConfig;

export function BehaviourCard({ txns, period, offset }: { txns: Transaction[]; period: Period; offset: number }) {
  const b = spendingBehaviour(txns, period, offset);
  if (!b) return null;
  const weekendHeavier = b.weekendPerDay > b.weekdayPerDay;
  const ratio = b.weekdayPerDay > 0 ? b.weekendPerDay / b.weekdayPerDay : 0;
  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="#8b5cf6" subtle />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanSearch className="size-4 text-primary" /> Spending behaviour
        </CardTitle>
        <CardDescription>
          {b.count} transactions on {b.activeDays} of {b.daysInWindow} days · {periodLabel(period, offset)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Average" value={formatINR(Math.round(b.avg))} sub={`median ${formatINR(Math.round(b.median))}`} />
          <Mini label="Weekday / day" value={formatINR(Math.round(b.weekdayPerDay))} sub={`${formatINR(b.weekdayTotal)} total`} />
          <Mini label="Weekend / day" value={formatINR(Math.round(b.weekendPerDay))} sub={`${formatINR(b.weekendTotal)} total`} />
          <Mini label="Under ₹500" value={`${b.smallShare}%`} sub={`of transactions · ${b.smallTotalShare}% of money`} />
        </div>
        <ChartContainer config={dowConfig} className="h-[140px] w-full">
          <BarChart data={b.byDow} margin={{ left: 4, right: 4, top: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="total" radius={4} isAnimationActive={false}>
              {b.byDow.map((_, i) => (
                <Cell key={i} fill={i === 0 || i === 6 ? "#f43f5e" : "#8b5cf6"} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
        <p className="text-sm text-muted-foreground">
          {b.busiest && (
            <>
              <span className="font-medium text-foreground">{b.busiest.label}s</span> are your heaviest day ({formatINR(b.busiest.total)}).{" "}
            </>
          )}
          {ratio > 0 && (
            <>
              You spend{" "}
              <span className="font-medium text-foreground">
                {weekendHeavier ? `${ratio.toFixed(1)}× more` : `${(1 / ratio).toFixed(1)}× less`}
              </span>{" "}
              per day on weekends.{" "}
            </>
          )}
          {b.largest && (
            <>
              Largest single payment: <span className="font-medium text-foreground">{formatINR(b.largest.amount)}</span> to {b.largest.merchant ?? b.largest.category ?? "unknown"} on{" "}
              {formatDate(b.largest.occurredAt.slice(0, 10))}.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border bg-card/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function AnomaliesCard({ txns }: { txns: Transaction[] }) {
  const navigate = useNavigate();
  const items = detectAnomalies(txns);
  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="#f43f5e" subtle />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-primary" /> Worth a second look
        </CardTitle>
        <CardDescription>Unusual against your own last 90 days: oversized payments, category spikes, new merchants.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing unusual in the last 30 days. Your spending matches its own pattern.</p>
        ) : (
          items.map((a) => {
            const color = a.severity === "red" ? SEMANTIC.danger : SEMANTIC.warn;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => a.href && navigate(a.href)}
                className="flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(a.on)} · {a.detail}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatINR(Math.round(a.amount))}</span>
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
