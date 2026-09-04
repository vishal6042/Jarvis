import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Banknote, ChevronLeft, ChevronRight, Lightbulb, Loader2, PiggyBank, Sparkles, TrendingUp, Upload, Wallet } from "lucide-react";
import CardArt from "@/components/CardArt";
import { cardSummaries, financeScore, listTransactions, netWorthTrend, type CardSummary } from "@/api";
import { networkColor } from "@/components/CardArt";
import { CreditCard } from "lucide-react";
import type { FinanceScoreResult, NetWorthPoint, Transaction } from "@/types";
import { formatINR } from "@/lib/format";
import { type Period } from "@/lib/sample";
import { cashflowSeries, periodLabel } from "@/lib/txnseries";
import { useFamily } from "@/lib/store";
import { useFinanceSummary } from "@/lib/finance";
import ClockWidget from "@/components/ClockWidget";
import PulseHeader from "@/components/PulseHeader";
import InsightsCard from "@/components/InsightsCard";
import SpendBreakdownCard from "@/components/SpendBreakdownCard";
import TimelineCard from "@/components/TimelineCard";
import { useReminders, useThresholds } from "@/lib/store";
import { usePref, useReserve } from "@/lib/prefs";
import { buildForecast } from "@/lib/forecast";
import { buildInsights } from "@/lib/insights";
import { currentMonthBreakdown } from "@/lib/breakdown";
import PeriodTabs from "@/components/PeriodTabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

function StatCard({
  title,
  value,
  icon,
  iconColor = "var(--primary)",
  footer,
  art,
  onClick,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconColor?: string;
  footer?: React.ReactNode;
  art?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`relative isolate overflow-hidden ${onClick ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 hover:ring-1 hover:ring-primary/40" : ""}`}
      onClick={onClick}
    >
      <CardArt color={iconColor} icon={art} subtle={!art} />
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
        {footer}
      </CardContent>
    </Card>
  );
}

const cashflowConfig = {
  earning: { label: "Earning", color: "var(--chart-1)" },
  spend: { label: "Spend", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Real earning vs spend over the selected period, from recorded transactions. */
function CashflowChart({ txns, loading }: { txns: Transaction[]; loading: boolean }) {
  // (chart cards get a subtle tint only — no wave behind the plot)
  const [period, setPeriod] = useState<Period>("month");
  const [offset, setOffset] = useState(0); // 0 = current period; higher = further back
  const data = useMemo(() => cashflowSeries(txns, period, offset), [txns, period, offset]);
  const hasData = data.some((d) => d.earning > 0 || d.spend > 0);
  const surplus = data.reduce((acc, d) => acc + d.earning - d.spend, 0);
  const tickInterval = period === "day" ? 2 : period === "month" ? 4 : 0;

  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="var(--chart-1)" subtle />
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Cash flow</CardTitle>
          <CardDescription>
            Earning vs spend · {periodLabel(period, offset)}
            {hasData && (
              <span className="ml-2 font-semibold" style={{ color: surplus >= 0 ? "var(--ok)" : "var(--danger)" }}>
                {surplus >= 0 ? "+" : "−"}{formatINR(Math.abs(surplus))} {surplus >= 0 ? "surplus" : "deficit"}
              </span>
            )}
          </CardDescription>
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
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : !hasData ? (
          <div className="flex h-[300px] flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium">No transactions yet</p>
            <p className="text-sm text-muted-foreground">
              Add a transaction or import a statement to see your cash flow.
            </p>
          </div>
        ) : (
          <ChartContainer config={cashflowConfig} className="h-[300px] w-full">
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
              <YAxis hide domain={[0, "auto"]} allowDataOverflow />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Area
                dataKey="earning"
                name="Earning"
                type="monotone"
                stroke="var(--color-earning)"
                fill="var(--color-earning)"
                fillOpacity={0.18}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Area
                dataKey="spend"
                name="Spend"
                type="monotone"
                stroke="var(--color-spend)"
                fill="var(--color-spend)"
                fillOpacity={0.18}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** Ring colour by score band — matches the rating thresholds in the scoring prompt. */
function scoreColor(score: number): string {
  if (score >= 80) return "#10b981"; // Excellent
  if (score >= 65) return "#84cc16"; // Good
  if (score >= 45) return "#f59e0b"; // Fair
  return "#f43f5e"; // Needs work
}

/** Circular gauge: a coloured arc filled to score/100 over a faint track, score in the middle. */
function ScoreGauge({ score }: { score: number }) {
  const size = 132;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 900ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums" style={{ color }}>
          {score}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

const SCORE_CACHE_KEY = "jarvis_finance_score";
const SCORE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — a fresh score isn't needed every visit

type ScoreMetrics = {
  monthlyIncome: number;
  monthlySpend: number;
  savingsRate: number;
  cashSavings: number;
  investments: number;
  outstandingLoans: number;
  monthlyEmi: number;
};

/** Stable fingerprint of the inputs — a cached score is reused only while the numbers hold. */
function metricsFingerprint(m: ScoreMetrics): string {
  return [
    Math.round(m.monthlyIncome),
    Math.round(m.monthlySpend),
    m.savingsRate,
    Math.round(m.cashSavings),
    Math.round(m.investments),
    Math.round(m.outstandingLoans),
    Math.round(m.monthlyEmi),
  ].join("|");
}

/** Every credit card's cycle: unbilled spend, the bill still due and when, last payment, utilisation. */
function CardsSection({ cards }: { cards: CardSummary[] }) {
  if (cards.length === 0) return null;
  const fmtDay = (iso: string | null) =>
    iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—";
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Your cards</h2>
        <span className="text-xs text-muted-foreground">Unbilled since the last statement · bill due from settlement pairing</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const tint = networkColor(c.network, "#8b5cf6");
          const util = c.utilisationPct ?? 0;
          const dueSoon = c.dueOn ? (new Date(`${c.dueOn}T00:00:00`).getTime() - Date.now()) / 86_400_000 <= 5 : false;
          return (
            <Card key={c.accountId} className="relative isolate overflow-hidden">
              <CardArt color={tint} icon={CreditCard} network={c.network} wave={false} />
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between">
                  <span className="truncate">{c.displayName}</span>
                  {c.network && <span className="text-[10px] font-semibold tracking-wider uppercase">{c.network}</span>}
                </CardDescription>
                <div className="text-2xl font-bold tracking-tight">{formatINR(c.unbilled)}</div>
                <p className="text-xs text-muted-foreground">unbilled{c.nextStatementOn ? ` · statement ${fmtDay(c.nextStatementOn)}` : ""}</p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Bill due</span>
                  {c.billDue > 0 ? (
                    <span className={`font-semibold ${dueSoon ? "text-rose-500" : ""}`}>
                      {formatINR(c.billDue)}{c.dueOn ? ` · ${fmtDay(c.dueOn)}` : ""}
                    </span>
                  ) : (
                    <span className="font-medium text-emerald-500">Nothing pending</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last paid</span>
                  <span className="font-medium">
                    {c.lastPaidAmount != null ? `${formatINR(c.lastPaidAmount)} · ${fmtDay(c.lastPaidOn)}` : "—"}
                  </span>
                </div>
                {c.creditLimit != null && c.creditLimit > 0 && (
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>Utilisation</span>
                      <span>{util}% of {formatINR(c.creditLimit, { compact: true })}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, util)}%`, backgroundColor: util > 60 ? "#f43f5e" : tint }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** The headline card: an LLM-scored financial-health gauge with a motivating line + tips. */
function FinanceScoreCard({
  metrics,
  onResult,
  onLoading,
}: {
  metrics: ScoreMetrics;
  onResult?: (r: FinanceScoreResult) => void;
  onLoading?: (b: boolean) => void;
}) {
  const [result, setResult] = useState<FinanceScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fp = useMemo(() => metricsFingerprint(metrics), [metrics]);
  const hasData = metrics.monthlyIncome > 0 || metrics.monthlySpend > 0 || metrics.cashSavings > 0;

  useEffect(() => {
    if (!hasData) return;

    // Reuse a recent score for the same inputs — the local model call is slow.
    try {
      const raw = localStorage.getItem(SCORE_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { fp: string; at: number; result: FinanceScoreResult };
        if (cached.fp === fp && Date.now() - cached.at < SCORE_TTL_MS) {
          setResult(cached.result);
          onResult?.(cached.result);
          return;
        }
      }
    } catch {
      /* ignore malformed cache */
    }

    let alive = true;
    setError(false);
    // Debounce so we don't score against half-loaded numbers as the dashboard settles.
    const timer = setTimeout(() => {
      setLoading(true);
      onLoading?.(true);
      financeScore(metrics)
        .then((r) => {
          if (!alive) return;
          setResult(r);
          onResult?.(r);
          try {
            localStorage.setItem(SCORE_CACHE_KEY, JSON.stringify({ fp, at: Date.now(), result: r }));
          } catch {
            /* ignore */
          }
        })
        .catch(() => alive && setError(true))
        .finally(() => {
          if (alive) {
            setLoading(false);
            onLoading?.(false);
          }
        });
    }, 700);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [fp, hasData, metrics]);

  if (!hasData) return null; // nothing to score yet — the import empty-state covers this

  const color = result ? scoreColor(result.score) : "var(--primary)";

  return (
    <Card className="relative isolate overflow-hidden border-0 shadow-sm">
      <CardArt color={color} icon={Sparkles} wave={false} />
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4" style={{ color }} />
          <CardTitle>Finance score</CardTitle>
        </div>
        <CardDescription>Your financial health, assessed by Jarvis</CardDescription>
      </CardHeader>
      <CardContent>
        {loading || (!result && !error) ? (
          <div className="flex items-center gap-4 py-2">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <div>
              <p className="font-medium">Analyzing your finances…</p>
              <p className="text-sm text-muted-foreground">Scoring savings, debt, buffer and investing.</p>
            </div>
          </div>
        ) : error ? (
          <p className="py-2 text-sm text-muted-foreground">
            Couldn't compute your score right now. Make sure the AI service is running and try again later.
          </p>
        ) : result ? (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <ScoreGauge score={result.score} />
              <div className="sm:hidden">
                <div className="text-lg font-semibold" style={{ color }}>
                  {result.rating}
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="hidden text-lg font-semibold sm:block" style={{ color }}>
                {result.rating}
              </div>
              <p className="text-base font-medium leading-snug">{result.headline}</p>
              {result.tips.length > 0 && (
                <ul className="space-y-1.5">
                  {result.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Lightbulb className="mt-0.5 size-4 shrink-0" style={{ color }} />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

const netWorthConfig = {
  netWorth: { label: "Net worth", color: "#8b5cf6" },
} satisfies ChartConfig;

/** Net worth (savings cash) at each month-end; optionally folds in the current investment value. */
function NetWorthTrendCard({ addInvestments }: { addInvestments: number }) {
  const [points, setPoints] = useState<NetWorthPoint[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    netWorthTrend(12)
      .then((p) => alive && setPoints(p))
      .catch(() => alive && setPoints([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const data = useMemo(
    () =>
      points.map((p) => ({
        label: new Date(`${p.month}-01T00:00:00`).toLocaleString(undefined, { month: "short" }),
        netWorth: Math.round(Number(p.netWorth)) + addInvestments,
      })),
    [points, addInvestments]
  );
  const hasData = data.some((d) => d.netWorth !== 0);

  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="#8b5cf6" subtle />
      <CardHeader>
        <CardTitle>Net worth trend</CardTitle>
        <CardDescription>
          Savings cash at each month-end{addInvestments > 0 ? " · incl. investments" : ""} · last 12 months
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : !hasData ? (
          <div className="flex h-[260px] flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium">No balance history yet</p>
            <p className="text-sm text-muted-foreground">Import a savings statement to build your net-worth trend.</p>
          </div>
        ) : (
          <ChartContainer config={netWorthConfig} className="h-[260px] w-full">
            <AreaChart data={data} margin={{ left: 16, right: 16, top: 8 }}>
              <defs>
                <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-netWorth)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-netWorth)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
              <YAxis hide domain={["auto", "auto"]} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Area
                dataKey="netWorth"
                name="Net worth"
                type="monotone"
                stroke="var(--color-netWorth)"
                fill="url(#nw-fill)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { activeId, activeMember } = useFamily();
  const f = useFinanceSummary();
  const navigate = useNavigate();

  // Net worth is hard cash from savings; optionally fold in the investment portfolio.
  const [includeInv, setIncludeInv] = usePref<boolean>("networth.includeInvestments", false);
  const netWorth = f.savings + (includeInv ? f.investments : 0);
  const now = new Date();
  const thisMonth = now.toLocaleString(undefined, { month: "short" });
  // Income lands on the last day of the month, so the Earning card shows last month's total.
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleString(undefined, {
    month: "short",
  });

  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    listTransactions(0, 500)
      .then((t) => alive && setTxns(t))
      .catch(() => alive && setTxns([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // ---- intelligence layer: cards, reminders, budgets, reserve → forecast, insights, breakdown ----
  const [cards, setCards] = useState<CardSummary[]>([]);
  useEffect(() => {
    cardSummaries().then(setCards).catch(() => setCards([]));
  }, []);
  const { items: reminders } = useReminders();
  const { items: thresholds } = useThresholds();
  const [reserve] = useReserve();
  const [score, setScore] = useState<FinanceScoreResult | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  const forecast = useMemo(
    () => buildForecast({ balance: f.savings, txns, reminders, cards, reserve }),
    [f.savings, txns, reminders, cards, reserve],
  );
  const breakdown = useMemo(() => currentMonthBreakdown(txns), [txns]);
  const reviewCount = useMemo(
    () => txns.filter((t) => !t.transfer && !t.settlement && (!t.category || t.category === "Uncategorized" || t.accountId == null)).length,
    [txns],
  );
  const insights = useMemo(
    () => buildInsights({ cards, reminders, txns, thresholds, breakdown, forecast, reviewCount, savingsRate: f.savingsRate }),
    [cards, reminders, txns, thresholds, breakdown, forecast, reviewCount, f.savingsRate],
  );
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const subtitle =
    activeId === "all"
      ? "Combined finances across your family."
      : activeMember.relation === "Self"
        ? "Your money at a glance."
        : `Monitoring ${activeMember.name}'s finances.`;
  // Memoised: the score card keys its effect on this object, and it reports back via setState,
  // so a fresh object every render would re-run the effect and loop.
  const metrics = useMemo(
    () => ({
      monthlyIncome: f.earning, // last completed month's income
      monthlySpend: f.lastMonthSpend, // pair with income — a full month, not this month's partial
      savingsRate: f.savingsRate,
      cashSavings: f.savings,
      investments: f.investments,
      outstandingLoans: f.outstanding,
      monthlyEmi: f.emiTotal,
    }),
    [f.earning, f.lastMonthSpend, f.savingsRate, f.savings, f.investments, f.outstanding, f.emiTotal],
  );

  return (
    <div className="space-y-6">
      <PulseHeader
        subtitle={subtitle}
        netWorth={netWorth}
        forecast={forecast}
        score={score}
        scoreLoading={scoreLoading}
        actionCount={insights.filter((i) => i.severity === "red" || i.severity === "amber").length}
      />

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <FinanceScoreCard metrics={metrics} onResult={setScore} onLoading={setScoreLoading} />
        <InsightsCard insights={insights} />
      </div>

      <ClockWidget />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Net worth"
          value={formatINR(netWorth)}
          icon={<Wallet className="size-4" />}
          iconColor="#8b5cf6"
          art={Wallet}
          onClick={() => navigate("/accounts")}
          footer={
            <label className="mt-2 flex cursor-pointer items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="text-xs text-muted-foreground">
                Include investments{f.investments > 0 ? ` (${formatINR(f.investments)})` : ""}
              </span>
              <Switch checked={includeInv} onCheckedChange={setIncludeInv} size="sm" />
            </label>
          }
        />
        <StatCard title={`Earning · ${lastMonth}`} value={formatINR(f.earning)} icon={<ArrowUpRight className="size-4" />} iconColor="#10b981" art={TrendingUp} onClick={() => navigate("/analytics")} />
        <StatCard title={`Spend · ${thisMonth}`} value={formatINR(f.spend)} icon={<ArrowDownRight className="size-4" />} iconColor="#f43f5e" art={ArrowDownRight} onClick={() => navigate(`/transactions?month=${monthKey}&type=DEBIT`)} />
        <StatCard title="Outstanding loans" value={formatINR(f.outstanding)} icon={<Banknote className="size-4" />} iconColor="#f59e0b" art={Banknote} onClick={() => navigate("/loans")} />
        <StatCard title="Savings rate" value={`${f.savingsRate}%`} icon={<PiggyBank className="size-4" />} iconColor="#3b82f6" art={PiggyBank} onClick={() => navigate("/analytics")} />
      </div>

      <CardsSection cards={cards} />

      {!loading && txns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Upload className="size-6" />
            </div>
            <div>
              <p className="font-medium">No transactions yet</p>
              <p className="text-sm text-muted-foreground">
                Import a bank or credit-card statement to populate your dashboard.
              </p>
            </div>
            <Button onClick={() => navigate("/import")} className="gap-2">
              <Upload className="size-4" /> Import statement
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <CashflowChart txns={txns} loading={loading} />
            <SpendBreakdownCard b={breakdown} />
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <TimelineCard f={forecast} />
            <NetWorthTrendCard addInvestments={includeInv ? f.investments : 0} />
          </div>
        </>
      )}
    </div>
  );
}
