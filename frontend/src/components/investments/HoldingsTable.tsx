import { Fragment, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import Panel from "@/components/page/Panel";
import { formatINR } from "@/lib/format";
import { allocationByKind, maturityValue, valueToday } from "@/lib/portfolio";
import type { Investment } from "@/lib/sample";
import { KIND_META } from "@/lib/sample";
import { accountNumber, cardAnchor, dayMonth, holdingRows, lakh, pct1, type HoldingRow } from "./holdings";

const at = (iso: string) => new Date(`${iso}T00:00:00`);

/** "8.2%", or "8.9–10.3%" across a group. */
function yearText(r: HoldingRow): string {
  if (r.yearMin == null || r.yearMax == null) return "—";
  return r.yearMin.toFixed(1) === r.yearMax.toFixed(1) ? pct1(r.yearMin) : `${r.yearMin.toFixed(1)}–${pct1(r.yearMax)}`;
}

/**
 * Every holding on one screen, before the cards: what went in, what it is worth, how fast it grows,
 * what it takes each month and when it frees up. Alike holdings share a row that opens to list
 * them, and a click on any row scrolls to its card below — the table is the index, the cards are
 * the detail. The thin bar in the header is the same split by product, so the mix is visible at
 * a glance without a chart of its own.
 */
export default function HoldingsTable({ items, onJump }: { items: Investment[]; onJump: (anchor: string) => void }) {
  const rows = useMemo(() => holdingRows(items), [items]);
  const slices = useMemo(() => allocationByKind(items), [items]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const th = "px-2 py-2.5 text-xs font-normal text-muted-foreground";
  const td = "px-2 py-3 align-middle";
  return (
    <Panel
      title="Holdings"
      note="alike ones grouped · click a row for its detail"
      action={
        <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full sm:w-72 lg:w-90" role="img" aria-label="Split of value by product">
          {slices.map((s) => (
            <div key={s.kind} title={`${s.label} · ${Math.round(s.pct)}%`} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
          ))}
        </div>
      }
    >
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className={th}>Holding</th>
              <th className={`${th} text-right`}>Invested</th>
              <th className={`${th} text-right`}>Value today</th>
              <th className={`${th} text-right`}>Gain</th>
              <th className={`${th} text-right`}>A year</th>
              <th className={`${th} text-right`}>Monthly in</th>
              <th className={th}>Frees up</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const group = r.items.length > 1;
              const expanded = open.has(r.key);
              return (
                <Fragment key={r.key}>
                  <tr
                    className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/50 ${expanded ? "bg-muted/40" : ""}`}
                    onClick={() => onJump(r.anchor)}
                  >
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: KIND_META[r.kind].color }} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 font-medium">
                            <span className="truncate">{r.title}</span>
                            {group && (
                              <button
                                type="button"
                                aria-expanded={expanded}
                                aria-label={expanded ? "Hide the holdings in this group" : "List the holdings in this group"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggle(r.key);
                                }}
                                className="flex size-6 items-center justify-center rounded-md text-primary hover:bg-primary/10"
                              >
                                <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                              </button>
                            )}
                          </div>
                          {r.sub && <div className="truncate text-xs text-muted-foreground">{r.sub}</div>}
                        </div>
                      </div>
                    </td>
                    <td className={`${td} text-right font-mono tabular-nums`}>{formatINR(r.invested)}</td>
                    <td className={`${td} text-right font-mono tabular-nums`} title={r.accruedNote ?? undefined}>
                      {r.accrued && "≈"}
                      {formatINR(r.value)}
                      {r.accruedNote && !group && <div className="font-sans text-[11px] text-muted-foreground">{r.accruedNote}</div>}
                    </td>
                    <td className={`${td} text-right tabular-nums ${r.gainPct >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {r.gainPct >= 0 ? "+" : ""}
                      {pct1(r.gainPct)}
                    </td>
                    <td className={`${td} text-right tabular-nums ${r.estimated ? "text-amber-700 dark:text-amber-400" : ""}`} title={r.estimated ? "An estimate: see Jarvis's ideas below" : undefined}>
                      {yearText(r)}
                      {r.estimated && " *"}
                    </td>
                    <td className={`${td} text-right font-mono tabular-nums ${r.monthly > 0 ? "" : "text-muted-foreground/60"}`}>
                      {r.monthly > 0 ? formatINR(Math.round(r.monthly)) : "—"}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{r.freesUp}</td>
                  </tr>
                  {group && expanded && (
                    <tr className="border-b border-border/50 bg-muted/40">
                      <td colSpan={7} className="px-2 pt-1 pb-3 pl-8">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {r.items.map((inv, _n, all) => {
                            // The day and month tell alike deposits apart; the year only when they differ.
                            const oneYear = new Set(all.map((i) => i.maturityDate?.slice(0, 4))).size === 1;
                            const payout = maturityValue(inv);
                            const v = valueToday(inv);
                            return (
                              <button
                                key={inv.id}
                                type="button"
                                title={`${inv.name} · ${v.accrued ? "≈" : ""}${formatINR(v.value)} today${payout ? ` · ${lakh(payout)} at maturity` : ""}`}
                                onClick={() => onJump(cardAnchor(inv.id))}
                                className="rounded-lg border bg-card px-2 py-1 hover:border-primary/50 hover:text-foreground"
                              >
                                {accountNumber(inv)}
                                {inv.maturityDate && ` · ${dayMonth(at(inv.maturityDate))}${oneYear ? "" : ` ${inv.maturityDate.slice(0, 4)}`}`}
                              </button>
                            );
                          })}
                          {r.accruedNote && <span className="px-1">{r.accruedNote}</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
