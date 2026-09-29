import { useEffect, useMemo, useState } from "react";
import { Plus, Target } from "lucide-react";
import { listTransactions } from "@/api";
import type { Transaction } from "@/types";
import { useFinanceSummary } from "@/lib/finance";
import { useFamily, useInvestments, useReminders } from "@/lib/store";
import { monthlyNetSaving } from "@/lib/projection";
import { inferSalary, isoDay } from "@/lib/forecast";
import {
  contributeGoalApi,
  createGoal,
  deleteGoalApi,
  getGoals,
  updateGoalApi,
  type ApiGoal,
  type GoalPayload,
} from "@/lib/api/finance";
import { formatINR } from "@/lib/format";
import PageHeader from "@/components/page/PageHeader";
import AiLine from "@/components/page/AiLine";
import { GoalCard, ReachedGoals } from "@/components/goals/GoalCard";
import GoalPlanner from "@/components/goals/GoalPlanner";
import ForecastPanels from "@/components/goals/ForecastPanels";
import StepsDialog, { type PlanStep, type StepsRequest } from "@/components/goals/StepsDialog";
import {
  goalsTake,
  inWords,
  longDate,
  mostOffPace,
  nextOnDay,
  planOptions,
  readGoal,
  setAsideDay,
  setAsideTitle,
  upcomingPayouts,
  type FundedPlan,
} from "@/components/goals/plan";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const COLORS = ["#8b5cf6", "#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#14b8a6"];

interface Draft {
  id: number | null;
  name: string;
  targetAmount: string;
  savedAmount: string;
  targetDate: string;
  color: string;
  notes: string;
}

const emptyDraft = (): Draft => ({
  id: null,
  name: "",
  targetAmount: "",
  savedAmount: "",
  targetDate: "",
  color: COLORS[0],
  notes: "",
});

const payloadOf = (g: ApiGoal): GoalPayload => ({
  name: g.name,
  targetAmount: g.targetAmount,
  savedAmount: g.savedAmount,
  targetDate: g.targetDate ?? null,
  color: g.color ?? null,
  notes: g.notes ?? null,
});

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
};

/**
 * Goals: every goal against the money you actually keep each month, with a planner that works out
 * how to reach the one furthest off pace, using the deposits already maturing, and the longer
 * net-worth view below. "What you keep" is the forecast's own pace (median of the last three
 * months), so the goals and the forecast never disagree. Anything that changes data -- a new date,
 * a note, a monthly reminder -- is proposed as steps and only done once the user confirms them.
 */
export default function Goals() {
  const today = useMemo(() => new Date(), []);
  const { activeId, activeMember } = useFamily();
  const f = useFinanceSummary();
  const { items: investments } = useInvestments(activeId);
  const reminders = useReminders();

  const [goals, setGoals] = useState<ApiGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  useEffect(() => {
    listTransactions(0, 1000).then(setTxns).catch(() => setTxns([]));
  }, []);
  const pace = useMemo(() => monthlyNetSaving(txns ?? [], today), [txns, today]);
  const keep = pace.amount;
  const salary = useMemo(() => inferSalary(txns ?? [], today, activeMember.earns), [txns, today, activeMember.earns]);
  const payouts = upcomingPayouts(investments, today);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<ApiGoal | null>(null);
  const [contributeTo, setContributeTo] = useState<ApiGoal | null>(null);
  const [contribAmount, setContribAmount] = useState("");
  const [steps, setSteps] = useState<StepsRequest | null>(null);

  const reload = () => {
    setLoading(true);
    getGoals()
      .then(setGoals)
      .catch(() => setGoals([]))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const reads = useMemo(() => goals.map((g) => readGoal(g, keep, today)), [goals, keep, today]);
  const open = reads.filter((r) => r.state !== "reached");
  const reached = reads.filter((r) => r.state === "reached").map((r) => r.goal);
  // The planner opens on the goal picked, else the one furthest off pace; with every goal on track
  // and nothing picked there is nothing to plan, so it stays away.
  const plannerRead = open.find((r) => r.goal.id === selectedId) ?? mostOffPace(reads);
  const plannerCount = plannerRead ? planOptions(plannerRead, keep, payouts, today).count : 0;
  const ready = !loading && txns != null;
  const take = ready ? goalsTake(reads, keep, pace.basis, plannerRead ? { read: plannerRead, count: plannerCount } : null) : null;

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const keepPart =
    txns == null || pace.basis === 0 ? "" : keep > 0 ? ` · you keep about ${inWords(keep)} a month` : " · nothing left over a month lately";
  const subtitle = loading
    ? "Loading…"
    : goals.length === 0
      ? "Set a target and track your progress."
      : `${formatINR(totalSaved, { compact: true })} saved of ${formatINR(totalTarget, { compact: true })} across ${goals.length} goal${goals.length > 1 ? "s" : ""}${keepPart}`;

  const reminderFor = (g: ApiGoal) => reminders.items.find((r) => r.title === setAsideTitle(g) && r.repeat === "monthly");

  /** The monthly "Set aside for …" reminder as a step: a new one, or the existing one's amount changed. */
  function reminderStep(g: ApiGoal, amount: number): PlanStep {
    const title = setAsideTitle(g);
    const existing = reminderFor(g);
    if (existing) {
      return {
        id: "reminder",
        label: `Change the monthly “${title}” reminder to ${formatINR(amount)}`,
        detail: existing.amount ? `It is ${formatINR(existing.amount)} now.` : "It has no amount now.",
        run: () => reminders.update(existing.id, { amount }),
      };
    }
    const day = setAsideDay(salary);
    const on = nextOnDay(day, today);
    const why =
      salary.basis > 0
        ? `the day after your salary usually lands (around the ${ordinal(salary.dayOfMonth)})`
        : "as there is no salary pattern to follow yet";
    return {
      id: "reminder",
      label: `Add a monthly reminder: ${title}, ${formatINR(amount)}`,
      detail: `On the ${ordinal(day)} of each month from ${longDate(new Date(`${on}T00:00:00`))}, ${why}. It repeats until you remove it in Calendar.`,
      run: () =>
        reminders.add({
          title,
          date: on,
          type: "OTHER",
          amount,
          notes: `Monthly saving toward the “${g.name}” goal`,
          repeat: "monthly",
        }),
    };
  }

  function proposeSetAside(g: ApiGoal, amount: number) {
    setSteps({
      title: `Set aside for ${g.name}`,
      description: `${formatINR(amount)} a month reaches ${formatINR(g.targetAmount)}${g.targetDate ? ` by ${longDate(new Date(`${g.targetDate}T00:00:00`))}` : ""}.`,
      steps: [reminderStep(g, amount)],
    });
  }

  function proposePlan(g: ApiGoal, plan: FundedPlan) {
    // Both goal steps write the same draft, so the note step keeps a date the first step moved and
    // leaves the date alone when that step is unticked.
    const draft = payloadOf(g);
    const list: PlanStep[] = [];
    const newDate = isoDay(plan.by);
    if (!plan.keepsDate && newDate !== g.targetDate) {
      list.push({
        id: "date",
        label: `Move the target date${g.targetDate ? ` from ${longDate(new Date(`${g.targetDate}T00:00:00`))}` : ""} to ${longDate(plan.by)}`,
        detail: `The date the deposits and the monthly set-aside reach ${formatINR(g.targetAmount)} together.`,
        run: async () => {
          draft.targetDate = newDate;
          await updateGoalApi(g.id, draft);
        },
      });
    }
    if (!(g.notes ?? "").includes(plan.note)) {
      list.push({
        id: "note",
        label: `Note on the goal: “${plan.note}”`,
        detail: plan.used.map((p) => `${p.inv.name} ${p.inv.kind} ${formatINR(p.amount)}`).join(" · "),
        run: async () => {
          draft.notes = draft.notes ? `${draft.notes} · ${plan.note}` : plan.note;
          await updateGoalApi(g.id, draft);
        },
      });
    }
    if (plan.monthly > 0) list.push(reminderStep(g, plan.monthly));
    setSteps({
      title: `Use this plan for ${g.name}`,
      description: "Each change is listed on its own. Untick any you do not want; nothing changes until you confirm.",
      steps: list,
    });
  }

  function seePlan(id: number) {
    setSelectedId(id);
    // Below the cards on a narrow screen, so bring it up; beside them on a wide one it is already in view.
    requestAnimationFrame(() => document.getElementById("goal-planner")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function openAdd() {
    setEditing(emptyDraft());
  }
  function openEdit(g: ApiGoal) {
    setEditing({
      id: g.id,
      name: g.name,
      targetAmount: String(g.targetAmount),
      savedAmount: String(g.savedAmount),
      targetDate: g.targetDate ?? "",
      color: g.color ?? COLORS[0],
      notes: g.notes ?? "",
    });
  }

  async function save() {
    if (!editing) return;
    const target = Number(editing.targetAmount);
    if (!editing.name.trim() || !(target > 0)) return;
    const payload = {
      name: editing.name.trim(),
      targetAmount: target,
      savedAmount: Number(editing.savedAmount) || 0,
      targetDate: editing.targetDate || null,
      color: editing.color,
      notes: editing.notes.trim() || null,
    };
    setSaving(true);
    try {
      if (editing.id == null) await createGoal(payload);
      else await updateGoalApi(editing.id, payload);
      setEditing(null);
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function contribute() {
    if (!contributeTo) return;
    const amount = Number(contribAmount);
    if (!(amount > 0)) return;
    await contributeGoalApi(contributeTo.id, amount);
    setContributeTo(null);
    setContribAmount("");
    reload();
  }

  async function confirmDelete() {
    if (!toDelete) return;
    await deleteGoalApi(toDelete.id);
    setToDelete(null);
    reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Goals" subtitle={subtitle}>
        <Button onClick={openAdd} size="lg" className="gap-1.5">
          <Plus className="size-4" /> New goal
        </Button>
      </PageHeader>

      <AiLine loading={!take} text={take?.text ?? "Reading your goals…"} detail={take?.detail} />

      {!loading && goals.length === 0 ? (
        <section className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-card px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Target className="size-6" />
          </div>
          <div>
            <p className="font-medium">No goals yet</p>
            <p className="text-sm text-muted-foreground">Create a goal like “Emergency fund” or “Europe trip” and track it here.</p>
          </div>
          <Button onClick={openAdd} className="gap-1.5">
            <Plus className="size-4" /> New goal
          </Button>
        </section>
      ) : (
        !loading && (
          <div className={`grid items-start gap-5 ${plannerRead ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,540px)]" : ""}`}>
            <div className={`grid min-w-0 gap-4 ${plannerRead ? "" : "lg:grid-cols-2"}`}>
              {open.map((r) => (
                <GoalCard
                  key={r.goal.id}
                  read={r}
                  keep={keep}
                  selected={plannerRead?.goal.id === r.goal.id}
                  onSelect={() => setSelectedId(r.goal.id)}
                  onSeePlan={() => seePlan(r.goal.id)}
                  onAddMoney={() => setContributeTo(r.goal)}
                  onEdit={() => openEdit(r.goal)}
                  onDelete={() => setToDelete(r.goal)}
                  onSetAside={(amount) => proposeSetAside(r.goal, amount)}
                  reminderOn={!!reminderFor(r.goal)}
                />
              ))}
              {reached.length > 0 && (
                <div className="lg:col-span-full">
                  <ReachedGoals goals={reached} onEdit={openEdit} onDelete={setToDelete} />
                </div>
              )}
            </div>
            {plannerRead && (
              <GoalPlanner
                read={plannerRead}
                keep={keep}
                basis={pace.basis}
                payouts={payouts}
                reminderOn={!!reminderFor(plannerRead.goal)}
                onUsePlan={(plan) => proposePlan(plannerRead.goal, plan)}
                onSetAside={(amount) => proposeSetAside(plannerRead.goal, amount)}
                onAdjust={() => openEdit(plannerRead.goal)}
                today={today}
              />
            )}
          </div>
        )
      )}

      <ForecastPanels currentNetWorth={f.savings + f.investments} investments={f.investments} pace={pace} />

      <StepsDialog request={steps} onClose={() => setSteps(null)} onDone={reload} />

      {/* Add / edit dialog */}
      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id == null ? "New goal" : "Edit goal"}</DialogTitle>
            <DialogDescription>Track progress toward a savings target.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Goal name</Label>
                <Input
                  id="name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Emergency fund"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="target">Target (₹)</Label>
                  <Input
                    id="target"
                    type="number"
                    min="0"
                    value={editing.targetAmount}
                    onChange={(e) => setEditing({ ...editing, targetAmount: e.target.value })}
                    placeholder="100000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="saved">Saved so far (₹)</Label>
                  <Input
                    id="saved"
                    type="number"
                    min="0"
                    value={editing.savedAmount}
                    onChange={(e) => setEditing({ ...editing, savedAmount: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Target date (optional)</Label>
                <DatePicker value={editing.targetDate} onChange={(v) => setEditing({ ...editing, targetDate: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>Colour</Label>
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditing({ ...editing, color: c })}
                      className={`size-7 rounded-full transition-transform ${editing.color === c ? "ring-2 ring-offset-2 ring-offset-background" : ""}`}
                      style={{ backgroundColor: c, ...(editing.color === c ? { boxShadow: `0 0 0 2px ${c}` } : {}) }}
                      aria-label={`Colour ${c}`}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !editing || !editing.name.trim() || !(Number(editing.targetAmount) > 0)}>
              {saving ? "Saving…" : "Save goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contribute dialog */}
      <Dialog
        open={contributeTo != null}
        onOpenChange={(o) => {
          if (!o) {
            setContributeTo(null);
            setContribAmount("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add money</DialogTitle>
            <DialogDescription>{contributeTo ? `Contribute toward “${contributeTo.name}”.` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="contrib">Amount (₹)</Label>
            <Input
              id="contrib"
              type="number"
              min="0"
              autoFocus
              value={contribAmount}
              onChange={(e) => setContribAmount(e.target.value)}
              placeholder="5000"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setContributeTo(null);
                setContribAmount("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={contribute} disabled={!(Number(contribAmount) > 0)}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete != null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete goal?"
        description={toDelete ? `“${toDelete.name}” will be permanently removed.` : undefined}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
