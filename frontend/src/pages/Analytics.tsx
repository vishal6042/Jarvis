import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, RadialBar, RadialBarChart, XAxis, YAxis } from "recharts";
import { ChevronRight, Layers, Trophy, Wallet, X } from "lucide-react";
import {
  categoryBreakdown,
  categoryTxns,
  hashId,
  pointLabels,
  valueSeries,
  PERIOD_LABEL,
  type Period,
} from "@/lib/sample";
import { useFamily } from "@/lib/store";
import { formatINR, formatDate } from "@/lib/format";
import PeriodTabs from "@/components/PeriodTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const cfg = { value: { label: "Spent", color: "var(--chart-2)" } } satisfies ChartConfig;
const PERIOD_FACTOR: Record<Period, number> = { day: 0.08, week: 0.35, month: 1, year: 11 };
const CAT_COLORS = ["#10b981", "#8b5cf6", "#3b82f6", "#f59e0b", "#ec4899", "#14b8a6", "#ef4444", "#a855f7"];
// [light → deep] gradient stops per category, hue-matched to CAT_COLORS.
const CAT_GRAD: [string, string][] = [
  ["#34d399", "#059669"],
  ["#a78bfa", "#7c3aed"],
  ["#60a5fa", "#2563eb"],
  ["#fbbf24", "#d97706"],
  ["#f472b6", "#db2777"],
  ["#2dd4bf", "#0d9488"],
  ["#fb7185", "#e11d48"],
  ["#c084fc", "#9333ea"],
];

export default function Analytics() {
  const { seed } = useFamily();
  const [period, setPeriod] = useState<Period>("month");
  const [selected, setSelected] = useState<string | null>(null);

  const factor = PERIOD_FACTOR[period];
  const data = useMemo(
    () => categoryBreakdown.map((c) => ({ name: c.name, value: Math.round(c.value * factor) })),
    [factor]
  );
  const total = data.reduce((s, c) => s + c.value, 0);

  const drill = useMemo(
    () => (selected ? categoryTxns(selected, period, seed) : []),
    [selected, period, seed]
  );
  const drillTotal = drill.reduce((s, t) => s + t.amount, 0);

  // --- Category spending trends (filterable) ---
  const [trendCat, setTrendCat] = useState<string>("all");
  const trendItems = [
    { value: "all", label: "All categories" },
    ...data.map((c) => ({ value: c.name, label: c.name })),
  ];
  const trend = useMemo(() => {
    if (trendCat === "all") {
      // one bar per category
      return data.map((c, i) => ({ name: c.name, value: c.value, fill: CAT_COLORS[i % CAT_COLORS.length] }));
    }
    // a specific category → its spend distributed across the period points
    const idx = data.findIndex((c) => c.name === trendCat);
    const cat = data[idx];
    const labels = pointLabels(period);
    const base = cat ? Math.max(40, Math.round(cat.value / labels.length)) : 100;
    const series = valueSeries(period, hashId(trendCat) + seed, base);
    const color = CAT_COLORS[(idx < 0 ? 0 : idx) % CAT_COLORS.length];
    return labels.map((label, i) => ({ name: label, value: series[i] ?? 0, fill: color }));
  }, [trendCat, data, period, seed]);
  const trendInterval = trendCat === "all" ? 0 : period === "day" ? 2 : period === "month" ? 4 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Where your money goes — by category and period.</p>
        </div>
        <PeriodTabs value={period} onChange={setPeriod} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          title={`Total spend · ${PERIOD_LABEL[period]}`}
          value={formatINR(total)}
          icon={<Wallet className="size-4" />}
          iconColor="#8b5cf6"
        />
        <Stat
          title="Categories"
          value={String(data.length)}
          icon={<Layers className="size-4" />}
          iconColor="#3b82f6"
        />
        <Stat
          title="Top category"
          value={data[0]?.name ?? "—"}
          icon={<Trophy className="size-4" />}
          iconColor="#10b981"
        />
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Spend by category</CardTitle>
          <CardDescription>Click a ring or a legend row to see every expenditure.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,260px)_1fr]">
            <div className="relative mx-auto h-[260px] w-full max-w-[260px]">
            <ChartContainer config={cfg} className="h-full w-full">
              <RadialBarChart
                data={data.map((c, i) => ({ ...c, fill: CAT_COLORS[i % CAT_COLORS.length] }))}
                innerRadius="38%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
              >
                <defs>
                  {data.map((_, i) => {
                    const [from, to] = CAT_GRAD[i % CAT_GRAD.length];
                    return (
                      <linearGradient key={i} id={`cat-grad-${i}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={from} />
                        <stop offset="100%" stopColor={to} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                <RadialBar
                  dataKey="value"
                  background={{ fill: "var(--muted)", opacity: 0.4 }}
                  cornerRadius={6}
                  isAnimationActive={false}
                >
                  {data.map((c, i) => (
                    <Cell
                      key={i}
                      fill={`url(#cat-grad-${i})`}
                      cursor="pointer"
                      onClick={() => setSelected(c.name)}
                    />
                  ))}
                </RadialBar>
              </RadialBarChart>
            </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="text-lg font-bold tracking-tight">{formatINR(total)}</span>
              </div>
            </div>

            {/* Legend — identifies each ring */}
            <div className="space-y-1">
              {data.map((c, i) => {
                const share = total ? Math.round((c.value / total) * 100) : 0;
                return (
                  <button
                    key={c.name}
                    onClick={() => setSelected(c.name)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
                  >
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} />
                    <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                    <span className="w-9 text-right text-xs text-muted-foreground">{share}%</span>
                    <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatINR(c.value)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>
                {selected} · {PERIOD_LABEL[period]}
              </CardTitle>
              <CardDescription>
                {drill.length} expenditures · {formatINR(drillTotal)} total
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drill.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
                    <TableCell className="font-medium">{t.merchant}</TableCell>
                    <TableCell className="text-right">{formatINR(t.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Category breakdown</h2>
            <p className="text-sm text-muted-foreground">Click a category to see its expenditures.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((c, i) => {
              const color = CAT_COLORS[i % CAT_COLORS.length];
              const share = total ? Math.round((c.value / total) * 100) : 0;
              return (
                <Card
                  key={c.name}
                  className="relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
                  onClick={() => setSelected(c.name)}
                >
                  <span className="absolute top-0 left-0 h-full w-1.5" style={{ backgroundColor: color }} />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardDescription className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                        {c.name}
                      </CardDescription>
                      <span className="inline-flex items-center text-xs text-muted-foreground">
                        {share}% <ChevronRight className="size-4" />
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold tracking-tight">{formatINR(c.value)}</div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Category spending — per-category graph with a filter */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Category spending</CardTitle>
            <CardDescription>
              {trendCat === "all"
                ? "Spend across every category for the period."
                : `${trendCat} spend across the ${PERIOD_LABEL[period].toLowerCase()}.`}
            </CardDescription>
          </div>
          <Select items={trendItems} value={trendCat} onValueChange={(v) => setTrendCat(v ?? "all")}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              {trendItems.map((it) => (
                <SelectItem key={it.value} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <ChartContainer config={cfg} className="h-[300px] w-full">
            <BarChart data={trend} margin={{ left: 16, right: 16, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={trendInterval}
                tick={{ fontSize: 11 }}
              />
              <YAxis hide />
              <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
              <Bar
                dataKey="value"
                radius={6}
                isAnimationActive={false}
                cursor={trendCat === "all" ? "pointer" : undefined}
                onClick={(d: any) => trendCat === "all" && d?.name && setSelected(d.name)}
              >
                {trend.map((t, i) => (
                  <Cell key={i} fill={t.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  title,
  value,
  icon,
  iconColor = "var(--primary)",
}: {
  title: string;
  value: string;
  icon?: React.ReactNode;
  iconColor?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{title}</CardDescription>
        {icon && (
          <div
            className="flex size-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: `color-mix(in oklab, ${iconColor} 16%, transparent)`, color: iconColor }}
          >
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
