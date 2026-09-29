import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, Check, Loader2, Sparkles, X } from "lucide-react";
import type { Account, Direction } from "@/types";
import type { AiReceipt } from "@/lib/api/aiAssist";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/*
 * A payment screenshot or receipt, turned into a transaction the person checks before it is saved.
 * The local vision model reads the image; nothing is written until "Add it", and every field it
 * filled in can be corrected first — a misread amount is the one thing that must not slip through.
 */

/** The editable form of what the model read. Strings, because they are bound to inputs. */
export interface ReceiptDraft {
  merchant: string;
  amount: string;
  occurredOn: string; // yyyy-MM-dd
  accountId: string; // an account id, or NO_ACCOUNT
  category: string;
  direction: Direction;
  /** Kept for the note on the saved row: how it was paid and the payment reference. */
  method: string | null;
  reference: string | null;
}

export type ReceiptState = "pending" | "saving" | "added" | "discarded";

export const NO_ACCOUNT = "none";
/** Below this the model is unsure enough that every field needs a look. */
export const LOW_CONFIDENCE = 0.6;

/** What the model read, as a draft: the first savings account unless the person picks another. */
export function draftFrom(r: AiReceipt | null, accounts: Account[], today: string): ReceiptDraft {
  const savings = accounts.find((a) => a.type === "SAVINGS") ?? accounts[0];
  return {
    merchant: r?.merchant?.trim() ?? "",
    amount: r?.amount != null && r.amount > 0 ? String(r.amount) : "",
    occurredOn: r?.occurredOn && /^\d{4}-\d{2}-\d{2}$/.test(r.occurredOn) ? r.occurredOn : today,
    accountId: savings ? String(savings.id) : NO_ACCOUNT,
    category: r?.category?.trim() ?? "",
    direction: r?.direction === "CREDIT" ? "CREDIT" : "DEBIT",
    method: r?.method ?? null,
    reference: r?.reference?.trim() || null,
  };
}

const DIRECTION_ITEMS = [
  { value: "DEBIT", label: "Paid out" },
  { value: "CREDIT", label: "Received" },
];

/**
 * Progress while the vision model reads the image. It runs locally and can take a minute or two
 * the first time (the model has to load), so the wait is counted out loud rather than left as a
 * spinner that looks stuck.
 */
export function ReadingReceipt() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = window.setInterval(() => setSecs(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);
  const note =
    secs < 15
      ? "Reading the image on your PC…"
      : secs < 60
        ? "Still reading — the vision model usually takes under a minute."
        : "The model is probably starting up cold; this can take up to two minutes.";
  return (
    <div className="w-full max-w-sm space-y-2 rounded-2xl border bg-card px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="flex-1">{note}</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{secs}s</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-primary/10">
        {/* Fills over the two minutes the slowest read can take, so it always looks like progress. */}
        <div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(95, (secs / 120) * 100)}%` }} />
      </div>
    </div>
  );
}

/** The confirmation card: every field editable, then Add it / Discard. */
export default function ReceiptCard({
  draft,
  onChange,
  confidence,
  guessedCategory,
  state,
  accounts,
  categories,
  onAdd,
  onDiscard,
}: {
  draft: ReceiptDraft;
  onChange: (d: ReceiptDraft) => void;
  confidence: number;
  guessedCategory: boolean;
  state: ReceiptState;
  accounts: Account[];
  categories: string[];
  onAdd: () => void;
  onDiscard: () => void;
}) {
  const editable = state === "pending";
  const amount = Number(draft.amount);
  const valid = Number.isFinite(amount) && amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft.occurredOn);
  const set = <K extends keyof ReceiptDraft>(k: K, v: ReceiptDraft[K]) => onChange({ ...draft, [k]: v });

  const accountItems = [
    ...accounts.map((a) => ({ value: String(a.id), label: `${a.displayName}${a.last4 ? ` •••• ${a.last4}` : ""}` })),
    { value: NO_ACCOUNT, label: "No account" },
  ];
  const categoryItems = Array.from(new Set([...(draft.category ? [draft.category] : []), ...categories])).map((c) => ({ value: c, label: c }));

  if (state === "added" || state === "discarded") {
    return (
      <div className="rounded-xl border px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          {state === "added" ? <Check className="size-3.5 text-[var(--ok)]" /> : <X className="size-3.5" />}
          {state === "added" ? "Added" : "Discarded"}
        </span>{" "}
        · {draft.merchant || "Unnamed"} · {valid ? formatINR(amount) : "no amount"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3 sm:p-4">
      <div className="text-[13px] font-semibold text-primary">From the screenshot · add this transaction?</div>
      {confidence < LOW_CONFIDENCE && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-100 px-2.5 py-2 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
          <AlertCircle className="mt-px size-3.5 shrink-0" /> Couldn't read it clearly — check the fields.
        </div>
      )}
      <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
        <Field label={draft.direction === "CREDIT" ? "Received from" : "Paid to"}>
          <Input value={draft.merchant} onChange={(e) => set("merchant", e.target.value)} disabled={!editable} placeholder="Merchant" />
        </Field>
        <Field label="Amount (₹)">
          <Input
            value={draft.amount}
            onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            disabled={!editable}
            placeholder="0"
            className="font-mono"
          />
        </Field>
        <Field label="Date">
          <DatePicker value={draft.occurredOn} onChange={(v) => set("occurredOn", v)} />
        </Field>
        <Field label="Account">
          <Select items={accountItems} value={draft.accountId} onValueChange={(v) => v && set("accountId", v as string)} disabled={!editable}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accountItems.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label={
            <>
              Category
              {guessedCategory && draft.category && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-primary">
                  <Sparkles className="size-3" /> guessed
                </span>
              )}
            </>
          }
        >
          <Select items={categoryItems} value={draft.category || null} onValueChange={(v) => set("category", (v as string | null) ?? "")} disabled={!editable}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {categoryItems.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Direction">
          <Select items={DIRECTION_ITEMS} value={draft.direction} onValueChange={(v) => v && set("direction", v as Direction)} disabled={!editable}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIRECTION_ITEMS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">If the bank's SMS for it arrives later, it will confirm this entry instead of adding another.</p>
      <div className="flex gap-2">
        <Button size="sm" className="gap-1" onClick={onAdd} disabled={!editable || !valid}>
          {state === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Add it
        </Button>
        <Button size="sm" variant="outline" onClick={onDiscard} disabled={!editable}>
          Discard
        </Button>
      </div>
    </div>
  );
}

/** A caption over a control. A div, not a label: a label would open the Select or date picker on any click. */
function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
