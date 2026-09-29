import type { ReactNode } from "react";

export interface HeadlineCell {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** A sparkline, a small bar — anything under the sub line. */
  extra?: ReactNode;
  tone?: "warn";
}

/** The row of headline numbers under a page header: same labels, same weights, one border. */
export default function HeadlineStrip({ cells }: { cells: HeadlineCell[] }) {
  const cols = cells.length >= 6 ? "xl:grid-cols-6" : cells.length === 5 ? "xl:grid-cols-5" : cells.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3";
  return (
    <section className={`grid overflow-hidden rounded-2xl border bg-card sm:grid-cols-2 lg:grid-cols-3 ${cols}`}>
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={`flex flex-col gap-1.5 border-border/60 p-5 ${i < cells.length - 1 ? "border-b xl:border-r xl:border-b-0" : ""} ${
            c.tone === "warn" ? "bg-amber-50/70 dark:bg-amber-500/5" : ""
          }`}
        >
          <div className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">{c.label}</div>
          <div className="text-2xl font-semibold tabular-nums">{c.value}</div>
          {c.sub && <div className="text-[13px] text-muted-foreground">{c.sub}</div>}
          {c.extra && <div className="mt-auto">{c.extra}</div>}
        </div>
      ))}
    </section>
  );
}
