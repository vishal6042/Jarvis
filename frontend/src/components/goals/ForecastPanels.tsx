import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import Panel from "@/components/page/Panel";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { netWorthTrend } from "@/api";
import type { NetWorthPoint } from "@/types";
import { formatINR } from "@/lib/format";
import { projectNetWorth, SCENARIO_PRESETS, type Scenario } from "@/lib/projection";

/*
 * The Goals page's longer view, on the page's own Panel styling: net worth continued at today's
 * pace with what-if scenarios, and the last twelve months it continues from. The same arithmetic
 * as the old ForecastCard and NetWorthTrendCard (lib/projection, the trend API); the history is
 * fetched once here and shared, where the two cards each fetched their own.
 */

const forecastConfig = {
  actual: { label: "Actual", color: "var(--chart-1)" },
  base: { label: "Forecast", color: "var(--chart-5)" },
  scenario: { label: "What-if", color: "var(--chart-4)" },
} satisfies ChartConfig;

const trendConfig = {
  netWorth: { label: "Net worth", color: "var(--chart-1)" },
} satisfies ChartConfig;

const lbl = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

/**
 * Net worth twelve months on at the pace the goals are planned with, and how it moves under the
 * what-ifs, so a goal plan can be seen against the whole balance sheet rather than on its own.
 */
function ForecastPanel({
  history,
  currentNetWorth,
  pace,
}: {
  history: NetWorthPoint[];
  currentNetWorth: number;
  pace: { amount: number; basis: number };
}) {
  const [active, setActive] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
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
    const nowLabel = new Date().toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    // Today's value sits on every series so the actual line and the forecasts join up.
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
  const diff = endWhat - end;

  return (
    <Panel title="Net worth forecast" note={pace.basis > 0 ? `12 months at your current pace` : undefined}>
      <p className="-mt-2 text-[13px] text-muted-foreground">
        {pace.basis === 0 ? (
          "Not enough history yet to estimate your monthly pace."
        ) : (
          <>
            At{" "}
            <span className={`font-semibold ${pace.amount >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
              {pace.amount >= 0 ? "+" : "−"}
              {formatINR(Math.abs(pace.amount))} a month
            </span>{" "}
            (median of the last {pace.basis} month{pace.basis === 1 ? "" : "s"}), net worth by {endLabel} comes to{" "}
            <span className="font-semibold text-foreground">{formatINR(end)}</span>
            {hasScenario && (
              <>
                {" "}· with the what-ifs <span className="font-semibold text-foreground">{formatINR(endWhat)}</span>{" "}
                <span className={diff >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
                  ({diff >= 0 ? "+" : "−"}
                  {formatINR(Math.abs(diff))})
                </span>
              </>
            )}
          </>
        )}
      </p>
      <ChartContainer config={forecastConfig} className="h-[240px] w-full">
        <AreaChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="goals-fc-actual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-actual)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-actual)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis hide domain={["auto", "auto"]} />
          <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
          <ReferenceLine x={data.find((r) => r.actual != null && r.base != null)?.label} stroke="var(--muted-foreground)" strokeDasharray="2 4" />
          <Area dataKey="actual" name="Actual" type="monotone" stroke="var(--color-actual)" fill="url(#goals-fc-actual)" strokeWidth={2} isAnimationActive={false} connectNulls={false} />
          <Area dataKey="base" name="Forecast" type="monotone" stroke="var(--color-base)" fill="var(--color-base)" fillOpacity={0.06} strokeWidth={2} strokeDasharray="5 5" isAnimationActive={false} />
          {hasScenario && (
            <Area dataKey="scenario" name="What-if" type="monotone" stroke="var(--color-scenario)" fill="var(--color-scenario)" fillOpacity={0.05} strokeWidth={2} strokeDasharray="2 4" isAnimationActive={false} />
          )}
        </AreaChart>
      </ChartContainer>

      <div>
        <p className="mb-2 text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">What if I…</p>
        <div className="flex flex-wrap items-center gap-2">
          {SCENARIO_PRESETS.map((s) => {
            const on = active.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => setActive((a) => (on ? a.filter((x) => x !== s.id) : [...a, s.id]))}
                className={`rounded-full px-3 py-1 text-xs ring-1 transition-colors ${on ? "bg-primary text-primary-foreground ring-primary" : "bg-primary/8 ring-primary/20 hover:bg-primary/15"}`}
              >
                {s.label}
              </button>
            );
          })}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Custom ₹ a month</span>
            <Input value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9-]/g, ""))} placeholder="+5000" className="h-7 w-24" />
          </label>
        </div>
      </div>
    </Panel>
  );
}

/** Where net worth has been: savings cash at each month end, lifted by today's investment value. */
function TrendPanel({ history, loading, addInvestments }: { history: NetWorthPoint[]; loading: boolean; addInvestments: number }) {
  const data = useMemo(
    () =>
      history.map((p) => ({
        label: new Date(`${p.month}-01T00:00:00`).toLocaleString("en-IN", { month: "short" }),
        netWorth: Math.round(Number(p.netWorth)) + addInvestments,
      })),
    [history, addInvestments],
  );
  const hasData = data.some((d) => d.netWorth !== 0);
  return (
    <Panel title="Net worth trend" note={`Month-end savings${addInvestments > 0 ? " plus investments" : ""} · last 12 months`}>
      {loading ? (
        <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : !hasData ? (
        <div className="flex h-[240px] flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium">No balance history yet</p>
          <p className="text-sm text-muted-foreground">Import a savings statement to build your net-worth trend.</p>
        </div>
      ) : (
        <ChartContainer config={trendConfig} className="h-[240px] w-full">
          <AreaChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="goals-nw-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-netWorth)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-netWorth)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis hide domain={["auto", "auto"]} />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <Area dataKey="netWorth" name="Net worth" type="monotone" stroke="var(--color-netWorth)" fill="url(#goals-nw-fill)" strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ChartContainer>
      )}
    </Panel>
  );
}

/** The forecast and the trend side by side on a wide screen, stacked on a narrow one. */
export default function ForecastPanels({
  currentNetWorth,
  investments,
  pace,
}: {
  currentNetWorth: number;
  investments: number;
  pace: { amount: number; basis: number };
}) {
  const [history, setHistory] = useState<NetWorthPoint[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    netWorthTrend(12)
      .then((p) => alive && setHistory(p))
      .catch(() => alive && setHistory([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <ForecastPanel history={history} currentNetWorth={currentNetWorth} pace={pace} />
      <TrendPanel history={history} loading={loading} addInvestments={investments} />
    </div>
  );
}
