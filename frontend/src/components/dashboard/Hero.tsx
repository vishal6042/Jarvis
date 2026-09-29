import { useWidth } from "@/lib/useWidth";
import { formatINR } from "@/lib/format";
import type { Forecast, ForecastEvent } from "@/lib/forecast";

/*
 * The top of the dashboard, on a dark panel in both themes: what you own, where the cash is heading
 * over the next month, and what it comes to by the end of it. Everything is read from the forecast
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

/**
 * Balance as a step line over the next month. Drawn at the container's real pixel width (not a
 * stretched viewBox) so dots stay round and labels keep their shape at any size.
 */
function RunwayChart({ f }: { f: Forecast }) {
  const [ref, W] = useWidth<HTMLDivElement>(560);
  const H = 210;
  const top = 26; // room for the value labels above the dots
  const bottom = H - 30; // room for the date axis
  const span = Math.max(1, dayDiff(f.today, f.projectedOn));
  const pts = [{ d: 0, v: f.startBalance }, ...f.events.filter(isMove).map((e) => ({ d: dayDiff(f.today, e.on), v: e.balanceAfter }))];
  const values = [...pts.map((p) => p.v), f.reserve];
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const pad = (hi - lo) * 0.08 || hi * 0.1 || 1;
  const max = hi + pad;
  const min = Math.min(lo - pad, f.reserve - pad);
  const x = (d: number) => (Math.max(0, Math.min(span, d)) / span) * (W - 2) + 1;
  const y = (v: number) => top + ((max - v) / (max - min)) * (bottom - top);

  let line = `M1,${y(pts[0].v).toFixed(1)}`;
  for (const p of pts.slice(1)) line += ` H${x(p.d).toFixed(1)} V${y(p.v).toFixed(1)}`;
  line += ` H${W - 1}`;
  const area = `${line} V${bottom} H1 Z`;
  const marks = keyEvents(f);
  // Labels only where there is room for them; the legend below always carries the detail.
  const roomy = W >= 420;
  const endY = y(pts[pts.length - 1].v);
  // The month-end value, unless the last marked point already says the same number.
  const showEnd = roomy && (marks.length === 0 || lakh(marks[marks.length - 1].balanceAfter) !== lakh(f.projected));

  return (
    <div className="space-y-3">
      <div ref={ref} className="w-full min-w-0 overflow-hidden">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          role="img"
          aria-label={`Projected balance from ${lakh(f.startBalance)} today to ${lakh(f.projected)} on ${fmtDay(f.projectedOn)}, lowest ${lakh(f.minBalance)} on ${fmtDay(f.minOn)}`}
        >
          <defs>
            <linearGradient id="runway-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={CASH} stopOpacity="0.4" />
              <stop offset="1" stopColor={CASH} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* faint guides at the top and middle of the range */}
          {[0.25, 0.5, 0.75].map((t) => (
            <line key={t} x1={0} x2={W} y1={top + (bottom - top) * t} y2={top + (bottom - top) * t} stroke="#2c2748" strokeWidth={1} />
          ))}
          <path d={area} fill="url(#runway-fill)" />
          <path d={line} fill="none" stroke="#a898ff" strokeWidth={2.5} strokeLinejoin="round" />
          <line x1={0} x2={W} y1={y(f.reserve)} y2={y(f.reserve)} stroke={LOAN} strokeWidth={1.5} strokeDasharray="6 6" />
          <text x={W - 4} y={y(f.reserve) - 6} fill={LOAN} fontSize={11} textAnchor="end">
            reserve {lakh(f.reserve)}
          </text>
          <line x1={1} x2={1} y1={top - 8} y2={bottom} stroke="#f4f2fb" strokeWidth={2} />
          {marks.map((e) => {
            const cx = x(dayDiff(f.today, e.on));
            const cy = y(e.balanceAfter);
            const anchor = cx < 40 ? "start" : cx > W - 40 ? "end" : "middle";
            return (
              <g key={`${e.on}-${e.label}`}>
                <line x1={cx} x2={cx} y1={cy} y2={bottom} stroke="#f4f2fb" strokeOpacity={0.15} strokeDasharray="2 4" />
                <circle cx={cx} cy={cy} r={5} fill={e.amount > 0 ? INVESTED : LOAN} stroke="#16132a" strokeWidth={2} />
                {roomy && (
                  <>
                    <text x={cx} y={cy - 10} fill="#f4f2fb" fontSize={12} fontWeight={600} textAnchor={anchor}>
                      {lakh(e.balanceAfter)}
                    </text>
                    <text x={cx} y={bottom + 18} fill="#b9b3d1" fontSize={11} textAnchor={anchor}>
                      {fmtDay(e.on)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
          {showEnd && (
            <text x={W - 4} y={endY - 10} fill="#d7d2ea" fontSize={12} textAnchor="end">
              {lakh(f.projected)}
            </text>
          )}
          <text x={4} y={bottom + 18} fill="#b9b3d1" fontSize={11}>
            Today
          </text>
          <text x={W - 4} y={bottom + 18} fill="#b9b3d1" fontSize={11} textAnchor="end">
            {fmtDay(f.projectedOn)}
          </text>
        </svg>
      </div>
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

export default function Hero({
  savings,
  investments,
  loans,
  forecast: f,
}: {
  savings: number;
  investments: number;
  loans: number;
  forecast: Forecast;
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
        <div className="text-xs font-medium tracking-[0.08em] text-[#b9b3d1] uppercase">Cash runway · next 30 days</div>
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
        <div className="space-y-1">
          <div className="text-[13px] text-[#b9b3d1]">By {fmtDay(f.projectedOn)}</div>
          <div className="text-3xl font-semibold tabular-nums">{lakh(f.projected)}</div>
          <div className="text-[13px]" style={{ color: f.projected >= f.startBalance ? INVESTED : "#b9b3d1" }}>
            {f.projected >= f.startBalance
              ? `${lakh(f.projected - f.startBalance)} more than today`
              : `${lakh(f.startBalance - f.projected)} less than today`}
          </div>
        </div>
      </div>
    </section>
  );
}
