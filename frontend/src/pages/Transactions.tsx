import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
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

  // filters
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"all" | Direction>("all");
  const [cat, setCat] = useState<string>("all");
  const [acct, setAcct] = useState<string>("all");
  const [month, setMonth] = useState<string>("all"); // "all" | "YYYY-MM"
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
  }, [txns, q, dir, cat, acct, month]);

  // reset to first page whenever the filter set changes
  useEffect(() => setPage(0), [q, dir, cat, acct, month]);

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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">
            {loading ? "Loading…" : `${filtered.length} of ${txns.length} transactions`}
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="size-4" /> Add transaction
        </Button>
      </div>

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

      <Card>
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
                          {t.category ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t.category}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
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

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" className="size-8" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

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
