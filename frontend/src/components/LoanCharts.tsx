import type { Amortisation, AmortRow } from "@/lib/amortisation";
import { formatINR } from "@/lib/format";
import { useWidth } from "@/lib/useWidth";

/*
 * The two pictures of a loan that answer what a borrower actually asks late in a loan: when is it
 * over, and what would change that (the balance running down, with a prepayment beside it), and
 * what each payment still to come is made of. They replace an interest-vs-principal-by-year bar
 * chart that, with a few EMIs left, was two big bars with a sliver of interest on top.
 */

const PRINCIPAL = "#10b981";
const INTEREST = "#f43f5e";
const SCENARIO = "#0ea5e9";
const lakh = (n: number) => formatINR(n, { compact: true });
const monthLabel = (ym: string, withYear = false) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", withYear ? { month: "short", year: "numeric" } : { month: "short" });

/** Where what is left to pay goes: principal against interest, as one proportion bar. */
export function LeftToPay({ plan }: { plan: Amortisation }) {
  const principal = plan.totalPaid - plan.totalInterest;
  const pct = plan.totalPaid > 0 ? (plan.totalInterest / plan.totalPaid) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        <div style={{ width: `${100 - pct}%`, backgroundColor: PRINCIPAL }} />
        <div style={{ width: `${Math.max(pct, 0.8)}%`, backgroundColor: INTEREST }} />
      </div>
      <p className="text-[13px] text-muted-foreground">
        Of the <span className="font-medium text-foreground">{formatINR(Math.round(plan.totalPaid))}</span> left to pay:{" "}
        <span style={{ color: PRINCIPAL }}>●</span> {formatINR(Math.round(principal))} principal ·{" "}
        <span style={{ color: INTEREST }}>●</span> {formatINR(Math.round(plan.totalInterest))} interest ({pct < 1 ? pct.toFixed(1) : Math.round(pct)}%)
      </p>
    </div>
  );
}

/**
 * The outstanding balance month by month to zero. With a prepayment being tried, its own run-down
 * is drawn dashed beside it, so how much sooner it ends is visible, not just stated.
 */
export function BalanceRunDown({ outstanding, base, scenario, color }: {
  outstanding: number;
  base: Amortisation;
  /** The same loan with the extra or lump sum applied; omitted when none is being tried. */
  scenario?: Amortisation | null;
  color: string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>(640);
  const H = 220;
  const top = 26;
  const bottom = H - 30;
  const left = 4;
  const right = W - 4;
  const months = Math.max(1, base.months);
  const x = (m: number) => left + (m / months) * (right - left);
  const y = (v: number) => top + (1 - v / Math.max(1, outstanding)) * (bottom - top);
  const path = (rows: AmortRow[], start: number) =>
    [`M${x(0).toFixed(1)},${y(start).toFixed(1)}`, ...rows.map((r) => `L${x(r.month).toFixed(1)},${y(Math.max(0, r.balance)).toFixed(1)}`)].join(" ");
  const baseLine = path(base.rows, outstanding);
  const scenarioStart = scenario ? (scenario.rows[0] ? scenario.rows[0].balance + scenario.rows[0].principal : outstanding) : outstanding;
  const scenarioLine = scenario ? path(scenario.rows, scenarioStart) : null;
  const endX = x(months);
  const sEndX = scenario ? x(scenario.months) : null;
  const lastOn = base.rows[base.rows.length - 1]?.on;
  const sLastOn = scenario?.rows[scenario.rows.length - 1]?.on;

  // A handful of month ticks, however long the loan.
  const step = months <= 12 ? 1 : months <= 24 ? 3 : months <= 60 ? 12 : 24;
  const ticks = base.rows.filter((r) => r.month % step === 0 && r.month < months - step / 2);

  return (
    <div ref={ref} className="w-full min-w-0 overflow-hidden">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={`Balance falls from ${lakh(outstanding)} today to zero in ${monthLabel(lastOn ?? "", true)}`}>
        <defs>
          <linearGradient id="loan-rundown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.5, 1].map((t) => (
          <line key={t} x1={left} x2={right} y1={y(outstanding * t)} y2={y(outstanding * t)} stroke="var(--border)" strokeDasharray="3 5" />
        ))}
        <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="var(--border)" />
        <path d={`${baseLine} L${endX.toFixed(1)},${bottom} L${left},${bottom} Z`} fill="url(#loan-rundown)" />
        <path d={baseLine} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
        {scenarioLine && <path d={scenarioLine} fill="none" stroke={SCENARIO} strokeWidth={2.5} strokeDasharray="6 5" strokeLinejoin="round" />}

        <circle cx={left + 1} cy={y(outstanding)} r={4} fill={color} />
        <text x={left + 8} y={y(outstanding) - 8} fontSize={12} fontWeight={600} fill="var(--foreground)">
          {lakh(outstanding)} today
        </text>

        <circle cx={endX} cy={bottom} r={5} fill={color} stroke="var(--card)" strokeWidth={2} />
        <text x={Math.min(endX, right - 2)} y={bottom - 10} fontSize={12} fontWeight={600} textAnchor="end" fill="var(--foreground)">
          Debt-free {lastOn ? monthLabel(lastOn, true) : ""}
        </text>
        {scenario && sEndX != null && sLastOn && sLastOn !== lastOn && (
          <>
            <circle cx={sEndX} cy={bottom} r={5} fill={SCENARIO} stroke="var(--card)" strokeWidth={2} />
            <text x={Math.max(sEndX, left + 60)} y={bottom - 28} fontSize={12} fontWeight={600} textAnchor="end" fill={SCENARIO}>
              {monthLabel(sLastOn, true)} paying more
            </text>
          </>
        )}

        {ticks.map((r) => (
          <text key={r.on} x={x(r.month)} y={H - 10} fontSize={11} textAnchor="middle" fill="var(--muted-foreground)">
            {monthLabel(r.on, step >= 12)}
          </text>
        ))}
        <text x={left} y={H - 10} fontSize={11} fill="var(--muted-foreground)">
          Today
        </text>
      </svg>
    </div>
  );
}

/**
 * What each payment still to come is made of: one bar per EMI while there are few enough to read
 * (split into principal and interest, the last one marked), one per year for a long loan.
 */
export function PaymentsAhead({ plan }: { plan: Amortisation }) {
  const [ref, W] = useWidth<HTMLDivElement>(640);
  const perMonth = plan.rows.length <= 36;
  const bars = perMonth
    ? plan.rows.map((r) => ({ key: r.on, label: monthLabel(r.on), sub: r.month === 1 || r.on.endsWith("-01") ? r.on.slice(0, 4) : "", principal: r.principal, interest: r.interest }))
    : plan.byYear.map((yr) => ({ key: yr.year, label: yr.year, sub: "", principal: yr.principal, interest: yr.interest }));
  const H = 150;
  const top = 18;
  const bottom = H - 36;
  const max = Math.max(1, ...bars.map((b) => b.principal + b.interest));
  const col = W / Math.max(1, bars.length);
  const bw = Math.min(44, col * 0.62);
  const h = (v: number) => (v / max) * (bottom - top);
  const last = bars[bars.length - 1];

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3 text-sm">
        <span className="font-medium">{perMonth ? `The ${bars.length} payments left` : "Payments left, by year"}</span>
        <span className="flex gap-3 text-xs text-muted-foreground">
          <span>
            <span style={{ color: PRINCIPAL }}>●</span> principal
          </span>
          <span>
            <span style={{ color: INTEREST }}>●</span> interest
          </span>
        </span>
      </div>
      <div ref={ref} className="w-full min-w-0 overflow-hidden">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Principal and interest in each payment still to come">
          <line x1={0} x2={W} y1={bottom} y2={bottom} stroke="var(--border)" />
          {bars.map((b) => {
            const cx = col * bars.indexOf(b) + col / 2;
            const ph = h(b.principal);
            const ih = Math.max(b.interest > 0 ? 1.5 : 0, h(b.interest));
            const isLast = b === last;
            return (
              <g key={b.key}>
                <title>{`${b.label}: ${formatINR(Math.round(b.principal))} principal + ${formatINR(Math.round(b.interest))} interest`}</title>
                <rect x={cx - bw / 2} y={bottom - ph} width={bw} height={ph} rx={4} fill={PRINCIPAL} opacity={isLast ? 1 : 0.85} />
                <rect x={cx - bw / 2} y={bottom - ph - ih} width={bw} height={ih} rx={2} fill={INTEREST} />
                {(bars.length <= 12 || isLast) && (
                  <text x={cx} y={bottom - ph - ih - 5} fontSize={10} textAnchor="middle" fill="var(--muted-foreground)">
                    {lakh(b.principal + b.interest)}
                  </text>
                )}
                <text x={cx} y={bottom + 15} fontSize={11} textAnchor="middle" fontWeight={isLast ? 600 : 400} fill={isLast ? "var(--foreground)" : "var(--muted-foreground)"}>
                  {b.label}
                </text>
                {b.sub && (
                  <text x={cx} y={bottom + 29} fontSize={10} textAnchor="middle" fill="var(--muted-foreground)">
                    {b.sub}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {perMonth && last && (
        <p className="text-xs text-muted-foreground">
          The last payment, in {last.label}, is {formatINR(Math.round(last.principal + last.interest))}
          {bars.length > 1 && last.principal + last.interest < (bars[0].principal + bars[0].interest) * 0.95 ? ", smaller than the rest" : ""}. Interest is{" "}
          {formatINR(Math.round(bars[0].interest))} of the next EMI and falls with each one.
        </p>
      )}
    </div>
  );
}
