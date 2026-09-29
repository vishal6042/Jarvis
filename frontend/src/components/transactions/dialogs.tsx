import { useEffect, useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { applyRules, createRule, deleteRule, listRules, setTransactionCategory, type CategoryRule } from "@/api";
import type { Account, CreateTransactionRequest, Direction, Transaction } from "@/types";
import { formatDate, formatINR } from "@/lib/format";
import { localDay } from "@/lib/report";
import { isoDay } from "@/lib/forecast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NONE, categoryItems, categoryOptions } from "@/components/transactions/shared";

/** Thin wrapper over the themed Select for simple {value,label} lists. */
export function FilterSelect({
  value,
  onChange,
  items,
  width = "w-[160px]",
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  width?: string;
  label?: string;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange(v ?? items[0]?.value ?? "")}>
      <SelectTrigger className={width} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((it) => (
          <SelectItem key={it.value} value={it.value}>
            {it.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Inline category change, optionally remembered as a "merchant contains …" rule. */
export function QuickCategoryDialog({
  txn,
  categories,
  onClose,
  onSaved,
}: {
  txn: Transaction | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<string>("Uncategorized");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setValue(txn?.category ?? "Uncategorized");
    setRemember(false);
  }, [txn]);
  if (!txn) return null;
  const merchant = (txn.merchant ?? "").trim();
  async function save() {
    if (!txn) return;
    setBusy(true);
    try {
      await setTransactionCategory(txn.id, value);
      if (remember && merchant) {
        await createRule(merchant, value);
        await applyRules(true);
      }
      onClose();
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!txn} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Categorise</DialogTitle>
          <DialogDescription>
            {merchant || "This transaction"} · {formatINR(txn.amount)} on {formatDate(txn.occurredAt)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <FilterSelect value={value} onChange={setValue} items={categoryItems(categories)} width="w-full" />
          </div>
          {merchant && (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
              <span className="text-sm">
                <span className="font-medium">Always use this</span>
                <span className="block text-xs text-muted-foreground">
                  Creates a rule: merchant contains “{merchant}” → {value}. Applies to future alerts and to existing
                  uncategorised rows.
                </span>
              </span>
              <Switch checked={remember} onCheckedChange={setRemember} />
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy} className="gap-1">
            <Sparkles className="size-3.5" /> {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Manage "merchant contains …" rules and apply them to existing rows. */
export function RulesDialog({
  open,
  onOpenChange,
  categories,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: string[];
  onApplied: () => void;
}) {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("Food");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const load = () => listRules().then(setRules).catch(() => setRules([]));
  useEffect(() => {
    if (open) {
      load();
      setNote(null);
    }
  }, [open]);
  async function add() {
    if (!pattern.trim()) return;
    setBusy(true);
    try {
      await createRule(pattern.trim(), category);
      setPattern("");
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function apply(all: boolean) {
    setBusy(true);
    try {
      const n = await applyRules(!all);
      setNote(`${n} transaction${n === 1 ? "" : "s"} re-categorised.`);
      onApplied();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Category rules</DialogTitle>
          <DialogDescription>
            “Merchant contains …” rules beat the AI's guess for new alerts, and can be applied to what's already stored.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label className="text-xs text-muted-foreground">Merchant contains</Label>
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. SWIGGY" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <FilterSelect value={category} onChange={setCategory} items={categoryItems(categories)} width="w-[170px]" />
          </div>
          <Button onClick={add} disabled={busy || !pattern.trim()} className="gap-1">
            <Plus className="size-4" /> Add
          </Button>
        </div>
        <div className="space-y-1.5">
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rules yet. Tip: tick “Always use this” when you categorise a row.</p>
          ) : (
            rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="min-w-0 break-words">
                  contains <span className="font-medium">“{r.pattern}”</span> → <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.category}</span>
                </span>
                <Button variant="ghost" size="icon" className="size-7 text-rose-500" onClick={() => deleteRule(r.id).then(load)} aria-label="Delete rule">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
        {note && <p className="text-sm text-emerald-600 dark:text-emerald-400">{note}</p>}
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => apply(false)} disabled={busy || rules.length === 0}>
              Apply to uncategorised
            </Button>
            <Button variant="outline" onClick={() => apply(true)} disabled={busy || rules.length === 0} title="Overrides existing categories where a rule matches">
              Apply to all
            </Button>
          </div>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The editable fields of a transaction, as strings for the form. */
export interface Draft {
  id: number | null;
  direction: Direction;
  amount: string;
  occurredOn: string; // yyyy-MM-dd, local
  /** The row's own instant, kept when the day is not changed so an edit does not lose the time. */
  occurredAt: string | null;
  merchant: string;
  category: string;
  accountId: string; // "none" | account id
  note: string;
}

export const emptyDraft = (): Draft => ({
  id: null,
  direction: "DEBIT",
  amount: "",
  occurredOn: isoDay(new Date()),
  occurredAt: null,
  merchant: "",
  category: "",
  accountId: NONE,
  note: "",
});

export const draftOf = (t: Transaction): Draft => ({
  id: t.id,
  direction: t.direction,
  amount: String(t.amount),
  occurredOn: localDay(t),
  occurredAt: t.occurredAt,
  merchant: t.merchant ?? "",
  category: t.category ?? "",
  accountId: t.accountId != null ? String(t.accountId) : NONE,
  note: t.note ?? "",
});

/** The request a draft saves as; null when the amount is not a positive number. */
export function requestOf(d: Draft): CreateTransactionRequest | null {
  const amount = Number(d.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const sameDay = d.occurredAt != null && isoDay(new Date(d.occurredAt)) === d.occurredOn;
  return {
    amount,
    direction: d.direction,
    merchant: d.merchant.trim() || undefined,
    category: d.category || undefined,
    occurredAt: sameDay ? (d.occurredAt as string) : new Date(`${d.occurredOn}T00:00:00`).toISOString(),
    accountId: d.accountId === NONE ? undefined : Number(d.accountId),
    note: d.note.trim() || undefined,
  };
}

/** Add a transaction by hand, or correct an imported one. */
export function EditTransactionDialog({
  draft,
  accounts,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft | null;
  accounts: Account[];
  saving: boolean;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const editing = draft;
  return (
    <Dialog open={editing != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing?.id == null ? "Add transaction" : "Edit transaction"}</DialogTitle>
          <DialogDescription>Record income or an expense, or correct an imported row.</DialogDescription>
        </DialogHeader>
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <FilterSelect
                  value={editing.direction}
                  onChange={(v) => onChange({ ...editing, direction: v as Direction })}
                  items={[
                    { value: "DEBIT", label: "Expense" },
                    { value: "CREDIT", label: "Income" },
                  ]}
                  width="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.amount}
                  onChange={(e) => onChange({ ...editing, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <DatePicker value={editing.occurredOn} onChange={(v) => onChange({ ...editing, occurredOn: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <FilterSelect
                  value={editing.category || NONE}
                  onChange={(v) => onChange({ ...editing, category: v === NONE ? "" : v })}
                  items={[
                    { value: NONE, label: "Uncategorized" },
                    ...categoryOptions(editing.category).map((c) => ({ value: c, label: c })),
                  ]}
                  width="w-full"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="merchant">Merchant / description</Label>
              <Input
                id="merchant"
                value={editing.merchant}
                onChange={(e) => onChange({ ...editing, merchant: e.target.value })}
                placeholder="e.g. Swiggy, Salary, Rent"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account</Label>
              <FilterSelect
                value={editing.accountId}
                onChange={(v) => onChange({ ...editing, accountId: v })}
                items={[
                  { value: NONE, label: "No account" },
                  ...accounts.map((a) => ({ value: String(a.id), label: a.displayName })),
                ]}
                width="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Note</Label>
              <Input id="note" value={editing.note} onChange={(e) => onChange({ ...editing, note: e.target.value })} placeholder="Optional" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || !editing || !(Number(editing.amount) > 0)}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
