import { useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { CalendarClock, PieChart as PieIcon, Repeat, TrendingUp } from "lucide-react";
import CardArt from "@/components/CardArt";
import { KIND_META, type Investment } from "@/lib/sample";
import { allocation, holdingReturn, maturityLadder, portfolioReturn } from "@/lib/portfolio";
import { formatINR, formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const pctText = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
const humanYears = (y: number) => (y < 1 ? `${Math.max(1, Math.round(y * 12))} mo` : `${y.toFixed(1)} yr`);

/**
 * What the portfolio is made of, what it has actually returned, what it commits every month and
 * when each holding matures. All of it derived from the holdings themselves.
 */
export default function PortfolioAnalytics({ investments }: { investments: Investment[] }) {
  const slices = useMemo(() => allocation(investments), [investments]);
  const totals = useMemo(() => portfolioReturn(investments), [investments]);
  const returns = useMemo(
    () => investments.map((i) => holdingReturn(i)).sort((a, b) => (b.annualised ?? -99) - (a.annualised ?? -99)),
    [investments],
  );
  const ladder = useMemo(() => maturityLadder(investments), [investments]);

  if (investments.length === 0) return null;

  const chartConfig: ChartConfig = Object.fromEntries(slices.map((s) => [s.cls, { label: s.label, color: s.color }]));
  const concentration = slices[0];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        {/* Allocation */}
        <Card className="relative isolate overflow-hidden">
          <CardArt color="#6366f1" subtle />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieIcon className="size-4 text-primary" /> Allocation
            </CardTitle>
            <CardDescription>
              {concentration
                ? `${Math.round(concentration.pct)}% of your portfolio sits in ${concentration.label.toLowerCase()}.`
                : "How your money is spread."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,180px)_1fr]">
              <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[180px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
                  <Pie data={slices} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="88%" strokeWidth={2} isAnimationActive={false}>
                    {slices.map((s) => (
                      <Cell key={s.cls} fill={s.color} stroke="var(--background)" />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="space-y-2.5">
                {slices.map((s) => (
                  <div key={s.cls} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="truncate font-medium">{s.label}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatINR(s.value)} · {Math.round(s.pct)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Returns */}
        <Card className="relative isolate overflow-hidden">
          <CardArt color="#10b981" subtle />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" /> Returns
            </CardTitle>
            <CardDescription>
              Annualised return is the rate your actual deposits earned, allowing for when each one went in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Invested" value={formatINR(totals.invested)} />
              <Metric label="Current value" value={formatINR(totals.current)} />
              <Metric
                label="Gain"
                value={formatINR(Math.round(totals.gain))}
                sub={pctText(totals.gainPct)}
                accent={totals.gain >= 0 ? "var(--ok)" : "var(--danger)"}
              />
              <Metric
                label="Annualised"
                value={totals.annualised != null ? `${totals.annualised.toFixed(1)}%` : "—"}
                sub={totals.annualised != null ? "across all holdings" : "needs dates"}
                accent={totals.annualised != null && totals.annualised >= 0 ? "var(--ok)" : undefined}
              />
            </div>
            <div className="space-y-1.5">
              {returns.map((r) => {
                // No revaluation yet (an endowment pays only at maturity): a return of 0% would
                // read as a bad investment rather than as an unknown.
                const unvalued = r.inv.current === r.inv.principal;
                const rate = r.annualised == null || Math.abs(r.annualised) < 0.05 ? 0 : r.annualised;
                return (
                  <div key={r.inv.id} className="flex items-center gap-2.5 rounded-lg border p-2 text-sm">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: KIND_META[r.inv.kind].color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.inv.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatINR(r.inv.principal)} in
                        {r.years != null ? ` over ${humanYears(r.years)}` : ""}
                      </div>
                    </div>
                    {unvalued ? (
                      <span className="shrink-0 text-xs text-muted-foreground">not valued yet</span>
                    ) : (
                      <>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pctText(r.gainPct)}</span>
                        <span
                          className="w-16 shrink-0 text-right font-semibold tabular-nums"
                          style={{ color: rate >= 0 ? "var(--ok)" : "var(--danger)" }}
                        >
                          {r.annualised != null ? `${rate.toFixed(1)}%` : "—"}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        {/* Monthly commitment */}
        <Card className="relative isolate overflow-hidden">
          <CardArt color="#8b5cf6" subtle />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Repeat className="size-4 text-primary" /> Monthly commitment
            </CardTitle>
            <CardDescription>
            What leaves your account for investments every month. Yearly premiums are shown spread across the year.
          </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-bold tracking-tight tabular-nums">{formatINR(totals.monthlyCommitment)}</p>
            {investments
              .filter((i) => (i.sip ?? 0) > 0)
              .map((i) => {
                const yearly = i.contributionFrequency === "yearly";
                return (
                  <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: KIND_META[i.kind].color }} />
                      <span className="truncate text-muted-foreground">{i.name}</span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      {formatINR(Math.round((i.sip ?? 0) / (yearly ? 12 : 1)))}
                      {yearly && (
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          ({formatINR(i.sip ?? 0)}/yr)
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            {totals.monthlyCommitment === 0 && (
              <p className="text-sm text-muted-foreground">No recurring instalments recorded.</p>
            )}
          </CardContent>
        </Card>

        {/* Maturity ladder */}
        <Card className="relative isolate overflow-hidden">
          <CardArt color="#f59e0b" subtle />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-primary" /> Maturity ladder
            </CardTitle>
            <CardDescription>When each holding frees up, soonest first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {ladder.length === 0 ? (
              <p className="text-sm text-muted-foreground">No maturity dates recorded yet. Add them to see when money frees up.</p>
            ) : (
              ladder.map((m) => {
                const years = Math.floor(Math.max(0, m.monthsAway) / 12);
                const months = Math.max(0, m.monthsAway) % 12;
                const away = m.monthsAway <= 0 ? "matured" : years > 0 ? `${years} yr${months ? ` ${months} mo` : ""}` : `${months} mo`;
                return (
                  <div key={m.inv.id} className="flex items-center gap-2.5 rounded-lg border p-2 text-sm">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: KIND_META[m.inv.kind].color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{m.inv.name}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(m.on)}</div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{away}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatINR(m.inv.current)}</span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border bg-card/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
