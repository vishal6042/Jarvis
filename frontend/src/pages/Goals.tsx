import { useEffect, useState } from "react";
import { Pencil, Plus, PiggyBank, Target, Trash2 } from "lucide-react";
import {
  contributeGoalApi,
  createGoal,
  deleteGoalApi,
  getGoals,
  updateGoalApi,
  type ApiGoal,
} from "@/lib/api/finance";
import { formatINR } from "@/lib/format";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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

/** Months between now and a yyyy-MM-dd target (min 1), for the "save ₹X/mo" hint. */
function monthsUntil(date?: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  const now = new Date();
  const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return months <= 0 ? null : months;
}

export default function Goals() {
  const [goals, setGoals] = useState<ApiGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<ApiGoal | null>(null);
  const [contributeTo, setContributeTo] = useState<ApiGoal | null>(null);
  const [contribAmount, setContribAmount] = useState("");

  const reload = () => {
    setLoading(true);
    getGoals()
      .then(setGoals)
      .catch(() => setGoals([]))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Savings goals</h1>
          <p className="text-muted-foreground">
            {loading
              ? "Loading…"
              : goals.length === 0
                ? "Set a target and track your progress."
                : `${formatINR(totalSaved)} saved of ${formatINR(totalTarget)} across ${goals.length} goal${goals.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="size-4" /> New goal
        </Button>
      </div>

      {!loading && goals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Target className="size-6" />
            </div>
            <div>
              <p className="font-medium">No goals yet</p>
              <p className="text-sm text-muted-foreground">
                Create a goal like “Emergency fund” or “Europe trip” and track it here.
              </p>
            </div>
            <Button onClick={openAdd} className="gap-2">
              <Plus className="size-4" /> New goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => {
            const color = g.color ?? COLORS[0];
            const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100)) : 0;
            const remaining = Math.max(0, g.targetAmount - g.savedAmount);
            const months = monthsUntil(g.targetDate);
            const perMonth = months && remaining > 0 ? Math.ceil(remaining / months) : null;
            const done = pct >= 100;
            return (
              <Card key={g.id} className="group relative overflow-hidden">
                <span className="absolute top-0 left-0 h-full w-1.5" style={{ backgroundColor: color }} />
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{g.name}</div>
                      {g.targetDate && (
                        <div className="text-xs text-muted-foreground">
                          by {new Date(`${g.targetDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(g)} aria-label="Edit">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-rose-500 hover:text-rose-600"
                        onClick={() => setToDelete(g)}
                        aria-label="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold tracking-tight">{formatINR(g.savedAmount)}</span>
                    <span className="text-sm text-muted-foreground">of {formatINR(g.targetAmount)}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium" style={{ color }}>
                      {pct}%
                    </span>
                    {done ? (
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">Reached 🎉</span>
                    ) : (
                      <span className="text-muted-foreground">
                        {formatINR(remaining)} to go{perMonth ? ` · ${formatINR(perMonth)}/mo` : ""}
                      </span>
                    )}
                  </div>

                  {!done && (
                    <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setContributeTo(g)}>
                      <PiggyBank className="size-4" /> Add money
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
