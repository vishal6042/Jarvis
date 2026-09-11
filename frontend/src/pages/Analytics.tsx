import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { analyticsByCategory, analyticsIncomeBySource, listRecurring, listTransactions } from "@/api";
import type { CategorySpend, RecurringPayment, Transaction } from "@/types";
import { ChevronLeft, ChevronRight, Layers, TrendingUp, Trophy, Wallet, X } from "lucide-react";
import CardArt from "@/components/CardArt";
import MerchantBreakdownCard from "@/components/MerchantBreakdownCard";
import { AnomaliesCard, BehaviourCard, BudgetVsActualCard, PeriodComparisonCard } from "@/components/AnalyticsDepth";
import TrendsCard from "@/components/TrendsCard";
import RecurringIntelligenceCard from "@/components/RecurringIntelligenceCard";
import SpendByCategoryCard, { categoryColors } from "@/components/SpendByCategoryCard";
import { useThresholds } from "@/lib/store";
import { PERIOD_LABEL, type Period } from "@/lib/sample";
import { categorySeries, categorySpend, periodLabel, periodWindow, previousToDate } from "@/lib/txnseries";
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

export default function Analytics() {
  const [period, setPeriod] = useState<Period>("month");
  const [offset, setOffset] = useState(0); // 0 = current period; higher = further back
  const [selected, setSelected] = useState<string | null>(null);

  // Real spend-by-category from expense-service for the selected window.
  const [remote, setRemote] = useState<CategorySpend[]>([]);
  const [prevRemote, setPrevRemote] = useState<CategorySpend[]>([]);
  // While the period is still running, category changes compare against the same stretch of the previous one.
  const [prevSameRemote, setPrevSameRemote] = useState<CategorySpend[]>([]);
  const [income, setIncome] = useState<CategorySpend[]>([]);
  const { items: budgets } = useThresholds();
  // Recent transactions back the drill-down + per-category trend (all from the DB).
  const [txns, setTxns] = useState<Transaction[]>([]);
  useEffect(() => {
    let alive = true;
    const { from, to } = periodWindow(period, offset);
    analyticsByCategory(from.toISOString(), to.toISOString())
      .then((rows) => alive && setRemote(rows ?? []))
      .catch(() => alive && setRemote([]));
    analyticsIncomeBySource(from.toISOString(), to.toISOString())
      .then((rows) => alive && setIncome(rows ?? []))
      .catch(() => alive && setIncome([]));
    const prev = periodWindow(period, offset + 1);
    analyticsByCategory(prev.from.toISOString(), prev.to.toISOString())
      .then((rows) => alive && setPrevRemote(rows ?? []))
      .catch(() => alive && setPrevRemote([]));
    if (offset === 0) {
      const same = previousToDate(period);
      analyticsByCategory(same.from.toISOString(), same.to.toISOString())
        .then((rows) => alive && setPrevSameRemote(rows ?? []))
        .catch(() => alive && setPrevSameRemote([]));
    }
    return () => {
      alive = false;
    };
  }, [period, offset]);
  useEffect(() => {
    let alive = true;
    listTransactions(0, 500)
      .then((t) => alive && setTxns(t))
      .catch(() => alive && setTxns([]));
    return () => {
      alive = false;
    };
  }, []);

  // Recurring payments are detected over the trailing ~6 months, independent of the period filter.
  const [recurring, setRecurring] = useState<RecurringPayment[]>([]);
  useEffect(() => {
    let alive = true;
    listRecurring()
      .then((r) => alive && setRecurring(r ?? []))
      .catch(() => alive && setRecurring([]));
    return () => {
      alive = false;
    };
  }, []);

  const data = useMemo(
    () => remote.map((r) => ({ name: r.category, value: Math.round(Number(r.total)) })),
    [remote]
  );
  const total = data.reduce((s, c) => s + c.value, 0);
  const hasData = data.length > 0;
  const prevData = useMemo(
    () => prevRemote.map((r) => ({ name: r.category, value: Math.round(Number(r.total)) })),
    [prevRemote]
  );
  const prevSameData = useMemo(
    () => prevSameRemote.map((r) => ({ name: r.category, value: Math.round(Number(r.total)) })),
    [prevSameRemote]
  );

  const incomeData = useMemo(
    () => income.map((r) => ({ name: r.category, value: Math.round(Number(r.total)) })),
    [income]
  );
  const incomeTotal = incomeData.reduce((s, c) => s + c.value, 0);

  const drill = useMemo(
    () => (selected ? categorySpend(txns, selected, period, offset) : []),
    [selected, txns, period, offset]
  );
  const drillTotal = drill.reduce((s, t) => s + t.amount, 0);

  // --- Category spending trends (filterable) ---
  const [trendCat, setTrendCat] = useState<string>("all");
  const trendItems = [
    { value: "all", label: "All categories" },
    ...data.map((c) => ({ value: c.name, label: c.name })),
  ];
  const trend = useMemo(() => {
    // Same colour per category as the Spend by category rings.
    const colors = categoryColors([...data].sort((a, b) => b.value - a.value).map((c) => c.name));
    const colorOf = (name: string) => colors.get(name) ?? "var(--cat-other)";
    if (trendCat === "all") {
      // one bar per category
      return data.map((c) => ({ name: c.name, value: c.value, fill: colorOf(c.name) }));
    }
    // a specific category → its real spend bucketed across the period
    return categorySeries(txns, trendCat, period, offset).map((p) => ({ name: p.label, value: p.value, fill: colorOf(trendCat) }));
  }, [trendCat, data, txns, period, offset]);
  const trendInterval = trendCat === "all" ? 0 : period === "day" ? 2 : period === "month" ? 4 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Where your money goes · {periodLabel(period, offset)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="size-8" aria-label="Previous period" onClick={() => setOffset((o) => o + 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Next period"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <PeriodTabs value={period} onChange={(p) => { setPeriod(p); setOffset(0); }} />
        </div>
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

      {(hasData || prevData.length > 0) && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <PeriodComparisonCard now={data} prev={prevData} period={period} offset={offset} />
            <BudgetVsActualCard budgets={budgets} actual={data} period={period} />
          </div>
          <TrendsCard txns={txns} />
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <BehaviourCard txns={txns} period={period} offset={offset} />
            <AnomaliesCard txns={txns} />
          </div>
        </>
      )}

      {!hasData ? (
        <Card>
          <CardContent className="flex h-[220px] flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium">No spending recorded yet</p>
            <p className="text-sm text-muted-foreground">
              Add a transaction or import a statement, and your category breakdown will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
      <Separator />

      <SpendByCategoryCard
        now={data}
        prev={offset === 0 ? prevSameData : prevData}
        compareLabel={offset === 0 ? previousToDate(period).label : periodLabel(period, offset + 1)}
        period={period}
        offset={offset}
        onSelect={setSelected}
      />

      {selected && (
        <Card className="relative isolate overflow-hidden">
          <CardArt color="var(--primary)" subtle />
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
                {drill.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(t.occurredAt)}</TableCell>
                    <TableCell className="font-medium">{t.merchant ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatINR(t.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <MerchantBreakdownCard txns={txns} period={period} offset={offset} />

      {/* Category spending — per-category graph with a filter */}
      <Card className="relative isolate overflow-hidden">
        <CardArt color="var(--primary)" subtle />
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
        </>
      )}

      {incomeTotal > 0 && (
        <Card className="relative isolate overflow-hidden">
          <CardArt color="#10b981" subtle />
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-500" />
              <CardTitle>Income by source</CardTitle>
            </div>
            <CardDescription>
              Money into your savings this period · {formatINR(incomeTotal)} total
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {incomeData.map((c) => {
              const share = incomeTotal ? Math.round((c.value / incomeTotal) * 100) : 0;
              return (
                <div key={c.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatINR(c.value)} · {share}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <RecurringIntelligenceCard recurring={recurring} txns={txns} />
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
    <Card className="relative isolate overflow-hidden">
      <CardArt color={iconColor} subtle />
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
