import { Loader2 } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { Forecast, ForecastEvent } from "@/lib/forecast";
import { scoreColor } from "@/lib/useFinanceScore";
import type { FinanceScoreResult } from "@/types";

/*
 * The top of the dashboard, on a dark panel in both themes: what you own, where the cash is heading
 * over the next month, and the one number that sums it up. Everything is read from the forecast
 * the rest of the page uses, so the hero never disagrees with the lists below it.
 */

const CASH = "#8f7bff";
const INVESTED = "#3ec9a0";
const LOAN = "#ff8a65";

const lakh = (n: number) => formatINR(n, { compact: true });
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const dayDiff = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000);

const isMove = (e: ForecastEvent) => e.kind !== "start" && e.kind !== "end" && !e.unknownAmount && e.amount !== 0;

/** The biggest few money movements in the window — the ones worth marking on the chart. */
function keyEvents(f: Forecast, n = 3): ForecastEvent[] {
  return f.events
    .filter(isMove)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, n)
    .sort((a, b) => (a.on < b.on ? -1 : 1));
}

function RunwayChart({ f }: { f: Forecast }) {
  const W = 560;
  const top = 10;
  const bottom = 172;
  const span = Math.max(1, dayDiff(f.today, f.projectedOn));
  const pts = [{ d: 0, v: f.startBalance }, ...f.events.filter(isMove).map((e) => ({ d: dayDiff(f.today, e.on), v: e.balanceAfter }))];
  const values = [...pts.map((p) => p.v), f.reserve];
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const pad = (hi - lo) * 0.08 || hi * 0.1 || 1;
  const max = hi + pad;
  const min = Math.min(lo - pad, f.reserve - pad);
  const x = (d: number) => (Math.max(0, Math.min(span, d)) / span) * W;
  const y = (v: number) => top + ((max - v) / (max - min)) * (bottom - top);

  let line = `M0,${y(pts[0].v).toFixed(1)}`;
  for (const p of pts.slice(1)) line += ` H${x(p.d).toFixed(1)} V${y(p.v).toFixed(1)}`;
  line += ` H${W}`;
  const area = `${line} V${bottom} H0 Z`;
  const marks = keyEvents(f);

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${W} 196`}
        preserveAspectRatio="none"
        className="h-[196px] w-full"
        role="img"
        aria-label={`Projected balance from ${lakh(f.startBalance)} today to ${lakh(f.projected)} on ${fmtDay(f.projectedOn)}, lowest ${lakh(f.minBalance)} on ${fmtDay(f.minOn)}`}
      >
        <defs>
          <linearGradient id="runway-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={CASH} stopOpacity="0.45" />
            <stop offset="1" stopColor={CASH} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#runway-fill)" />
        <path d={line} fill="none" stroke="#a898ff" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={W} y1={y(f.reserve)} y2={y(f.reserve)} stroke={LOAN} strokeWidth={1.5} strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
        {marks.map((e) => (
          <circle key={`${e.on}-${e.label}`} cx={x(dayDiff(f.today, e.on))} cy={y(e.balanceAfter)} r={5} fill={e.amount > 0 ? INVESTED : LOAN} />
        ))}
        <line x1={1} x2={1} y1={top} y2={bottom} stroke="#f4f2fb" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <text x={4} y={192} fill="#b9b3d1" fontSize={12}>
          Today
        </text>
        <text x={W - 4} y={192} fill="#b9b3d1" fontSize={12} textAnchor="end">
          {fmtDay(f.projectedOn)}
        </text>
      </svg>
      {marks.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[#d7d2ea]">
          {marks.map((e) => (
            <span key={`${e.on}-${e.label}`} className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: e.amount > 0 ? INVESTED : LOAN }} />
              {e.label} {e.amount > 0 ? "+" : "−"}
              {lakh(Math.abs(e.amount))} · {fmtDay(e.on)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 23;
  const c = 2 * Math.PI * r;
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" aria-hidden>
      <circle cx={28} cy={28} r={r} fill="none" stroke="#2c2748" strokeWidth={6} />
      <circle
        cx={28}
        cy={28}
        r={r}
        fill="none"
        stroke={scoreColor(score)}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${(c * Math.max(0, Math.min(100, score))) / 100} ${c}`}
        transform="rotate(-90 28 28)"
      />
      <text x={28} y={33} textAnchor="middle" fill="#f4f2fb" fontSize={16} fontWeight={600}>
        {score}
      </text>
    </svg>
  );
}

export default function Hero({
  savings,
  investments,
  loans,
  forecast: f,
  score,
  scoreLoading,
  scoreError,
  onWhy,
}: {
  savings: number;
  investments: number;
  loans: number;
  forecast: Forecast;
  score: FinanceScoreResult | null;
  scoreLoading: boolean;
  scoreError: boolean;
  /** Opens the dialog with every tip behind the score. */
  onWhy: () => void;
}) {
  const netWorth = savings + investments;
  const whole = Math.max(1, savings + investments + loans);
  const parts = [
    { label: "Cash in savings", value: savings, color: CASH },
    { label: "Investments", value: investments, color: INVESTED },
    ...(loans > 0 ? [{ label: "Loans owed", value: -loans, color: LOAN }] : []),
  ];

  // Before salary lands, "what still goes out first" is the number that matters; once it is in,
  // the forecast's safe-to-spend takes over.
  const salaryEvent = f.events.find((e) => e.kind === "income");
  const outs = f.events.filter((e) => isMove(e) && e.amount < 0);
  const beforeSalary = salaryEvent ? outs.filter((e) => e.on < salaryEvent.on) : [];
  const nextOut = outs[0];

  return (
    <section className="grid overflow-hidden rounded-3xl bg-[#16132a] text-[#f4f2fb] ring-1 ring-white/5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)_minmax(0,270px)]">
      <div className="flex flex-col gap-4 border-b border-[#2c2748] p-6 sm:p-8 lg:border-r lg:border-b-0">
        <div className="text-xs font-medium tracking-[0.08em] text-[#b9b3d1] uppercase">Net worth</div>
        <div className="text-5xl font-semibold tracking-tight tabular-nums">{lakh(netWorth)}</div>
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {parts.map((p) => (
            <div key={p.label} style={{ width: `${(Math.abs(p.value) / whole) * 100}%`, backgroundColor: p.color }} />
          ))}
        </div>
        <div className="space-y-2.5 text-sm">
          {parts.map((p) => (
            <div key={p.label} className="flex items-center gap-2.5">
              <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: p.color }} />
              <span className="flex-1 text-[#d7d2ea]">{p.label}</span>
              <span className="font-mono tabular-nums">{p.value < 0 ? `−${formatINR(-p.value)}` : formatINR(p.value)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3 border-b border-[#2c2748] p-6 sm:p-8 lg:border-b-0">
        <div className="flex items-baseline gap-3">
          <div className="text-xs font-medium tracking-[0.08em] text-[#b9b3d1] uppercase">Cash runway · next 30 days</div>
          <div className="flex-1" />
          <div className="text-xs text-[#b9b3d1]">reserve {lakh(f.reserve)}</div>
        </div>
        <RunwayChart f={f} />
      </div>

      <div className="flex flex-col gap-4 bg-[#1e1a38] p-6 sm:p-7">
        <div className="space-y-1 border-b border-[#2c2748] pb-4">
          <div className="text-[13px] text-[#b9b3d1]">Low point · {f.minOn === f.today ? "today" : fmtDay(f.minOn)}</div>
          <div className="text-3xl font-semibold tabular-nums">{lakh(f.minBalance)}</div>
          <div className="text-[13px]" style={{ color: f.healthy ? INVESTED : LOAN }}>
            {f.healthy
              ? `${lakh(f.minBalance - f.reserve)} above your reserve`
              : `${lakh(f.reserve - f.minBalance)} below your reserve`}
          </div>
        </div>
        <div className="space-y-1 border-b border-[#2c2748] pb-4">
          {salaryEvent ? (
            <>
              <div className="text-[13px] text-[#b9b3d1]">Due before salary</div>
              <div className="text-3xl font-semibold tabular-nums">{formatINR(beforeSalary.reduce((s, e) => s - e.amount, 0))}</div>
            </>
          ) : (
            <>
              <div className="text-[13px] text-[#b9b3d1]">Safe to spend · this month</div>
              <div className="text-3xl font-semibold tabular-nums">{lakh(f.safeToSpend)}</div>
            </>
          )}
          <div className="text-[13px] text-[#b9b3d1]">
            {nextOut ? `next: ${nextOut.label.toLowerCase()} on ${fmtDay(nextOut.on)}` : "nothing due in the next 30 days"}
          </div>
        </div>
        <div className="flex items-center gap-3.5">
          {score ? (
            <ScoreRing score={score.score} />
          ) : (
            <div className="flex size-14 items-center justify-center rounded-full border-[6px] border-[#2c2748]">
              {scoreLoading && <Loader2 className="size-4 animate-spin text-[#b9b3d1]" />}
            </div>
          )}
          <div className="space-y-0.5">
            <div className="text-[15px] font-semibold">
              {score ? `Score · ${score.rating}` : scoreLoading ? "Scoring…" : scoreError ? "Score unavailable" : "Finance score"}
            </div>
            {score && (
              <button type="button" className="text-[13px] text-[#b7a9ff] hover:text-[#d6ceff] hover:underline" onClick={onWhy}>
                Why {score.score}?
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
