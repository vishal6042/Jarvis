import type { ReactNode } from "react";

/** A titled group of cards: a heading with a count and an optional one-line summary, then the cards in a grid. */
export default function CardSection({
  title,
  count,
  color,
  icon,
  summary,
  children,
}: {
  title: string;
  count: number;
  color: string;
  icon: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <span
            className="flex size-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
          >
            {icon}
          </span>
          {title}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        </h2>
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      </div>
      <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}
