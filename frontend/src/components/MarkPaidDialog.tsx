import { useMemo, useState } from "react";
import { Check, Link2, Receipt } from "lucide-react";
import type { Transaction } from "@/types";
import type { ReminderOccurrence } from "@/lib/sample";
import { formatINR, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const DAY = 86_400_000;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Close one reminder occurrence. Candidate debits around the due date are offered so the payment
 * can be linked to the real transaction; that also fills in the date and the amount actually paid,
 * which matters for bills whose amount changes every month.
 */
export default function MarkPaidDialog({
  reminder,
  txns,
  onClose,
  onConfirm,
}: {
  reminder: ReminderOccurrence | null;
  txns: Transaction[];
  onClose: () => void;
  onConfirm: (detail: { paidOn: string; amount: number | null; transactionId: number | null }) => Promise<void>;
}) {
  const [picked, setPicked] = useState<Transaction | null>(null);
  const [paidOn, setPaidOn] = useState(iso(new Date()));
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  // Debits within a fortnight of the due date, closest first — the payment is almost certainly here.
  const candidates = useMemo(() => {
    if (!reminder) return [];
    const due = new Date(`${reminder.occursOn}T00:00:00`).getTime();
    return txns
      .filter((t) => t.direction === "DEBIT" && !t.transfer && !t.settlement)
      .filter((t) => Math.abs(new Date(t.occurredAt).getTime() - due) <= 14 * DAY)
      .sort((a, b) => Math.abs(new Date(a.occurredAt).getTime() - due) - Math.abs(new Date(b.occurredAt).getTime() - due))
      .slice(0, 8);
  }, [reminder, txns]);

  if (!reminder) return null;

  const choose = (t: Transaction | null) => {
    setPicked(t);
    if (t) {
      setPaidOn(t.occurredAt.slice(0, 10));
      setAmount(String(t.amount));
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const n = Number(amount);
      await onConfirm({
        paidOn,
        amount: amount.trim() === "" || !Number.isFinite(n) ? null : n,
        transactionId: picked?.id ?? null,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark “{reminder.title}” paid</DialogTitle>
          <DialogDescription>
            Due {formatDate(reminder.occursOn)}
            {reminder.amount != null ? ` · ${formatINR(reminder.amount)} expected` : " · amount varies"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="size-3" /> Link the payment (optional)
          </Label>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No debits near this date to link.</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1">
              {candidates.map((t) => {
                const on = picked?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => choose(on ? null : t)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      on ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted"
                    }`}
                  >
                    <Receipt className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{t.merchant ?? "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {formatDate(t.occurredAt)} · {t.category ?? "Uncategorized"} · {t.accountName ?? "no account"}
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{formatINR(t.amount)}</span>
                    {on && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Paid on</Label>
            <DatePicker value={paidOn} onChange={setPaidOn} />
          </div>
          <div className="grid gap-1.5">
            <Label>Amount paid (₹)</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={reminder.amount != null ? String(reminder.amount) : "optional"}
              inputMode="numeric"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="gap-1">
            <Check className="size-3.5" /> {busy ? "Saving…" : "Mark paid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
