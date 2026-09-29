import { formatINR } from "@/lib/format";
import type { MonthPoint, Report } from "@/lib/report";
import { useWidth } from "@/lib/useWidth";

const INCOME = "#0f8a62";
const SPEND = "var(--primary)";
const RATE = "#d97706";
const lakh = (n: number) => formatINR(n, { compact: true });

/** A small trend line at a fixed pixel size. */
export function Sparkline({ values, width = 120, height = 28, color = "currentColor", dotLast = false }: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  dotLast?: boolean;
}) {
  if (values.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / span) * (height - 6)] as const);
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="block">
      <polyline points={pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      {dotLast && <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />}
    </svg>
  );
}

/** Income and spend per month as paired bars, with the savings rate as a line over them. */
export function IncomeSpendChart({ months }: { months: MonthPoint[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(820);
  const H = 290;
  const top = 34;
  const base = 226;
  if (months.length === 0) return <div ref={ref} className="py-10 text-center text-sm text-muted-foreground">Not enough months in the ledger yet.</div>;
  const max = Math.max(1, ...months.map((m) => Math.max(m.income + m.expected, m.spend)));
  const h = (v: number) => (Math.max(0, v) / max) * (base - top);
  const group = W / months.length;
  const bar = Math.min(48, group * 0.3);
  const rates = months.map((m) => m.rate);
  const rateMax = Math.max(50, ...rates.map((r) => (r == null ? 0 : Math.abs(r))));
  const ry = (r: number) => base - (Math.max(-rateMax, Math.min(rateMax, r)) / rateMax) * (base - top) * 0.9;

  return (
    <div ref={ref} className="w-full min-w-0 overflow-hidden">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Income and spend by month, with the share of income kept">
        <defs>
          <pattern id="expected-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#d8f0e6" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={INCOME} strokeWidth="2" />
          </pattern>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1={0} x2={W} y1={base - (base - top) * t} y2={base - (base - top) * t} stroke="var(--border)" strokeDasharray={t ? "3 5" : undefined} />
        ))}
        <text x={2} y={top - 6} fontSize={11} fill="var(--muted-foreground)">
          {lakh(max)}
        </text>
        {months.map((m, i) => {
          const cx = group * i + group / 2;
          const ix = cx - bar - 3;
          const sx = cx + 3;
          return (
            <g key={m.key}>
              <rect x={ix} y={base - h(m.income)} width={bar} height={h(m.income)} rx={4} fill={INCOME} />
              {m.expected > 0 && (
                <rect
                  x={ix}
                  y={base - h(m.income + m.expected)}
                  width={bar}
                  height={h(m.expected)}
                  rx={4}
                  fill="url(#expected-hatch)"
                  stroke={INCOME}
                  strokeDasharray="4 3"
                />
              )}
              <rect x={sx} y={base - h(m.spend)} width={bar} height={h(m.spend)} rx={4} fill={SPEND} />
              <text x={cx} y={base + 18} textAnchor="middle" fontSize={13} fontWeight={m.current ? 600 : 400} fill="var(--foreground)">
                {m.label}
              </text>
              <text
                x={cx}
                y={base + 36}
                textAnchor="middle"
                fontSize={11}
                fill={m.suspect ? "#b4233f" : "var(--muted-foreground)"}
              >
                {m.current && m.expected > 0 ? "~" : ""}
                {m.kept >= 0 ? `kept ${lakh(m.kept)}` : `over by ${lakh(-m.kept)}`}
                {m.suspect ? " ⚠" : ""}
              </text>
            </g>
          );
        })}
        <polyline
          points={months
            .map((m, i) => (m.rate == null ? null : `${(group * i + group / 2).toFixed(1)},${ry(m.rate).toFixed(1)}`))
            .filter(Boolean)
            .join(" ")}
          fill="none"
          stroke={RATE}
          strokeWidth={2.5}
        />
        {months.map((m, i) =>
          m.rate == null ? null : (
            <g key={`r-${m.key}`}>
              <circle cx={group * i + group / 2} cy={ry(m.rate)} r={4} fill={m.current ? "var(--card)" : RATE} stroke={RATE} strokeWidth={2} />
              <text x={group * i + group / 2} y={ry(m.rate) - 9} textAnchor="middle" fontSize={12} fontWeight={600} fill="#a35a00">
                {m.rate}%{m.current && m.expected > 0 ? "*" : ""}
              </text>
            </g>
          ),
        )}
      </svg>
    </div>
  );
}

/** One complete month from income to what was kept, as a waterfall of its biggest outgoings. */
export function Waterfall({ month, steps }: { month: string; steps: { label: string; amount: number; note?: string; kind: "income" | "fixed" | "oneoff" | "life" | "kept" }[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(1300);
  const H = 290;
  const top = 34;
  const base = 234;
  const income = steps[0]?.amount ?? 0;
  if (income <= 0) return <div ref={ref} className="py-8 text-center text-sm text-muted-foreground">No income recorded for {month}.</div>;
  const y = (v: number) => base - (Math.max(0, v) / income) * (base - top);
  const col = W / steps.length;
  const bw = Math.min(120, col * 0.72);
  const color = { income: "#0f8a62", fixed: "#3f2aa8", oneoff: "#d97706", life: "#9a8cf0", kept: "var(--primary)" } as const;
  let level = income;

  return (
    <div ref={ref} className="w-full min-w-0 overflow-hidden">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={`Where ${month}'s income went`}>
        <line x1={0} x2={W} y1={base} y2={base} stroke="var(--border)" />
        {steps.map((s, i) => {
          const x = col * i + (col - bw) / 2;
          let yTop: number;
          let yBot: number;
          if (s.kind === "income") {
            yTop = y(income);
            yBot = base;
          } else if (s.kind === "kept") {
            yTop = y(Math.max(0, s.amount));
            yBot = base;
          } else {
            yTop = y(level);
            level -= s.amount;
            yBot = y(level);
          }
          const next = steps[i + 1];
          return (
            <g key={s.label}>
              <rect x={x} y={yTop} width={bw} height={Math.max(2, yBot - yTop)} rx={5} fill={color[s.kind]} />
              {next && next.kind !== "kept" && (
                <line x1={x + bw} x2={x + col} y1={s.kind === "income" ? yTop : yBot} y2={s.kind === "income" ? yTop : yBot} stroke="var(--border)" strokeDasharray="3 3" />
              )}
              <text x={x + bw / 2} y={yTop - 8} textAnchor="middle" fontSize={13} fontWeight={600} fill={s.kind === "income" ? "#0b6b4c" : s.kind === "kept" ? "var(--primary)" : "var(--foreground)"}>
                {s.kind === "income" || s.kind === "kept" ? "" : "−"}
                {formatINR(s.amount)}
              </text>
              <text x={x + bw / 2} y={base + 18} textAnchor="middle" fontSize={12} fontWeight={s.kind === "kept" ? 600 : 400} fill="var(--foreground)">
                {s.label}
              </text>
              {s.note && (
                <text x={x + bw / 2} y={base + 34} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
                  {s.note}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** The waterfall's steps for a complete month of a report built for that month. */
export function waterfallSteps(r: Report) {
  const cats = r.categories;
  const top = cats.slice(0, 5);
  const rest = cats.slice(5).reduce((s, c) => s + c.total, 0);
  return [
    { label: "Income", amount: r.income, kind: "income" as const },
    ...top.map((c) => ({
      label: c.category.length > 16 ? `${c.category.slice(0, 15)}…` : c.category,
      amount: c.total,
      kind: c.fixed ? ("fixed" as const) : c.oneOff ? ("oneoff" as const) : ("life" as const),
      note: c.oneOff ? "one-off" : undefined,
    })),
    ...(rest > 0 ? [{ label: "Everything else", amount: rest, kind: "life" as const }] : []),
    { label: r.rate != null ? `Kept · ${r.rate}%` : "Kept", amount: r.kept, kind: "kept" as const },
  ];
}
