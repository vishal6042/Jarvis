import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Copy, ListChecks, Pencil, Plus, Search, Sparkles, Trash2, Wand2 } from "lucide-react";
import { applyRules, createRule, deleteRule, listDuplicates, listRules, setTransactionCategory, type CategoryRule } from "@/api";
import { Switch } from "@/components/ui/switch";
import CardArt from "@/components/CardArt";
import {
  createTransaction,
  deleteTransaction,
  listAccounts,
  listTransactions,
  updateTransaction,
} from "@/api";
import type { Account, CreateTransactionRequest, Direction, Transaction } from "@/types";
import { CATEGORIES } from "@/lib/sample";
import { formatINR, formatDate } from "@/lib/format";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;
const NONE = "none"; // Select sentinel for "no account"

/** Category options = the standard set + Card Payment, with the row's own value folded in. */
function categoryOptions(current?: string | null): string[] {
  const base = [...CATEGORIES, "Card Payment"];
  return current && !base.includes(current) ? [current, ...base] : base;
}

const isoDay = (iso: string) => iso.slice(0, 10); // ISO instant → yyyy-MM-dd

interface Draft {
  id: number | null;
  direction: Direction;
  amount: string;
  occurredOn: string; // yyyy-MM-dd
  merchant: string;
  category: string;
  accountId: string; // "none" | account id
  note: string;
}

const emptyDraft = (): Draft => ({
  id: null,
  direction: "DEBIT",
  amount: "",
  occurredOn: new Date().toISOString().slice(0, 10),
  merchant: "",
  category: "",
  accountId: NONE,
  note: "",
});

export default function Transactions() {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // filters — seeded from the URL so other pages can deep-link (e.g. ?month=2026-09&category=Food)
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [dir, setDir] = useState<"all" | Direction>((params.get("type") as Direction | null) ?? "all");
  const [cat, setCat] = useState<string>(params.get("category") ?? "all");
  const [acct, setAcct] = useState<string>(params.get("account") ?? "all");
  const [month, setMonth] = useState<string>(params.get("month") ?? "all"); // "all" | "YYYY-MM"
  const [review, setReview] = useState(params.get("review") === "1"); // only rows needing attention
  const [dups, setDups] = useState<Transaction[][]>([]);
  const [quick, setQuick] = useState<Transaction | null>(null); // inline category dialog
  const [rulesOpen, setRulesOpen] = useState(false);
  const [page, setPage] = useState(0);

  // dialogs
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);

  const reload = () => {
    setLoading(true);
    Promise.all([listTransactions(0, 1000), listAccounts()])
      .then(([t, a]) => {
        setTxns(t);
        setAccounts(a);
      })
      .finally(() => listDuplicates().then(setDups).catch(() => setDups([])))
      .catch(() => {
        setTxns([]);
        setAccounts([]);
      })
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    txns.forEach((t) => t.category && set.add(t.category));
    return Array.from(set).sort();
  }, [txns]);

  // Months present in the data, newest first — drives the month filter.
  const months = useMemo(() => {
    const set = new Set<string>();
    txns.forEach((t) => set.add(t.occurredAt.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [txns]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txns.filter((t) => {
      if (review && !needsReview(t)) return false;
      if (month !== "all" && !t.occurredAt.startsWith(month)) return false;
      if (dir !== "all" && t.direction !== dir) return false;
      if (cat !== "all" && (t.category ?? "") !== cat) return false;
      if (acct !== "all" && String(t.accountId ?? "") !== acct) return false;
      if (needle) {
        const hay = `${t.merchant ?? ""} ${t.category ?? ""} ${t.note ?? ""} ${t.accountName ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [txns, q, dir, cat, acct, month, review]);
  const reviewCount = useMemo(() => txns.filter(needsReview).length, [txns]);

  // reset to first page whenever the filter set changes
  useEffect(() => setPage(0), [q, dir, cat, acct, month, review]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const dirItems = [
    { value: "all", label: "All types" },
    { value: "CREDIT", label: "Income" },
    { value: "DEBIT", label: "Expense" },
  ];
  const catItems = [{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))];
  const acctItems = [
    { value: "all", label: "All accounts" },
    ...accounts.map((a) => ({ value: String(a.id), label: a.displayName })),
  ];
  const monthItems = [
    { value: "all", label: "All months" },
    ...months.map((m) => ({
      value: m,
      label: new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
    })),
  ];

  function openAdd() {
    setEditing(emptyDraft());
  }
  function openEdit(t: Transaction) {
    setEditing({
      id: t.id,
      direction: t.direction,
      amount: String(t.amount),
      occurredOn: isoDay(t.occurredAt),
      merchant: t.merchant ?? "",
      category: t.category ?? "",
      accountId: t.accountId != null ? String(t.accountId) : NONE,
      note: t.note ?? "",
    });
  }

  async function save() {
    if (!editing) return;
    const amount = Number(editing.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const req: CreateTransactionRequest = {
      amount,
      direction: editing.direction,
      merchant: editing.merchant.trim() || undefined,
      category: editing.category || undefined,
      occurredAt: new Date(`${editing.occurredOn}T00:00:00`).toISOString(),
      accountId: editing.accountId === NONE ? undefined : Number(editing.accountId),
      note: editing.note.trim() || undefined,
    };
    setSaving(true);
    try {
      if (editing.id == null) await createTransaction(req);
      else await updateTransaction(editing.id, req);
      setEditing(null);
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    await deleteTransaction(toDelete.id);
    setToDelete(null);
    reload();
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">
            {loading ? "Loading…" : `${filtered.length} of ${txns.length} transactions`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={review ? "default" : "outline"}
            onClick={() => setReview((v) => !v)}
            className="gap-2"
            title="Uncategorised or unlinked rows, and probable duplicates"
          >
            <ListChecks className="size-4" /> Review{reviewCount + dups.length > 0 ? ` (${reviewCount + dups.length})` : ""}
          </Button>
          <Button variant="outline" onClick={() => setRulesOpen(true)} className="gap-2">
            <Wand2 className="size-4" /> Rules
          </Button>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="size-4" /> Add transaction
          </Button>
        </div>
      </div>

      <QuickCategoryDialog
        txn={quick}
        categories={categories}
        onClose={() => setQuick(null)}
        onSaved={reload}
      />
      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} categories={categories} onApplied={reload} />

      {review && dups.length > 0 && (
        <Card className="relative isolate overflow-hidden">
          <CardArt color="#f59e0b" subtle />
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center gap-2">
              <Copy className="size-4 text-amber-500" />
              <span className="font-medium">Probable duplicates</span>
              <span className="text-sm text-muted-foreground">
                same day, amount and direction — usually a statement row and an SMS row for one purchase. Delete the one you don't want.
              </span>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {dups.map(([a, b]) => (
                <div key={`${a.id}-${b.id}`} className="rounded-lg border p-2 text-sm">
                  {[a, b].map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 py-1">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{t.merchant ?? "—"}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {formatDate(t.occurredAt)} · {t.category ?? "—"} · {t.accountName ?? "no account"} · {t.source}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{formatINR(t.amount)}</span>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-rose-500" onClick={() => setToDelete(t)}>
                          <Trash2 className="size-3.5" /> Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search merchant, category, note…"
            className="pl-9"
          />
        </div>
        <FilterSelect value={month} onChange={setMonth} items={monthItems} width="w-[150px]" />
        <FilterSelect value={dir} onChange={(v) => setDir(v as "all" | Direction)} items={dirItems} width="w-[150px]" />
        <FilterSelect value={cat} onChange={setCat} items={catItems} width="w-[180px]" />
        <FilterSelect value={acct} onChange={setAcct} items={acctItems} width="w-[190px]" />
      </div>

      <Card className="relative isolate overflow-hidden">
        <CardArt color="var(--primary)" subtle />
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm font-medium">No transactions found</p>
              <p className="text-sm text-muted-foreground">
                {txns.length === 0 ? "Add one or import a statement to get started." : "Try clearing your filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[90px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((t) => {
                    const income = t.direction === "CREDIT";
                    return (
                      <TableRow key={t.id} className="group">
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(t.occurredAt)}</TableCell>
                        <TableCell className="font-medium">{t.merchant ?? "—"}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setQuick(t)}
                            title="Change category"
                            className={`rounded-full px-2 py-0.5 text-xs transition-colors hover:ring-1 hover:ring-primary/50 ${
                              !t.category || t.category === "Uncategorized"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                : "bg-muted"
                            }`}
                          >
                            {t.category ?? "Uncategorized"}
                          </button>
                          {t.settlement && <span className="ml-1 text-[10px] text-muted-foreground">bill payment</span>}
                          {t.transfer && <span className="ml-1 text-[10px] text-muted-foreground">transfer</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{t.accountName ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                              income ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                            }`}
                          >
                            {income ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                            {formatINR(t.amount)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(t)} aria-label="Edit">
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-rose-500 hover:text-rose-600"
                              onClick={() => setToDelete(t)}
                              aria-label="Delete"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onChange={setPage} />}

      {/* Add / edit dialog */}
      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
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
                    onChange={(v) => setEditing({ ...editing, direction: v as Direction })}
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
                    onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <DatePicker value={editing.occurredOn} onChange={(v) => setEditing({ ...editing, occurredOn: v })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <FilterSelect
                    value={editing.category || NONE}
                    onChange={(v) => setEditing({ ...editing, category: v === NONE ? "" : v })}
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
                  onChange={(e) => setEditing({ ...editing, merchant: e.target.value })}
                  placeholder="e.g. Swiggy, Salary, Rent"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Account</Label>
                <FilterSelect
                  value={editing.accountId}
                  onChange={(v) => setEditing({ ...editing, accountId: v })}
                  items={[
                    { value: NONE, label: "No account" },
                    ...accounts.map((a) => ({ value: String(a.id), label: a.displayName })),
                  ]}
                  width="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="note">Note</Label>
                <Input
                  id="note"
                  value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !editing || !(Number(editing.amount) > 0)}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete != null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete transaction?"
        description={
          toDelete
            ? `${toDelete.merchant ?? "This transaction"} · ${formatINR(toDelete.amount)} will be permanently removed.`
            : undefined
        }
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/** Rows worth a look: no category / Uncategorized, or not linked to an account. */
function needsReview(t: Transaction): boolean {
  if (t.transfer || t.settlement) return false;
  return !t.category || t.category === "Uncategorized" || t.accountId == null;
}

const FIXED_CATEGORIES = ["Card Payment", "Loan EMI", "Transfers", "Income", "Uncategorized"];
function categoryItems(seen: string[]): { value: string; label: string }[] {
  const all = Array.from(new Set([...CATEGORIES, ...seen, ...FIXED_CATEGORIES]));
  return all.map((c) => ({ value: c, label: c }));
}

/** Inline category change, optionally remembered as a "merchant contains …" rule. */
function QuickCategoryDialog({
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
function RulesDialog({
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
        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-1.5">
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
              <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>
                  contains <span className="font-medium">“{r.pattern}”</span> → <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.category}</span>
                </span>
                <Button variant="ghost" size="icon" className="size-7 text-rose-500" onClick={() => deleteRule(r.id).then(load)} aria-label="Delete rule">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
        {note && <p className="text-sm text-emerald-500">{note}</p>}
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
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

/**
 * Centred pager: first / prev, a sliding window of five page numbers with ellipses, next / last.
 * Kept clear of the floating assistant button (the page adds bottom padding).
 */
function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (p: number) => void }) {
  const total = pageCount;
  const current = page + 1; // 1-based for display
  let start = Math.max(1, current - 2);
  let end = Math.min(total, start + 4);
  start = Math.max(1, end - 4);
  const pages: (number | "…")[] = [];
  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push("…");
  }
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total) {
    if (end < total - 1) pages.push("…");
    pages.push(total);
  }
  const go = (p: number) => onChange(Math.min(total, Math.max(1, p)) - 1);
  const btn = "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm transition-colors disabled:opacity-40";
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="Pagination">
      <button type="button" className={btn} onClick={() => go(1)} disabled={current === 1} aria-label="First page">«</button>
      <button type="button" className={btn} onClick={() => go(current - 1)} disabled={current === 1} aria-label="Previous page">‹</button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-sm text-muted-foreground">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => go(p)}
            aria-current={p === current ? "page" : undefined}
            className={`${btn} ${p === current ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" className={btn} onClick={() => go(current + 1)} disabled={current === total} aria-label="Next page">›</button>
      <button type="button" className={btn} onClick={() => go(total)} disabled={current === total} aria-label="Last page">»</button>
      <span className="ml-3 text-xs text-muted-foreground">Page {current} of {total}</span>
    </nav>
  );
}

/** Thin wrapper over the themed Select for simple {value,label} lists. */
function FilterSelect({
  value,
  onChange,
  items,
  width = "w-[160px]",
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  width?: string;
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange(v ?? items[0]?.value ?? "")}>
      <SelectTrigger className={width}>
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
