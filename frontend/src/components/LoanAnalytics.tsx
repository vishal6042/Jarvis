import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CalendarCheck, Percent, Sigma, TrendingDown } from "lucide-react";
import CardArt from "@/components/CardArt";
import { LOAN_META, type Loan } from "@/lib/sample";
import { amortise, humanMonths, simulatePrepayment } from "@/lib/amortisation";
import { formatINR } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  principal: { label: "Principal", color: "#10b981" },
  interest: { label: "Interest", color: "#f43f5e" },
} satisfies ChartConfig;

const EXTRA_PRESETS = [0, 5000, 10000, 25000];

const monthYear = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const compact = (n: number) =>
  n >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
const digits = (s: string) => Math.max(0, Number(s.replace(/[^\d]/g, "")) || 0);

/**
 * Amortisation view for one loan: where you stand, how much interest is still ahead, interest vs
 * principal by year, and a prepayment simulator (extra per month or a lump sum today).
 */
export default function LoanAnalytics({ loan }: { loan: Loan }) {
  const color = LOAN_META[loan.kind].color;
  const [extra, setExtra] = useState(0);
  const [lump, setLump] = useState(0);

  const base = useMemo(() => amortise(loan.outstanding, loan.rate, loan.emi), [loan.outstanding, loan.rate, loan.emi]);
  const sim = useMemo(() => simulatePrepayment(loan, extra, lump), [loan, extra, lump]);

  if (!base) {
    return (
      <Card className="relative isolate overflow-hidden">
        <CardArt color={color} subtle />
        <CardHeader>
          <CardTitle>{loan.lender} · payoff plan</CardTitle>
          <CardDescription>
            The EMI ({formatINR(loan.emi)}) does not cover the monthly interest on {formatINR(loan.outstanding)} at {loan.rate}%. Check the loan details.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const shown = sim?.withExtra ?? base;
  const repaidPct = loan.sanctioned > 0 ? Math.round(((loan.sanctioned - loan.outstanding) / loan.sanctioned) * 100) : 0;
  const interestShare = shown.totalPaid > 0 ? Math.round((shown.totalInterest / shown.totalPaid) * 100) : 0;
  const data = shown.byYear.map((y) => ({ year: y.year, principal: Math.round(y.principal), interest: Math.round(y.interest) }));
  const active = extra > 0 || lump > 0;

  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color={color} subtle />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
          {loan.lender} · payoff plan
        </CardTitle>
        <CardDescription>
          {repaidPct}% of the sanctioned {formatINR(loan.sanctioned)} repaid · {formatINR(loan.outstanding)} outstanding at {loan.rate}% · EMI {formatINR(loan.emi)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={CalendarCheck} color="#0ea5e9" label="Debt-free" value={monthYear(shown.debtFreeOn)} sub={`${humanMonths(shown.months)} to go`} />
          <Metric icon={Percent} color="#f43f5e" label="Interest still to pay" value={formatINR(Math.round(shown.totalInterest))} sub={`${interestShare}% of what is left to pay`} />
          <Metric icon={Sigma} color="#8b5cf6" label="Total left to pay" value={formatINR(Math.round(shown.totalPaid))} sub={`${shown.months} payments`} />
          <Metric
            icon={TrendingDown}
            color="#10b981"
            label="Principal this year"
            value={formatINR(Math.round(data[0]?.principal ?? 0))}
            sub={`vs ${formatINR(Math.round(data[0]?.interest ?? 0))} interest`}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Interest vs principal by year{active ? " · with prepayment" : ""}</p>
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11 }} tickFormatter={compact} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="principal" stackId="a" fill="var(--color-principal)" radius={[0, 0, 4, 4]} isAnimationActive={false} />
              <Bar dataKey="interest" stackId="a" fill="var(--color-interest)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </div>

        <div className="rounded-xl border bg-card/60 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="grid flex-1 gap-1.5">
              <Label>Extra per month (₹)</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {EXTRA_PRESETS.map((p) => (
                  <Button key={p} type="button" size="sm" variant={extra === p ? "default" : "outline"} onClick={() => setExtra(p)}>
                    {p === 0 ? "None" : `+${compact(p)}`}
                  </Button>
                ))}
                <Input className="w-28" inputMode="numeric" value={extra || ""} placeholder="Custom" onChange={(e) => setExtra(digits(e.target.value))} />
              </div>
            </div>
            <div className="grid gap-1.5 md:w-56">
              <Label>One-time prepayment today (₹)</Label>
              <Input inputMode="numeric" value={lump || ""} placeholder="e.g. 200000" onChange={(e) => setLump(digits(e.target.value))} />
            </div>
          </div>
          <p className="mt-3 text-sm">
            {!active ? (
              <span className="text-muted-foreground">
                Try paying a little extra. Every rupee above the EMI goes straight to principal and shortens the loan.
              </span>
            ) : sim && sim.monthsSaved > 0 ? (
              <>
                <span className="font-semibold text-[color:var(--ok)]">Debt-free {humanMonths(sim.monthsSaved)} earlier</span>{" "}
                <span className="text-muted-foreground">
                  ({monthYear(sim.withExtra.debtFreeOn)} instead of {monthYear(sim.base.debtFreeOn)}) and{" "}
                </span>
                <span className="font-semibold">{formatINR(Math.round(sim.interestSaved))} less interest</span>
                <span className="text-muted-foreground"> over the life of the loan.</span>
              </>
            ) : (
              <span className="text-muted-foreground">That prepayment does not change the payoff date meaningfully.</span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, color, label, value, sub }: { icon: typeof CalendarCheck; color: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border bg-card/60 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex size-6 items-center justify-center rounded-md" style={{ backgroundColor: `${color}22`, color }}>
          <Icon className="size-3.5" />
        </span>
        {label}
      </div>
      <p className="mt-1.5 text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
