import { useEffect, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Pencil, Tag, Trash2, X } from "lucide-react";
import { bulkSetCategory, setTransactionTags } from "@/api";
import type { Account, Transaction } from "@/types";
import { CATEGORIES } from "@/lib/sample";
import { formatINR, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FIXED = ["Card Payment", "Loan EMI", "Transfers", "Income", "Uncategorized"];
const allCategories = (seen: string[]) => Array.from(new Set([...CATEGORIES, ...seen, ...FIXED]));

const normaliseTag = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_.]/g, "")
    .slice(0, 32);

/** Editable tag chips; every change is saved immediately. */
export function TagEditor({ txn, onChanged }: { txn: Transaction; onChanged: (t: Transaction) => void }) {
  const [tags, setTags] = useState<string[]>(txn.tags ?? []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setTags(txn.tags ?? []), [txn.id, txn.tags]);

  async function commit(next: string[]) {
    setTags(next);
    setBusy(true);
    try {
      const saved = await setTransactionTags(txn.id, next);
      onChanged(saved);
    } catch {
      setTags(txn.tags ?? []);
    } finally {
      setBusy(false);
    }
  }
  function add() {
    const t = normaliseTag(draft);
    setDraft("");
    if (!t || tags.includes(t) || tags.length >= 20) return;
    void commit([...tags, t]);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      void commit(tags.slice(0, -1));
    }
  }
  return (
    <div className="grid gap-1.5">
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Tag className="size-3" /> Tags
      </Label>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {t}
            <button type="button" aria-label={`Remove ${t}`} className="rounded-full hover:bg-primary/20" onClick={() => void commit(tags.filter((x) => x !== t))} disabled={busy}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
          placeholder={tags.length === 0 ? "Add a tag and press Enter (e.g. trip-goa, reimbursable)" : "Add…"}
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
          disabled={busy}
        />
      </div>
    </div>
  );
}

/** Everything about one transaction, with tags, quick actions and links out. */
export function TransactionDetailDialog({
  txn,
  accounts,
  onClose,
  onEdit,
  onDelete,
  onCategory,
  onChanged,
}: {
  txn: Transaction | null;
  accounts: Account[];
  onClose: () => void;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
  onCategory: (t: Transaction) => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  if (!txn) return null;
  const income = txn.direction === "CREDIT";
  const account = accounts.find((a) => a.id === txn.accountId);
  const when = new Date(txn.occurredAt);
  const kind = txn.settlement ? "Credit-card bill payment" : txn.transfer ? "Transfer between your own accounts" : income ? "Income" : "Expense";
  return (
    <Dialog open={!!txn} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span className="truncate">{txn.merchant ?? "Transaction"}</span>
            <span className={`inline-flex shrink-0 items-center gap-1 text-lg font-semibold tabular-nums ${income ? "text-[color:var(--ok)]" : ""}`}>
              {income ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
              {formatINR(txn.amount)}
            </span>
          </DialogTitle>
          <DialogDescription>
            {kind} · {formatDate(txn.occurredAt)}
            {when.getHours() + when.getMinutes() > 0 ? ` at ${when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Category">
            <button type="button" onClick={() => onCategory(txn)} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium transition-colors hover:ring-1 hover:ring-primary/50">
              {txn.category ?? "Uncategorized"}
            </button>
          </Field>
          <Field label="Account">
            {account ? (
              <button type="button" onClick={() => navigate(`/accounts?tab=${account.type === "SAVINGS" ? "bank" : "cards"}`)} className="text-left font-medium hover:underline">
                {account.displayName} <span className="text-muted-foreground">•• {account.last4}</span>
              </button>
            ) : (
              <span className="text-muted-foreground">{txn.accountName ?? "Not linked"}</span>
            )}
          </Field>
          <Field label="Source">{txn.source}</Field>
          <Field label="Direction">{txn.direction === "CREDIT" ? "Credit (money in)" : "Debit (money out)"}</Field>
          {txn.note && (
            <div className="col-span-2">
              <Field label="Note">{txn.note}</Field>
            </div>
          )}
        </div>

        <TagEditor txn={txn} onChanged={onChanged} />

        <div className="flex flex-wrap gap-2 text-xs">
          {txn.merchant && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/transactions?q=${encodeURIComponent(txn.merchant!)}`)}>
              All from {txn.merchant}
            </Button>
          )}
          {txn.category && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/transactions?category=${encodeURIComponent(txn.category!)}&month=${txn.occurredAt.slice(0, 7)}`)}>
              {txn.category} this month
            </Button>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" className="gap-1 text-destructive" onClick={() => onDelete(txn)}>
            <Trash2 className="size-3.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button className="gap-1" onClick={() => onEdit(txn)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 font-medium">{children}</div>
    </div>
  );
}

/** Categorise every selected row in one call. */
export function BulkCategoryDialog({
  open,
  ids,
  categories,
  onClose,
  onDone,
}: {
  open: boolean;
  ids: number[];
  categories: string[];
  onClose: () => void;
  onDone: (updated: number) => void;
}) {
  const [value, setValue] = useState("Uncategorized");
  const [busy, setBusy] = useState(false);
  const items = allCategories(categories).map((c) => ({ value: c, label: c }));
  async function save() {
    setBusy(true);
    try {
      const n = await bulkSetCategory(ids, value);
      onDone(n);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Categorise {ids.length} transaction{ids.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>The same category is applied to every selected row. Transfers and bill payments keep their special handling.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select items={items} value={value} onValueChange={(v) => setValue(v ?? "Uncategorized")}>
            <SelectTrigger className="w-full">
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || ids.length === 0}>
            {busy ? "Saving…" : `Apply to ${ids.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
