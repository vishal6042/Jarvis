import { useWidth } from "@/lib/useWidth";
import { isoDay } from "@/lib/forecast";
import { inWords, monthEnd, monthShort, type Payout } from "./plan";

const H = 124;
const TOP = 20;
const BOTTOM = 100;
const PAD_X = 8;
/** Rough width of one character of the 11px chart labels, for keeping them inside the chart. */
const CHAR = 6.2;

/**
 * The recommended plan as a picture: what is saved rising month by month with the set-aside, then
 * the jump where the deposits pay out, up to the target line. Drawn at the container's real width
 * so the labels keep their size on a phone and on a wide screen.
 */
export default function PlanChart({
  saved,
  target,
  monthly,
  months,
  used,
  by,
  kinds,
  today = new Date(),
}: {
  saved: number;
  target: number;
  monthly: number;
  months: number;
  used: Payout[];
  by: Date;
  /** "FDs", "FD and RD" — what the jump label calls the payout. */
  kinds: string;
  today?: Date;
}) {
  const [ref, w] = useWidth<HTMLDivElement>(480);
  if (months <= 0 || target <= 0) return null;

  const x = (k: number) => PAD_X + (k / months) * (w - 2 * PAD_X);
  const y = (v: number) => BOTTOM - (Math.min(Math.max(v, 0), target) / target) * (BOTTOM - TOP);
  const byIso = isoDay(by);
  // Month k's payouts: those landing after the end of month k-1 and by the end of month k (the last
  // month runs to the plan's own date, which may be a kept target date rather than a month end).
  const paidIn = (k: number) => {
    const from = k === 0 ? "" : isoDay(monthEnd(today, k - 1));
    const to = k >= months ? byIso : isoDay(monthEnd(today, k));
    return used.filter((p) => p.on > from && p.on <= to).reduce((s, p) => s + p.amount, 0);
  };

  const pts: [number, number][] = [];
  const jumps: { k: number; before: number; after: number; amount: number }[] = [];
  let paid = paidIn(0);
  pts.push([x(0), y(saved + paid)]);
  for (let k = 1; k <= months; k++) {
    const before = saved + monthly * k + paid;
    pts.push([x(k), y(before)]);
    const inMonth = paidIn(k);
    if (inMonth > 0) {
      paid += inMonth;
      jumps.push({ k, before, after: before + inMonth, amount: inMonth });
      pts.push([x(k), y(before + inMonth)]);
    }
  }
  const main = jumps.reduce<(typeof jumps)[number] | null>((a, b) => (!a || b.amount > a.amount ? b : a), null);

  const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const summary =
    `Plan: saved money grows ${monthly > 0 ? `by ${inWords(monthly)} a month ` : ""}` +
    (main ? `to ${inWords(main.before)}, then the payout of ${inWords(main.amount)} takes it to ${inWords(target)}` : `to ${inWords(target)}`) +
    ` by ${monthShort(by)}`;

  let labels = null;
  if (main) {
    const xj = x(main.k);
    const yb = y(main.before);
    const ya = y(main.after);
    const savedText = `${inWords(main.before)} saved`;
    const jumpText = `+${inWords(main.amount)} ${kinds}`;
    const savedLeft = xj - 8 - savedText.length * CHAR >= 0;
    const jumpRight = xj + 8 + jumpText.length * CHAR <= w;
    labels = (
      <>
        <circle cx={xj} cy={yb} r={4} className="fill-primary" />
        {main.before > 0 && (
          <text x={savedLeft ? xj - 8 : xj + 8} y={Math.min(BOTTOM - 4, yb + 16)} fontSize={11} textAnchor={savedLeft ? "end" : "start"} className="fill-primary">
            {savedText}
          </text>
        )}
        <text
          x={jumpRight ? xj + 6 : xj - 8}
          y={(yb + ya) / 2 + 4}
          fontSize={11}
          textAnchor={jumpRight ? "start" : "end"}
          className="fill-emerald-700 dark:fill-emerald-400"
        >
          {jumpText}
        </text>
      </>
    );
  }

  return (
    <div ref={ref} className="w-full min-w-0 overflow-hidden">
      <svg width={w} height={H} role="img" aria-label={summary} className="block">
        <line x1={PAD_X} x2={w - PAD_X} y1={BOTTOM} y2={BOTTOM} className="stroke-border" />
        <line x1={PAD_X} x2={w - PAD_X} y1={TOP} y2={TOP} strokeDasharray="5 4" className="stroke-foreground/70" />
        <text x={w - PAD_X} y={TOP - 6} fontSize={11} textAnchor="end" className="fill-foreground">
          {inWords(target)}
        </text>
        <polyline points={pts.map(([a, b]) => `${a},${b}`).join(" ")} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-primary" />
        {labels}
        <text x={PAD_X} y={H - 6} fontSize={11} className="fill-muted-foreground">
          {monthShort(first)}
        </text>
        <text x={w - PAD_X} y={H - 6} fontSize={11} textAnchor="end" className="fill-muted-foreground">
          {monthShort(by)}
        </text>
      </svg>
    </div>
  );
}
