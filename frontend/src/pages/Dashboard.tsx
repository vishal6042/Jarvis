import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Banknote, PiggyBank, Wallet } from "lucide-react";
import { formatINR } from "@/lib/format";
import { hashId, LOAN_META, pointLabels, valueSeries, type Period } from "@/lib/sample";
import { useFamily } from "@/lib/store";
import { useFinanceSummary } from "@/lib/finance";
import ClockWidget from "@/components/ClockWidget";
import PeriodTabs from "@/components/PeriodTabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function StatCard({
  title,
  value,
  delta,
  positive,
  trendDown,
  icon,
  iconColor = "var(--primary)",
}: {
  title: string;
  value: string;
  delta?: string;
  positive?: boolean;
  /** Arrow direction, independent of the good/bad color (e.g. loans paid down = good + down). */
  trendDown?: boolean;
  icon: React.ReactNode;
  iconColor?: string;
}) {
  const down = trendDown ?? !positive;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{title}</CardDescription>
        <div
          className="flex size-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `color-mix(in oklab, ${iconColor} 16%, transparent)`, color: iconColor }}
        >
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {delta && (
          <p
            className={`mt-1 flex items-center gap-1 text-xs ${
              positive ? "text-emerald-500" : "text-rose-500"
            }`}
          >
            {down ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
            {delta}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type ChartEntity = { id: string | number; label: string };

/** Area chart over a set of entities (accounts/cards/loans), with an All/individual switch. */
function EntityAreaChart({
  title,
  description,
  allLabel,
  entities,
  base,
  seedBase,
  emptyHint,
  combineOnAll = false,
}: {
  title: string;
  description: string;
  allLabel: string;
  entities: ChartEntity[];
  base: number;
  seedBase: number;
  emptyHint: string;
  combineOnAll?: boolean;
}) {
  const [selected, setSelected] = useState("all");
  const [period, setPeriod] = useState<Period>("month");

  const combined = selected === "all" && combineOnAll;
  const active = selected === "all" ? entities : entities.filter((e) => String(e.id) === selected);
  // Entities actually drawn as areas: one combined area, or one per active entity.
  const drawn: ChartEntity[] = combined ? [{ id: "combined", label: allLabel }] : active;
  // Evenly-spaced X tick interval per period (recharts skips N between rendered ticks).
  const tickInterval = period === "day" ? 2 : period === "month" ? 4 : 0;

  const { data, config } = useMemo(() => {
    const labels = pointLabels(period);
    const series: Record<string, number[]> = {};
    const cfg: ChartConfig = {};
    if (combined) {
      const sum = labels.map(() => 0);
      entities.forEach((e, i) => {
        valueSeries(period, seedBase + hashId(String(e.id)) + i * 17, base).forEach(
          (v, idx) => (sum[idx] += v)
        );
      });
      series["ecombined"] = sum;
      cfg["ecombined"] = { label: allLabel, color: "var(--chart-1)" };
    } else {
      active.forEach((e, i) => {
        const key = `e${e.id}`;
        series[key] = valueSeries(period, seedBase + hashId(String(e.id)) + i * 17, base);
        cfg[key] = { label: e.label, color: `var(--chart-${(i % 5) + 1})` };
      });
    }
    const rows = labels.map((label, idx) => {
      const row: Record<string, number | string> = { label };
      drawn.forEach((e) => (row[`e${e.id}`] = series[`e${e.id}`][idx] ?? 0));
      return row;
    });
    return { data: rows, config: cfg };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, selected, entities, base, seedBase, combined]);

  const items = [
    { value: "all", label: allLabel },
    ...entities.map((e) => ({ value: String(e.id), label: e.label })),
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select items={items} value={selected} onValueChange={(v) => setSelected(v ?? "all")}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={allLabel} />
            </SelectTrigger>
            <SelectContent>
              {items.map((it) => (
                <SelectItem key={it.value} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PeriodTabs value={period} onChange={setPeriod} />
        </div>
      </CardHeader>
      <CardContent>
        {entities.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            {emptyHint}
          </div>
        ) : (
          <ChartContainer config={config} className="h-[300px] w-full">
            <AreaChart data={data} margin={{ left: 16, right: 16, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={tickInterval}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              {drawn.map((e) => {
                const key = `e${e.id}`;
                return (
                  <Area
                    key={key}
                    dataKey={key}
                    name={e.label}
                    type="natural"
                    stroke={`var(--color-${key})`}
                    fill={`var(--color-${key})`}
                    fillOpacity={0.18}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                );
              })}
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}


export default function Dashboard() {
  const { seed, activeId, activeMember } = useFamily();
  const f = useFinanceSummary();

  const savingsEntities = f.savingsAccounts.map((a) => ({
    id: a.id,
    label: `${a.displayName} ••${a.last4}`,
  }));
  const cardEntities = f.accounts
    .filter((a) => a.type === "CREDIT_CARD" || a.type === "DEBIT_CARD")
    .map((a) => ({ id: a.id, label: `${a.displayName} ••${a.last4}` }));
  const loanEntities = f.loans.map((l) => ({
    id: l.id,
    label: `${LOAN_META[l.kind].label} · ${l.lender}`,
  }));

  // Deterministic month-over-month deltas (sample, varies per member).
  const nwDelta = (1.8 + (seed % 35) / 10).toFixed(1); // % up
  const loanDelta = (0.9 + (seed % 22) / 10).toFixed(1); // % paid down
  const srDelta = 1 + (seed % 4); // percentage points up

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          {activeId === "all"
            ? "Combined finances across your family."
            : activeMember.relation === "Self"
              ? "Your money at a glance."
              : `Monitoring ${activeMember.name}'s finances.`}
        </p>
      </div>

      <ClockWidget />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Net worth"
          value={formatINR(f.savings)}
          delta={`${nwDelta}% vs last month`}
          positive
          icon={<Wallet className="size-4" />}
          iconColor="#8b5cf6"
        />
        <StatCard
          title="Earning · Month"
          value={formatINR(f.earning)}
          delta="vs last period"
          positive
          icon={<ArrowUpRight className="size-4" />}
          iconColor="#10b981"
        />
        <StatCard
          title="Spend · Month"
          value={formatINR(f.spend)}
          delta="vs last period"
          positive={false}
          icon={<ArrowDownRight className="size-4" />}
          iconColor="#f43f5e"
        />
        <StatCard
          title="Outstanding loans"
          value={formatINR(f.outstanding)}
          delta={`${loanDelta}% vs last month`}
          positive
          trendDown
          icon={<Banknote className="size-4" />}
          iconColor="#f59e0b"
        />
        <StatCard
          title="Savings rate"
          value={`${f.savingsRate}%`}
          delta={`${srDelta} pts vs last month`}
          positive
          icon={<PiggyBank className="size-4" />}
          iconColor="#3b82f6"
        />
      </div>

      <EntityAreaChart
        title="Savings accounts"
        description="Inflow across your savings accounts."
        allLabel="All savings"
        entities={savingsEntities}
        base={16000}
        seedBase={seed + 100}
        emptyHint="Add a savings account to see its trend."
        combineOnAll
      />

      <EntityAreaChart
        title="Credit & debit cards"
        description="Spend across your cards."
        allLabel="All cards"
        entities={cardEntities}
        base={1800}
        seedBase={seed + 200}
        emptyHint="Add a card to see its spend trend."
      />

      <EntityAreaChart
        title="Loans"
        description="Outstanding balance trend across your loans."
        allLabel="All loans"
        entities={loanEntities}
        base={50000}
        seedBase={seed + 300}
        emptyHint="No loans yet — add one on the Loans page."
      />
    </div>
  );
}
