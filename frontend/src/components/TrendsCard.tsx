import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { LineChart } from "lucide-react";
import CardArt from "@/components/CardArt";
import { netWorthTrend } from "@/api";
import type { NetWorthPoint, Transaction } from "@/types";
import { monthlySeries } from "@/lib/analytics";
import { formatINR } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

type Metric = "spend" | "income" | "net" | "networth";

const METRICS: { value: Metric; label: string; color: string }[] = [
  { value: "spend", label: "Spending", color: "#f43f5e" },
  { value: "income", label: "Income", color: "#10b981" },
  { value: "net", label: "Cash flow", color: "#3b82f6" },
  { value: "networth", label: "Net worth", color: "#8b5cf6" },
];

const compact = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${s}${Math.round(a / 1e3)}K`;
  return `${s}${Math.round(a)}`;
};

/** Twelve months of spending, income, cash flow or net worth — the "how has this moved" view. */
export default function TrendsCard({ txns }: { txns: Transaction[] }) {
  const [metric, setMetric] = useState<Metric>("spend");
  const [netWorth, setNetWorth] = useState<NetWorthPoint[]>([]);
  useEffect(() => {
    let alive = true;
    netWorthTrend(12)
      .then((p) => alive && setNetWorth(p))
      .catch(() => alive && setNetWorth([]));
    return () => {
      alive = false;
    };
  }, []);

  const months = useMemo(() => monthlySeries(txns, 12), [txns]);
  const active = METRICS.find((m) => m.value === metric)!;

  const data = useMemo(() => {
    if (metric === "networth") {
      return netWorth.map((p) => ({
        label: new Date(`${p.month}-01T00:00:00`).toLocaleString("en-IN", { month: "short" }),
        value: Math.round(Number(p.netWorth)),
      }));
    }
    return months.map((m) => ({ label: m.label, value: m[metric] }));
  }, [metric, months, netWorth]);

  const config = { value: { label: active.label, color: active.color } } satisfies ChartConfig;
  const hasData = data.some((d) => d.value !== 0);

  // Compare the last two COMPLETE months: the current one is still filling up, so including it
  // would report a fall every time.
  const summary = useMemo(() => {
    if (data.length < 3) return null;
    const last = data[data.length - 2];
    const prev = data[data.length - 3];
    if (prev.value === 0) return null;
    const pct = Math.round(((last.value - prev.value) / Math.abs(prev.value)) * 100);
    const current = data[data.length - 1];
    const tail = ` ${current.label} is still in progress.`;
    if (pct === 0) return `${active.label} in ${last.label} was flat against ${prev.label}.` + tail;
    const dir = pct > 0 ? "higher" : "lower";
    return `${active.label} in ${last.label} was ${Math.abs(pct)}% ${dir} than ${prev.label}.` + tail;
  }, [data, active.label]);

  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color={active.color} subtle />
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="size-4 text-primary" /> Trends
          </CardTitle>
          <CardDescription>{summary ?? "The last 12 months."}</CardDescription>
        </div>
        <div className="flex rounded-lg border p-0.5 text-xs">
          {METRICS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMetric(m.value)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                metric === m.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            No {active.label.toLowerCase()} history yet.
          </div>
        ) : metric === "net" ? (
          <ChartContainer config={config} className="h-[260px] w-full">
            <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11 }} tickFormatter={compact} />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="value" radius={4} isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.value >= 0 ? "var(--ok)" : "var(--danger)"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <ChartContainer config={config} className="h-[260px] w-full">
            <AreaChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
              <defs>
                <linearGradient id={`trend-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={active.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={active.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11 }} tickFormatter={compact} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Area
                dataKey="value"
                name={active.label}
                type="monotone"
                stroke={active.color}
                fill={`url(#trend-${metric})`}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
        {metric !== "networth" && hasData && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Totals exclude transfers between your own accounts and credit-card bill payments.
            {" "}Latest month: {formatINR(data[data.length - 1]?.value ?? 0)}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
