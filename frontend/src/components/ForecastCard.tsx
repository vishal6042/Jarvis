import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import CardArt from "@/components/CardArt";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatINR } from "@/lib/format";
import { netWorthTrend } from "@/api";
import type { NetWorthPoint, Transaction } from "@/types";
import { monthlyNetSaving, projectNetWorth, SCENARIO_PRESETS, type Scenario } from "@/lib/projection";

const config = {
  actual: { label: "Actual", color: "var(--chart-1)" },
  base: { label: "Forecast", color: "var(--chart-5)" },
  scenario: { label: "What-if", color: "var(--chart-4)" },
} satisfies ChartConfig;

const lbl = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

/**
 * Net-worth forecast: the last 12 months actual (from the trend API) continued 12 months at the
 * current pace, with optional what-if scenarios drawn as a second dotted path.
 */
export default function ForecastCard({ txns, currentNetWorth }: { txns: Transaction[]; currentNetWorth: number }) {
  const [history, setHistory] = useState<NetWorthPoint[]>([]);
  const [active, setActive] = useState<string[]>([]);
  const [custom, setCustom] = useState<string>("");
  useEffect(() => {
    netWorthTrend(12).then(setHistory).catch(() => setHistory([]));
  }, []);

  const pace = useMemo(() => monthlyNetSaving(txns), [txns]);
  const scenarios: Scenario[] = useMemo(() => {
    const list = SCENARIO_PRESETS.filter((s) => active.includes(s.id));
    const c = Number(custom);
    if (Number.isFinite(c) && c !== 0) list.push({ id: "custom", label: "Custom monthly change", monthlyDelta: c });
    return list;
  }, [active, custom]);

  const base = useMemo(() => projectNetWorth(currentNetWorth, pace.amount, [], 12), [currentNetWorth, pace.amount]);
  const what = useMemo(() => projectNetWorth(currentNetWorth, pace.amount, scenarios, 12), [currentNetWorth, pace.amount, scenarios]);
  const hasScenario = scenarios.length > 0;

  const data = useMemo(() => {
    const rows: { label: string; actual?: number; base?: number; scenario?: number }[] = history.map((p) => ({ label: lbl(p.month), actual: p.netWorth }));
    const now = new Date();
    const nowLabel = now.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    // join point: today's value on all series so the lines connect
    if (rows.length === 0 || rows[rows.length - 1].label !== nowLabel) rows.push({ label: nowLabel, actual: currentNetWorth });
    const last = rows[rows.length - 1];
    last.actual = currentNetWorth;
    last.base = currentNetWorth;
    if (hasScenario) last.scenario = currentNetWorth;
    base.forEach((p, i) => rows.push({ label: p.label, base: p.value, scenario: hasScenario ? what[i].value : undefined }));
    return rows;
  }, [history, currentNetWorth, base, what, hasScenario]);

  const end = base[base.length - 1]?.value ?? currentNetWorth;
  const endWhat = what[what.length - 1]?.value ?? end;
  const endLabel = base[base.length - 1]?.label ?? "";

  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="var(--chart-5)" subtle />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="size-4 text-primary" /> Net worth forecast
        </CardTitle>
        <CardDescription>
          {pace.basis === 0 ? (
            "Not enough history yet to estimate your monthly pace."
          ) : (
            <>
              At your current pace of{" "}
              <span className={`font-semibold ${pace.amount >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
                {pace.amount >= 0 ? "+" : "−"}{formatINR(Math.abs(pace.amount))}/month
              </span>{" "}
              (median of the last {pace.basis} month{pace.basis === 1 ? "" : "s"}), estimated net worth by {endLabel}:{" "}
              <span className="font-semibold text-foreground">{formatINR(end)}</span>
              {hasScenario && (
                <>
                  {" "}· with what-ifs: <span className="font-semibold" style={{ color: "var(--chart-4)" }}>{formatINR(endWhat)}</span>{" "}
                  <span className={endWhat - end >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}>
                    ({endWhat - end >= 0 ? "+" : "−"}{formatINR(Math.abs(endWhat - end))})
                  </span>
                </>
              )}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChartContainer config={config} className="h-[260px] w-full">
          <AreaChart data={data} margin={{ left: 16, right: 16, top: 8 }}>
            <defs>
              <linearGradient id="fc-actual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-actual)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-actual)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} interval={2} />
            <YAxis hide domain={["auto", "auto"]} />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <ReferenceLine x={data.find((r) => r.actual != null && r.base != null)?.label} stroke="var(--muted-foreground)" strokeDasharray="2 4" />
            <Area dataKey="actual" name="Actual" type="monotone" stroke="var(--color-actual)" fill="url(#fc-actual)" strokeWidth={2} isAnimationActive={false} connectNulls={false} />
            <Area dataKey="base" name="Forecast" type="monotone" stroke="var(--color-base)" fill="var(--color-base)" fillOpacity={0.06} strokeWidth={2} strokeDasharray="5 5" isAnimationActive={false} />
            {hasScenario && (
              <Area dataKey="scenario" name="What-if" type="monotone" stroke="var(--color-scenario)" fill="var(--color-scenario)" fillOpacity={0.05} strokeWidth={2} strokeDasharray="2 4" isAnimationActive={false} />
            )}
          </AreaChart>
        </ChartContainer>

        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">What if I…</p>
          <div className="flex flex-wrap items-center gap-2">
            {SCENARIO_PRESETS.map((s) => {
              const on = active.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActive((a) => (on ? a.filter((x) => x !== s.id) : [...a, s.id]))}
                  className={`rounded-full px-3 py-1 text-xs ring-1 transition-colors ${on ? "bg-primary text-primary-foreground ring-primary" : "bg-primary/8 ring-primary/20 hover:bg-primary/15"}`}
                >
                  {s.label}
                </button>
              );
            })}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Custom ₹/month</span>
              <Input value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9-]/g, ""))} placeholder="+5000" className="h-7 w-24" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
