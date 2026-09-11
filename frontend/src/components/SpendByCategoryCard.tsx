import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { hierarchy, pack } from "d3-hierarchy";
import {
  ArrowDownRight,
  ArrowUpRight,
  Car,
  ChartPie,
  ChevronRight,
  Clapperboard,
  Eye,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Lock,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Shuffle,
  Sparkles,
  Tag,
  Utensils,
  Zap,
} from "lucide-react";
import CardArt from "@/components/CardArt";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compareCategories, type NamedValue } from "@/lib/analytics";
import { formatINR } from "@/lib/format";
import { PERIOD_LABEL, type Period } from "@/lib/sample";
import { periodLabel, periodWindow } from "@/lib/txnseries";

type IconType = typeof Tag;

interface Bubble {
  name: string;
  value: number;
  color: string;
  children?: Bubble[];
}

/** Colour slot per known category, so a category keeps its colour when another period re-ranks the list. */
const CATEGORY_SLOT: Record<string, number> = {
  "Loan EMI": 1,
  "Bills & Utilities": 2,
  Shopping: 3,
  Food: 4,
  Groceries: 5,
  Transport: 6,
  Entertainment: 7,
  Health: 8,
};
const SLOTS = 8;
const OTHER = "var(--cat-other)";
// Past eight bubbles there are no hues left, so the tail folds into "Other".
const BUBBLE_LIMIT = 8;
// Bubbles are laid out in a 100-unit square and drawn in cqw (1% of the square's width), so they scale with it.
const BUBBLE_BOX = 100;

/** Commitments that come round whatever you do; everything else counts as variable spend. */
const FIXED = new Set(["Loan EMI", "Bills & Utilities", "Rent", "Insurance"]);

const ICONS: Record<string, IconType> = {
  "Loan EMI": Landmark,
  "Bills & Utilities": Zap,
  Shopping: ShoppingBag,
  Food: Utensils,
  Groceries: ShoppingCart,
  Transport: Car,
  Entertainment: Clapperboard,
  Health: HeartPulse,
  Rent: House,
  Travel: Plane,
  Education: GraduationCap,
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const joinNames = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * Colour for each category in a view, given biggest first. Known categories always get their own slot;
 * anything else takes the first slot no known category on screen is using, and grey once all eight are used.
 */
export function categoryColors(names: string[]): Map<string, string> {
  const taken = new Set<number | undefined>(names.map((n) => CATEGORY_SLOT[n]));
  const out = new Map<string, string>();
  let free = 1;
  for (const name of names) {
    let slot: number | undefined = CATEGORY_SLOT[name];
    if (slot === undefined) {
      while (free <= SLOTS && taken.has(free)) free++;
      if (free <= SLOTS) {
        slot = free;
        taken.add(free);
      }
    }
    out.set(name, slot === undefined ? OTHER : `var(--cat-${slot})`);
  }
  return out;
}

/** Spend by category for the page's period: packed bubbles, the full table, fixed vs variable, and a why. */
export default function SpendByCategoryCard({
  now,
  prev,
  period,
  offset,
  compareLabel,
  onSelect,
}: {
  now: NamedValue[];
  /** Totals to compare against, and what they cover (e.g. "1–12 Aug" while this month is still running). */
  prev: NamedValue[];
  compareLabel: string;
  period: Period;
  offset: number;
  onSelect: (category: string) => void;
}) {
  const navigate = useNavigate();
  const [hover, setHover] = useState<string | null>(null);

  const cmp = useMemo(() => compareCategories(now, prev), [now, prev]);
  const { rows, bubbles } = useMemo(() => {
    const pctByName = new Map(cmp.rows.map((r) => [r.name, r.pct]));
    const sorted = now.filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
    const shown = sorted.length > BUBBLE_LIMIT ? sorted.slice(0, BUBBLE_LIMIT - 1) : sorted;
    const colors = categoryColors(shown.map((c) => c.name));
    const rows = sorted.map((c) => ({
      name: c.name,
      value: c.value,
      pct: pctByName.get(c.name) ?? null,
      color: colors.get(c.name) ?? OTHER,
    }));
    const leaves: Bubble[] = rows.slice(0, shown.length).map((r) => ({ name: r.name, value: r.value, color: r.color }));
    const rest = rows.slice(shown.length).reduce((s, r) => s + r.value, 0);
    if (rest > 0) leaves.push({ name: "Other", value: rest, color: OTHER });
    if (leaves.length === 0) return { rows, bubbles: [] };
    // A bubble's area is its spend; d3 packs them, biggest first, into the square.
    const root = pack<Bubble>()
      .size([BUBBLE_BOX, BUBBLE_BOX])
      .padding(1.5)(hierarchy<Bubble>({ name: "", value: 0, color: "", children: leaves }).sum((d) => (d.children ? 0 : d.value)));
    return { rows, bubbles: root.leaves().map((l) => ({ name: l.data.name, value: l.data.value, color: l.data.color, x: l.x, y: l.y, r: l.r })) };
  }, [now, cmp]);

  const total = cmp.totalNow;
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const max = rows[0]?.value ?? 0;
  const fixedRows = rows.filter((r) => FIXED.has(r.name));
  const fixedTotal = fixedRows.reduce((s, r) => s + r.value, 0);
  const fixedShare = share(fixedTotal);
  const hasPrev = cmp.totalPrev > 0;
  const unit = PERIOD_LABEL[period].toLowerCase();
  const inProgress = offset === 0;

  const topVariable = rows.find((r) => !FIXED.has(r.name));
  const riser = hasPrev ? cmp.rows.find((r) => r.delta >= 1000 && r.name !== topVariable?.name) : undefined;
  const insights: ReactNode[] = [];
  if (fixedTotal > 0) {
    insights.push(
      <>
        <Strong>{fixedShare}%</Strong> of your spending {inProgress ? `this ${unit} so far` : `in ${periodLabel(period, offset)}`} is
        on fixed costs ({joinNames(fixedRows.map((r) => r.name))}).
      </>,
    );
  }
  if (topVariable) {
    const p = topVariable.pct;
    const vs = !hasPrev
      ? ""
      : p == null
        ? `, new since ${compareLabel}`
        : p === 0
          ? `, level with ${compareLabel}`
          : `, ${Math.abs(p)}% ${p > 0 ? "more" : "less"} than ${compareLabel}`;
    insights.push(
      <>
        Your largest discretionary spend is <Strong>{topVariable.name}</Strong> at <Strong>{formatINR(topVariable.value)}</Strong>
        {vs}.
      </>,
    );
  }
  if (riser) {
    insights.push(
      <>
        <Strong>{riser.name}</Strong> grew the most: up {formatINR(riser.delta)} on {compareLabel}.
      </>,
    );
  }

  const { from, to } = periodWindow(period, offset);
  // Each row is its own grid, so fixed widths keep them aligned; only the bar stretches. Mobile drops the bar
  // and share columns, and the templates must list the same visible cells.
  const cols =
    "grid-cols-[minmax(0,1fr)_auto_4.5rem_1rem] sm:grid-cols-[10.5rem_minmax(3rem,1fr)_5.5rem_2.75rem_5.5rem_1rem]";

  return (
    <Card className="@container/spend relative isolate overflow-hidden">
      <CardArt color="#8b5cf6" subtle />
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ChartPie className="size-5" />
          </div>
          <div>
            <CardTitle>Spend by category</CardTitle>
            <CardDescription>{periodLabel(period, offset)} · click a bubble or a row to see every expenditure</CardDescription>
          </div>
        </div>
        {hasPrev && (
          <div className="sm:text-right">
            <PctDelta pct={cmp.pct} hasPrev className="text-lg font-semibold" />
            <p className="text-xs text-muted-foreground">
              vs {compareLabel} · {formatINR(Math.abs(cmp.delta))} {cmp.delta > 0 ? "more" : "less"}
            </p>
          </div>
        )}
      </CardHeader>

      {/* Laid out by the card's own width. The bubbles and the insight column stop growing at a cap and the table
          takes whatever is left; 33rem is the narrowest its fixed columns fit in. */}
      <CardContent className="grid gap-6 @4xl/spend:grid-cols-[minmax(240px,340px)_minmax(33rem,1fr)] @7xl/spend:grid-cols-[minmax(240px,360px)_minmax(33rem,1fr)_minmax(260px,400px)]">
        <div className="mx-auto flex w-full max-w-[360px] flex-col items-center gap-2 self-center">
          {/* Mouse-only picture of the table beside it, which is the exact and keyboard-reachable version. */}
          <div className="@container relative aspect-square w-full" aria-hidden>
            {bubbles.map((b) => {
              const Icon = ICONS[b.name] ?? Tag;
              const clickable = b.name !== "Other";
              const outlined = b.r >= 3;
              // Half the hit target: the bubble itself, but never under 24px across.
              const hitHalf = `max(12px, ${b.r}cqw)`;
              return (
                <div
                  key={b.name}
                  title={`${b.name}: ${formatINR(b.value)} (${share(b.value)}%)`}
                  onClick={() => clickable && onSelect(b.name)}
                  onMouseEnter={() => setHover(b.name)}
                  onMouseLeave={() => setHover(null)}
                  className={`absolute flex items-center justify-center transition-all duration-500 ease-out motion-reduce:transition-none ${
                    clickable ? "cursor-pointer" : ""
                  }`}
                  style={{
                    left: `calc(${b.x}cqw - ${hitHalf})`,
                    top: `calc(${b.y}cqw - ${hitHalf})`,
                    width: `calc(2 * ${hitHalf})`,
                    height: `calc(2 * ${hitHalf})`,
                    opacity: hover && hover !== b.name ? 0.35 : 1,
                  }}
                >
                  <span
                    className={`flex animate-in flex-col items-center justify-center rounded-full leading-tight transition-colors duration-500 zoom-in-50 fade-in motion-reduce:animate-none ${
                      outlined ? "border-2" : ""
                    }`}
                    style={{
                      width: `${b.r * 2}cqw`,
                      height: `${b.r * 2}cqw`,
                      borderColor: b.color,
                      backgroundColor: outlined
                        ? `color-mix(in oklab, ${b.color} ${hover === b.name ? 40 : 22}%, transparent)`
                        : b.color,
                    }}
                  >
                    {b.r >= 6 && <Icon size={b.r >= 23 ? 20 : b.r >= 11 ? 16 : 12} style={{ color: b.color }} />}
                    {b.r >= 23 && <span className="mt-1 text-xs font-medium">{b.name}</span>}
                    {b.r >= 11 && <span className="text-[11px] text-muted-foreground tabular-nums">{share(b.value)}%</span>}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-center leading-tight">
            <span className="block text-lg font-bold tracking-tight">{formatINR(total)}</span>
            <span className="text-xs text-muted-foreground">spent · bubble area is its share</span>
          </p>
        </div>

        {/* The table is the bubbles' legend, and carries every value in full. */}
        <div className="min-w-0 self-center">
          <div className={`grid ${cols} items-center gap-x-3 border-b px-2 pb-2 text-xs text-muted-foreground`}>
            <span>Category</span>
            <span className="hidden sm:block" />
            <span className="text-right">Amount</span>
            <span className="hidden text-right sm:block">Share</span>
            <span className="text-right" title={`Compared with ${compareLabel}`}>
              vs prev {unit}
            </span>
            <span />
          </div>
          <div className="mt-1 space-y-0.5">
            {rows.map((r) => {
              const Icon = ICONS[r.name] ?? Tag;
              return (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => onSelect(r.name)}
                  onMouseEnter={() => setHover(r.name)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(r.name)}
                  onBlur={() => setHover(null)}
                  className={`grid w-full ${cols} items-center gap-x-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60 focus-visible:outline-none ${
                    hover === r.name ? "bg-accent/60" : ""
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `color-mix(in oklab, ${r.color} 18%, transparent)`, color: r.color }}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="truncate font-medium">{r.name}</span>
                  </span>
                  <span className="hidden h-1.5 overflow-hidden rounded-full bg-muted sm:block">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${max > 0 ? Math.max(2, (r.value / max) * 100) : 0}%`, backgroundColor: r.color }}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{formatINR(r.value)}</span>
                  <span className="hidden text-right text-muted-foreground tabular-nums sm:block">{share(r.value)}%</span>
                  <span className="text-right text-xs">
                    <PctDelta pct={r.pct} hasPrev={hasPrev} />
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid content-start gap-3 self-center sm:grid-cols-2 @4xl/spend:col-span-2 @7xl/spend:col-span-1 @7xl/spend:grid-cols-1">
          <div className="grid grid-cols-2 gap-3">
            <SplitTile
              icon={Lock}
              label="Fixed"
              value={fixedTotal}
              share={fixedShare}
              color="var(--primary)"
              title={fixedRows.length ? fixedRows.map((r) => r.name).join(", ") : "No fixed costs this period"}
            />
            <SplitTile
              icon={Shuffle}
              label="Variable"
              value={total - fixedTotal}
              share={total > 0 ? 100 - fixedShare : 0}
              color="var(--muted-foreground)"
              title="Everything that isn't a fixed commitment"
            />
          </div>
          <div className="rounded-xl border bg-background/40 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" /> Jarvis insight
            </p>
            <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {insights.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => navigate(`/transactions?from=${localDay(from)}&to=${localDay(to)}&type=DEBIT`)}
            >
              <Eye className="size-3.5" /> View these transactions <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

/** % change in spend: up is bad (red, rising arrow), down is good (green, falling arrow). */
function PctDelta({ pct, hasPrev, className = "" }: { pct: number | null; hasPrev: boolean; className?: string }) {
  if (!hasPrev) return <span className={`text-muted-foreground ${className}`}>—</span>;
  if (pct == null) return <span className={`text-muted-foreground ${className}`}>new</span>;
  if (pct === 0) return <span className={`text-muted-foreground tabular-nums ${className}`}>0%</span>;
  const up = pct > 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 tabular-nums ${className}`}
      style={{ color: up ? "var(--danger)" : "var(--ok)" }}
    >
      <Arrow className="size-3.5" />
      {up ? "+" : "−"}
      {Math.abs(pct)}%
    </span>
  );
}

function SplitTile({
  icon: Icon,
  label,
  value,
  share,
  color,
  title,
}: {
  icon: IconType;
  label: string;
  value: number;
  share: number;
  color: string;
  title: string;
}) {
  return (
    <div className="rounded-xl border bg-background/40 p-3" title={title}>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className="flex size-6 items-center justify-center rounded-md"
          style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
        >
          <Icon className="size-3.5" />
        </span>
        {label}
      </p>
      <p className="mt-2 text-xl font-bold tracking-tight">{formatINR(value)}</p>
      <p className="text-xs text-muted-foreground">{share}% of total</p>
    </div>
  );
}
