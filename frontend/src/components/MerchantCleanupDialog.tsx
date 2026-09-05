import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { aiEnrichMerchants, listMerchants, saveMerchantAliases, type MerchantSummary } from "@/api";
import { CATEGORIES } from "@/lib/sample";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FIXED = ["Card Payment", "Loan EMI", "Transfers", "Income", "Groceries", "Rent", "Miscellaneous"];
const ALL_CATEGORIES = Array.from(new Set([...CATEGORIES, ...FIXED])).sort();

/**
 * How many strings go to the model at once. Twenty is roughly 3.5s per merchant against 5.5s at
 * eight, and the JSON still comes back whole; larger batches start losing entries.
 */
const BATCH = 20;

interface Row {
  raw: string;
  count: number;
  total: number;
  uncategorised: number;
  merchant: string;
  category: string;
  confidence: number;
  accepted: boolean;
}

/**
 * Reads the raw merchant text out of every alert, asks the local model for a clean name and a
 * category, and lets the user accept them in bulk. Accepting stores an alias, so the same string
 * is never judged twice and future alerts are cleaned as they arrive.
 */
export default function MerchantCleanupDialog({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApplied: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, setPending] = useState<MerchantSummary[]>([]);
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!open) return;
    cancelled.current = false;
    setRows([]);
    setDone(0);
    setError(null);
    setRunning(true);
    listMerchants()
      .then((all) => {
        // Worth cleaning: never resolved before, or still missing a category.
        const todo = all.filter((m) => !m.canonical || m.uncategorised > 0);
        setPending(todo);
        // The user's settled merchants teach the model their own conventions.
        const examples = all
          .filter((m) => m.canonical && m.category)
          .slice(0, 12)
          .map((m) => `${m.raw} => ${m.category}`);
        void enrichAll(todo, examples);
      })
      .catch(() => {
        setError("Could not read the merchant list.");
        setRunning(false);
      });
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function enrichAll(todo: MerchantSummary[], examples: string[]) {
    for (let i = 0; i < todo.length; i += BATCH) {
      if (cancelled.current) break;
      const slice = todo.slice(i, i + BATCH);
      try {
        const answers = await aiEnrichMerchants(slice.map((m) => m.raw), ALL_CATEGORIES, examples);
        if (cancelled.current) break;
        const next: Row[] = [];
        for (const m of slice) {
          const a = answers.find((x) => x.raw.toLowerCase() === m.raw.toLowerCase());
          if (!a) continue;
          next.push({
            raw: m.raw,
            count: m.count,
            total: Number(m.total),
            uncategorised: m.uncategorised,
            merchant: a.merchant,
            category: a.category ?? "Miscellaneous",
            confidence: a.confidence ?? 0.5,
            // Anything the model is sure about starts ticked; the rest wants a human eye.
            accepted: (a.confidence ?? 0) >= 0.6,
          });
        }
        setRows((r) => [...r, ...next]);
      } catch {
        /* one bad batch should not stop the run */
      }
      setDone((d) => d + slice.length);
    }
    if (!cancelled.current) setRunning(false);
  }

  const accepted = rows.filter((r) => r.accepted);
  const txnCount = accepted.reduce((s, r) => s + r.count, 0);

  async function apply() {
    setSaving(true);
    try {
      await saveMerchantAliases(
        accepted.map((r) => ({ raw: r.raw, canonical: r.merchant.trim(), category: r.category, source: "ai" })),
      );
      onApplied();
      onOpenChange(false);
    } catch {
      setError("Saving failed. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  }

  const set = (raw: string, patch: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.raw === raw ? { ...x, ...patch } : x)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-3 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Clean up merchants
          </DialogTitle>
          <DialogDescription>
            Jarvis reads the raw text from your alerts and suggests a readable name and a category. Nothing changes
            until you apply. A category you have already chosen is never overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {running
              ? `Reading ${done} of ${pending.length}… you can stop any time and apply what has arrived`
              : rows.length === 0
                ? "Nothing to clean up."
                : `${rows.length} suggestions · ${accepted.length} ticked, covering ${txnCount} transactions`}
          </span>
          <div className="flex items-center gap-2">
            {running && <Loader2 className="size-4 animate-spin text-primary" />}
            {rows.length > 0 && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setRows((r) => r.map((x) => ({ ...x, accepted: true })))}>
                  Tick all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRows((r) => r.map((x) => ({ ...x, accepted: false })))}>
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
          {rows.length === 0 && !running ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Every merchant already has a name and a category.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="w-9 p-2" />
                  <th className="p-2 text-left font-medium">From the alert</th>
                  <th className="p-2 text-left font-medium">Clean name</th>
                  <th className="p-2 text-left font-medium">Category</th>
                  <th className="p-2 text-right font-medium">Rows</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const unsure = r.confidence < 0.6;
                  return (
                    <tr key={r.raw} className={`border-b last:border-0 ${r.accepted ? "" : "opacity-60"}`}>
                      <td className="p-2 align-middle">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={r.accepted}
                          onChange={() => set(r.raw, { accepted: !r.accepted })}
                          aria-label={`Accept ${r.merchant}`}
                        />
                      </td>
                      <td className="max-w-[220px] p-2">
                        <div className="truncate font-mono text-xs" title={r.raw}>
                          {r.raw}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatINR(r.total)}
                          {r.uncategorised > 0 ? ` · ${r.uncategorised} uncategorised` : ""}
                          {unsure && <span className="ml-1 text-[color:var(--warn)]">· unsure</span>}
                        </div>
                      </td>
                      <td className="p-2">
                        <Input
                          value={r.merchant}
                          onChange={(e) => set(r.raw, { merchant: e.target.value })}
                          className="h-8"
                        />
                      </td>
                      <td className="p-2">
                        <Select
                          items={ALL_CATEGORIES.map((c) => ({ value: c, label: c }))}
                          value={r.category}
                          onValueChange={(v) => set(r.raw, { category: v ?? "Miscellaneous" })}
                        >
                          <SelectTrigger className="h-8 w-[170px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ALL_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2 text-right tabular-nums">{r.count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="gap-1"
            onClick={() => {
              cancelled.current = true;
              setRunning(false);
            }}
            disabled={!running}
          >
            <X className="size-3.5" /> Stop reading
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={saving || accepted.length === 0} className="gap-1">
              <Check className="size-3.5" />
              {saving ? "Applying…" : `Apply ${accepted.length}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
