import { useState, type MouseEvent } from "react";
import { BellRing, CheckCircle2, Pencil, PiggyBank, Trash2 } from "lucide-react";
import StatusChip from "@/components/page/StatusChip";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import type { ApiGoal } from "@/lib/api/finance";
import { longDate, monthName, monthShort, type GoalRead } from "./plan";

const GOAL_COLOR = "var(--primary)";

/** One of the three small figures under a goal's bar. */
function Figure({ label, value, tone }: { label: string; value: string; tone?: "late" }) {
  return (
    // A row on a phone (label left, figure right), a small tile from sm up.
    <div
      className={`flex min-w-0 items-baseline justify-between gap-2 rounded-lg px-3 py-2 sm:block sm:py-2.5 ${
        tone === "late" ? "bg-rose-50 dark:bg-rose-500/10" : "bg-muted/60"
      }`}
    >
      <div className={`truncate text-xs ${tone === "late" ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground"}`}>{label}</div>
      <div className="truncate text-[15px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/**
 * A goal still being saved for: how far along it is, whether the money you keep each month gets it
 * there by its date, and the two things you can do about it. The card is also how a goal is picked
 * for the planner, so the whole card selects and the selected one is outlined.
 */
export function GoalCard({
  read,
  keep,
  selected,
  onSelect,
  onSeePlan,
  onAddMoney,
  onEdit,
  onDelete,
  onSetAside,
  reminderOn,
}: {
  read: GoalRead;
  keep: number;
  selected: boolean;
  onSelect: () => void;
  /** "See the plan": selects the goal and brings the planner into view where it sits below the cards. */
  onSeePlan: () => void;
  onAddMoney: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Offered when a monthly figure fits in what you keep; opens the confirmation for the reminder. */
  onSetAside?: (amount: number) => void;
  /** A monthly "Set aside for …" reminder already exists for this goal. */
  reminderOn: boolean;
}) {
  const { goal: g, state, needed, eta, overdue } = read;
  const target = g.targetDate ? new Date(`${g.targetDate}T00:00:00`) : null;
  const late = !!(eta && target && eta > target);
  const color = g.color ?? GOAL_COLOR;
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const neededText = needed != null ? formatINR(needed) : overdue ? "date passed" : "no date set";
  const keepText = keep > 0 ? `≈${formatINR(keep)}` : "nothing yet";
  const etaText = eta ? monthShort(eta) : "not moving";

  // For a goal that fits, say it the way a person would plan it: from next month, done by the date.
  const firstMonth = new Date();
  firstMonth.setDate(1);
  firstMonth.setMonth(firstMonth.getMonth() + 1);
  const fitsLine =
    state === "on-track" && needed && target
      ? `${formatINR(needed)} a month from ${monthName(firstMonth)} finishes it in ${monthName(target)}.` +
        (eta && eta < target ? ` At your pace it could be ${monthName(eta)}.` : "")
      : null;

  return (
    <article
      onClick={onSelect}
      className={`group flex min-w-0 cursor-pointer flex-col gap-3 rounded-2xl bg-card p-5 sm:p-6 ${
        selected ? "border-2 border-primary" : "border hover:border-primary/40"
      }`}
    >
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[17px] font-semibold">
          {/* The name is the keyboard way to pick the goal; a click anywhere on the card does the same. */}
          <button
            type="button"
            aria-pressed={selected}
            onClick={stop(onSelect)}
            className="max-w-full truncate rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {g.name}
          </button>
        </h3>
        <div className="flex gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <Button variant="ghost" size="icon-sm" onClick={stop(onEdit)} aria-label={`Edit ${g.name}`}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-rose-500 hover:text-rose-600" onClick={stop(onDelete)} aria-label={`Delete ${g.name}`}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        {state === "on-track" && <StatusChip tone="good">on track</StatusChip>}
        {state === "off-pace" && <StatusChip tone="urgent">{overdue ? "overdue" : "off pace"}</StatusChip>}
        {state === "undated" && <StatusChip tone="neutral">no date</StatusChip>}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="text-3xl font-semibold tabular-nums">{formatINR(g.savedAmount)}</span>
        <span className="text-[15px] text-muted-foreground">
          of {formatINR(g.targetAmount)}
          {target && ` · by ${longDate(target)}`}
        </span>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(read.pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(read.pct, read.pct > 0 ? 1 : 0)}%`, backgroundColor: color }} />
      </div>

      <div className="grid gap-1.5 text-[13px] sm:grid-cols-3 sm:gap-2">
        <Figure label="Needed a month" value={neededText} />
        <Figure label="You keep a month" value={keepText} />
        <Figure label="At this pace" value={etaText} tone={late || (state === "off-pace" && !eta) ? "late" : undefined} />
      </div>

      {fitsLine && <p className="text-[13px] text-muted-foreground">{fitsLine}</p>}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="gap-1.5" onClick={stop(onAddMoney)}>
          <PiggyBank className="size-4" /> Add money
        </Button>
        {reminderOn ? (
          <span className="inline-flex items-center gap-1.5 px-1 text-[13px] text-muted-foreground">
            <BellRing className="size-3.5" /> Monthly set-aside reminder on
          </span>
        ) : (
          onSetAside &&
          needed != null &&
          state === "on-track" && (
            <Button variant="outline" onClick={stop(() => onSetAside(needed))}>
              Set aside {formatINR(needed)} each month
            </Button>
          )
        )}
        {state === "off-pace" && (
          <Button variant="ghost" className="text-primary xl:hidden" onClick={stop(onSeePlan)}>
            See the plan
          </Button>
        )}
      </div>
    </article>
  );
}

/**
 * Finished goals, folded into one line at the bottom so they stop taking room from the ones still
 * being saved for; "View" opens them to edit or delete.
 */
export function ReachedGoals({ goals, onEdit, onDelete }: { goals: ApiGoal[]; onEdit: (g: ApiGoal) => void; onDelete: (g: ApiGoal) => void }) {
  const [open, setOpen] = useState(false);
  if (goals.length === 0) return null;
  const summary =
    goals.length === 1
      ? `${goals[0].name} · ${formatINR(goals[0].targetAmount)} reached`
      : `${goals.length} goals reached · ${formatINR(goals.reduce((s, g) => s + g.targetAmount, 0))}`;
  return (
    <section className="rounded-2xl border bg-card">
      <div className="flex items-center gap-3 px-5 py-4 text-sm">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="min-w-0 flex-1 truncate font-medium text-emerald-800 dark:text-emerald-300">{summary}</span>
        <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide" : "View"}
        </Button>
      </div>
      {open && (
        <ul className="divide-y border-t">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
              <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{formatINR(g.savedAmount)}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(g)} aria-label={`Edit ${g.name}`}>
                <Pencil className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" className="text-rose-500 hover:text-rose-600" onClick={() => onDelete(g)} aria-label={`Delete ${g.name}`}>
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
