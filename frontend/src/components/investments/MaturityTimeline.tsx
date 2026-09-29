import { useMemo } from "react";
import Panel from "@/components/page/Panel";
import { maturityValue } from "@/lib/portfolio";
import { KIND_META, type Investment, type InvestmentKind } from "@/lib/sample";
import { useWidth } from "@/lib/useWidth";
import { countsLabel, lakh, maturityGroups, SHORT, type MaturityGroup } from "./holdings";

/** The kind holding most of a group's money, whose colour the group's bar takes. */
function mainKind(g: MaturityGroup): InvestmentKind {
  const by = new Map<InvestmentKind, number>();
  for (const i of g.items) by.set(i.kind, (by.get(i.kind) ?? 0) + i.principal);
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const listOf = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0]);

/**
 * When locked-up money comes back, and how much: one bar per month (a year, further out) with the
 * payout on top. Spaced evenly rather than to scale — 2027 and 2051 on a true time axis would
 * squash the near maturities, which are the ones worth planning around, into one corner. Too
 * narrow for the bars (a phone) and it becomes a list instead.
 */
export default function MaturityTimeline({ items }: { items: Investment[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(560);
  const groups = useMemo(() => maturityGroups(items), [items]);

  // What the numbers can't show, said underneath rather than guessed at.
  const notes = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const out: string[] = [];
    const unknown = [...new Set(items.filter((i) => i.maturityDate && i.kind !== "PF" && maturityValue(i) == null).map((i) => SHORT[i.kind]))];
    if (unknown.length) out.push(`* ${listOf(unknown)} at today's value: the payout depends on terms Jarvis doesn't have.`);
    const undated = [...new Set(items.filter((i) => !i.maturityDate).map((i) => SHORT[i.kind]))];
    if (undated.length) out.push(`${listOf(undated)} ${undated.length === 1 ? "has" : "have"} no maturity date.`);
    const passed = items.filter((i) => i.maturityDate && new Date(`${i.maturityDate}T00:00:00`) < monthStart).length;
    if (passed) out.push(`${passed} holding${passed === 1 ? " has" : "s have"} passed maturity: update or remove ${passed === 1 ? "it" : "them"} below.`);
    return out;
  }, [items]);

  const payoutMax = Math.max(1, ...groups.filter((g) => !g.retirement).map((g) => g.total));
  const n = groups.length;
  const left = 56;
  const slot = n ? (W - left) / n : 0;
  const asList = n > 0 && slot < 76;

  const H = 180;
  const base = 118;
  const barMax = 84;
  const barH = (g: MaturityGroup) => (g.retirement ? barMax + 6 : 14 + (g.total / payoutMax) * (barMax - 14));

  return (
    <Panel title="When money frees up" note="value at maturity">
      <div ref={ref} className="w-full min-w-0 overflow-hidden">
        {n === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing here has a maturity date still to come.</p>
        ) : asList ? (
          <ul className="space-y-2.5">
            {groups.map((g) => {
              const color = KIND_META[mainKind(g)].color;
              return (
                <li key={g.key} className="flex items-center gap-3 text-sm">
                  <span className="w-16 shrink-0 font-medium">{g.label}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-muted-foreground">{countsLabel(g.items)}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${g.retirement ? 100 : Math.max(4, (g.total / payoutMax) * 100)}%`, backgroundColor: color, opacity: g.retirement ? 0.45 : 1 }} />
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[13px] tabular-nums">
                    {g.retirement ? "until retirement" : `${lakh(g.total)}${g.known ? "" : " *"}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={`Maturities: ${groups.map((g) => `${g.label}${g.retirement ? " EPF" : ` ${lakh(g.total)}`}`).join(", ")}`}>
            <line x1={8} x2={W - 4} y1={base} y2={base} stroke="var(--border)" strokeWidth={2} />
            <circle cx={20} cy={base} r={5} fill="var(--foreground)" />
            <text x={20} y={base + 24} textAnchor="middle" fontSize={12} fill="var(--muted-foreground)">
              today
            </text>
            {groups.map((g, i) => {
              const cx = left + slot * (i + 0.5);
              const w = Math.min(44, slot * 0.5);
              const h = barH(g);
              const color = KIND_META[mainKind(g)].color;
              return (
                <g key={g.key}>
                  <rect x={cx - w / 2} y={base - h} width={w} height={h} rx={6} fill={color} opacity={g.retirement ? 0.45 : 1} />
                  <text x={cx} y={base - h - 8} textAnchor="middle" fontSize={g.retirement ? 11 : 13} fontWeight={g.retirement ? 400 : 600} fill={g.retirement ? "var(--muted-foreground)" : "var(--foreground)"}>
                    {g.retirement ? "grows till then" : `${lakh(g.total)}${g.known ? "" : " *"}`}
                  </text>
                  <text x={cx} y={base + 24} textAnchor="middle" fontSize={12} fill="var(--foreground)">
                    {g.label}
                  </text>
                  <text x={cx} y={base + 40} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
                    {countsLabel(g.items)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      {notes.length > 0 && <p className="text-[13px] text-muted-foreground">{notes.join(" ")}</p>}
    </Panel>
  );
}
