import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { Visual, VisualPoint } from "@/types";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The figures behind an assistant answer, drawn.
 *
 * <p>The tools send these already shaped — a total, a row per day, a row per merchant — so nothing
 * here parses the model's prose or decides what the answer meant. Each kind gets the form that
 * reads best at chat width: a real chart where the axis carries meaning (days, periods side by
 * side), and proportional bars where it is a ranked list and a chart would only add furniture.
 */
export default function AssistantVisuals({ visuals }: { visuals: Visual[] }) {
  if (!visuals?.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {visuals.map((v, i) => (
        <VisualCard key={i} visual={v} />
      ))}
    </div>
  );
}

/** Spending is rose and earning emerald across the whole app; these follow suit. */
const SPEND = "var(--chart-2)";
const EARN = "var(--chart-1)";

function VisualCard({ visual }: { visual: Visual }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background/40 ring-1 ring-primary/10">
      <div className="flex items-baseline justify-between gap-3 px-3 pt-2.5">
        <span className="text-xs font-semibold text-foreground/80">{visual.title}</span>
        {visual.subtitle && (
          <span className="truncate text-[11px] text-muted-foreground">{visual.subtitle}</span>
        )}
      </div>
      <Body visual={visual} />
    </div>
  );
}

function Body({ visual }: { visual: Visual }) {
  switch (visual.kind) {
    case "stat":
      return <Stat visual={visual} />;
    case "comparison":
      return <Comparison visual={visual} />;
    case "series":
      return <Series visual={visual} />;
    case "progress":
      return <Progress visual={visual} />;
    case "list":
      return <Rows visual={visual} showBars={false} />;
    case "breakdown":
    default:
      return <Rows visual={visual} showBars />;
  }
}

/** One figure, big, with the rest of the row as context under it. */
function Stat({ visual }: { visual: Visual }) {
  const [headline, ...rest] = visual.points;
  return (
    <div className="px-3 pb-3 pt-1">
      <div className="text-2xl font-semibold tabular-nums tracking-tight" style={{ color: SPEND }}>
        {formatINR(visual.amount ?? headline?.value)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {rest.map((p) => (
          <span key={p.label} className="text-xs text-muted-foreground">
            {p.label} <span className="font-medium tabular-nums text-foreground/80">{formatINR(p.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Two or more periods side by side, with the direction of travel called out. */
function Comparison({ visual }: { visual: Visual }) {
  const data = visual.points.map((p) => ({ ...p, short: shorten(p.label) }));
  const up = /^up/i.test(visual.caption ?? "");
  const down = /^down/i.test(visual.caption ?? "");
  return (
    <div className="px-1 pb-2">
      <Chart data={data} height={150} />
      {visual.caption && (
        <div
          className={cn(
            "mx-2 mt-1 flex items-center gap-1.5 text-xs font-medium",
            up && "text-[var(--danger)]",
            down && "text-[var(--ok)]"
          )}
        >
          {up && <TrendingUp className="size-3.5" />}
          {down && <TrendingDown className="size-3.5" />}
          <span className={cn(!up && !down && "text-muted-foreground")}>{visual.caption}</span>
        </div>
      )}
    </div>
  );
}

/** Day by day. More spending is worse, so the biggest day is the one picked out. */
function Series({ visual }: { visual: Visual }) {
  const peak = Math.max(...visual.points.map((p) => p.value ?? 0));
  const data = visual.points.map((p) => ({ ...p, short: shorten(p.label), peak: (p.value ?? 0) === peak }));
  return (
    <div className="px-1 pb-2">
      <Chart data={data} height={160} />
      <div className="mx-2 mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{visual.caption}</span>
        {visual.amount != null && (
          <span>
            total <span className="font-medium tabular-nums text-foreground/80">{formatINR(visual.amount)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

type Datum = VisualPoint & { short: string; peak?: boolean };

function Chart({ data, height }: { data: Datum[]; height: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
          <CartesianGrid vertical={false} stroke="currentColor" className="text-border" strokeDasharray="3 3" />
          <XAxis
            dataKey="short"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            tick={{ fontSize: 10, fill: "currentColor" }}
            className="text-muted-foreground"
          />
          <YAxis
            width={52}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10, fill: "currentColor" }}
            className="text-muted-foreground"
            tickFormatter={(v: number) => formatINR(v, { compact: true })}
          />
          <Tooltip
            cursor={{ fill: "color-mix(in oklab, var(--primary) 8%, transparent)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as Datum;
              return (
                <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                  <div className="font-medium">{d.label}</div>
                  <div className="tabular-nums" style={{ color: SPEND }}>{formatINR(d.value)}</div>
                  {d.note && <div className="text-muted-foreground">{d.note}</div>}
                </div>
              );
            }}
          />
          {/* No grow-in: the transcript re-renders on every new message, and old charts
              replaying themselves each time reads as a glitch rather than a flourish. */}
          <Bar dataKey="value" radius={[5, 5, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              // The worst day earns full weight; the rest recede so the shape reads at a glance.
              <Cell key={i} fill={SPEND} fillOpacity={d.peak === false ? 0.55 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A ranked list. With bars it is a breakdown; without, it is the purchases themselves. */
function Rows({ visual, showBars }: { visual: Visual; showBars: boolean }) {
  const biggest = Math.max(...visual.points.map((p) => Math.abs(p.value ?? 0)), 1);
  return (
    <div className="px-3 pb-2.5 pt-1.5">
      {visual.amount != null && (
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums tracking-tight" style={{ color: SPEND }}>
            {formatINR(visual.amount)}
          </span>
          {visual.caption && <span className="text-[11px] text-muted-foreground">{visual.caption}</span>}
        </div>
      )}
      <div className="space-y-1.5">
        {visual.points.map((p, i) => (
          <div key={`${p.label}-${i}`}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate">{p.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{formatINR(p.value)}</span>
            </div>
            {showBars && (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (Math.abs(p.value ?? 0) / biggest) * 100)}%`,
                    backgroundColor: SPEND,
                    opacity: 0.85,
                  }}
                />
              </div>
            )}
            {p.note && <div className="text-[11px] text-muted-foreground">{p.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Goals: how far along, not how much. Emerald, because this is progress rather than outgoings. */
function Progress({ visual }: { visual: Visual }) {
  return (
    <div className="space-y-2.5 px-3 pb-3 pt-2">
      {visual.points.map((p, i) => {
        const target = p.of ?? 0;
        const pct = target > 0 ? Math.min(100, Math.round(((p.value ?? 0) / target) * 100)) : 0;
        return (
          <div key={`${p.label}-${i}`}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate">{p.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">{formatINR(p.value)}</span> of {formatINR(target)}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: EARN }} />
            </div>
            <div className="mt-0.5 flex justify-between text-[11px] text-muted-foreground">
              <span>{pct}%</span>
              {p.note && <span>{p.note}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Axis labels have to fit. A period label carries its dates in brackets for the model's benefit —
 * on a chart the name alone is enough, and the tooltip still has the whole thing.
 */
function shorten(label: string): string {
  const withoutDates = label.replace(/\s*\(.*\)\s*$/, "").replace(/,.*$/, "");
  const flat = withoutDates.trim() || label;
  return flat.length > 18 ? flat.slice(0, 17) + "…" : flat;
}
