import { Sparkles } from "lucide-react";
import CardArt from "@/components/CardArt";
import CountUp from "@/components/CountUp";
import { formatINR } from "@/lib/format";
import type { Forecast } from "@/lib/forecast";
import type { FinanceScoreResult } from "@/types";

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * The "financial pulse": greeting, the three numbers that matter (net worth, safe to spend, score)
 * and one honest status line from the forecast.
 */
export default function PulseHeader({
  subtitle,
  netWorth,
  forecast,
  score,
  scoreLoading,
  actionCount,
}: {
  subtitle: string;
  netWorth: number;
  forecast: Forecast;
  score: FinanceScoreResult | null;
  scoreLoading: boolean;
  actionCount: number;
}) {
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  const status = !forecast.healthy
    ? { color: "var(--danger)", text: `Your balance may dip below the ${formatINR(forecast.reserve, { compact: true })} reserve around ${fmtDay(forecast.minOn)}.` }
    : forecast.salary.amount > 0
      ? { color: "var(--ok)", text: `On track: projected ${formatINR(forecast.projected)} on ${fmtDay(forecast.projectedOn)}, ${formatINR(forecast.projected - forecast.reserve)} above your reserve.` }
      : { color: "var(--info)", text: `Projected ${formatINR(forecast.projected)} on ${fmtDay(forecast.projectedOn)} from known bills; add income history for a fuller forecast.` };

  return (
    <div className="relative isolate overflow-hidden rounded-2xl border p-5 card-sheen md:p-6">
      <CardArt color="var(--primary)" icon={Sparkles} wave={false} />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {actionCount > 0 ? `${actionCount} thing${actionCount === 1 ? "" : "s"} need${actionCount === 1 ? "s" : ""} your attention` : "Everything looks in order"}
          </h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="grid grid-cols-3 gap-6 lg:gap-10">
          <Metric label="Net worth" value={<CountUp value={netWorth} format={(n) => formatINR(n)} />} hint="cash in savings" />
          <Metric
            label="Safe to spend"
            value={<CountUp value={forecast.safeToSpend} format={(n) => formatINR(n)} />}
            hint={`until ${monthEnd.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`}
            accent={forecast.safeToSpend > 0 ? "var(--ok)" : "var(--warn)"}
          />
          <Metric
            label="Score"
            value={score ? <CountUp value={score.score} format={(n) => String(Math.round(n))} /> : scoreLoading ? "…" : "—"}
            hint={score?.rating ?? (scoreLoading ? "scoring" : "not yet scored")}
            accent={score ? (score.score >= 80 ? "var(--ok)" : score.score >= 60 ? "var(--info)" : "var(--warn)") : undefined}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
        <span className="text-muted-foreground">{status.text}</span>
      </div>
    </div>
  );
}

function Metric({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint: string; accent?: string }) {
  return (
    <div>
      <div className="text-2xl font-bold tracking-tight tabular-nums lg:text-3xl" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
