import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface UnderstoodChip {
  key: string;
  label: string;
  onRemove: () => void;
}

const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;
const WHEN = /\b(today|yesterday|week|month|year|last|this|since|before|after|between|over|under|above|below|more|less|than)\b/i;

/**
 * Whether a search reads like a request for the model ("food over ₹500 last week") rather than a
 * name to find ("swiggy"): more than one word, or an amount, a date or a category in it.
 */
export function looksLikeRequest(query: string, categories: string[]): boolean {
  const q = query.trim();
  if (!q) return false;
  if (q.split(/\s+/).length > 1) return true;
  if (/\d|₹|\brs\.?\b|\binr\b/i.test(q) || MONTHS.test(q) || WHEN.test(q)) return true;
  return categories.some((c) => c.toLowerCase() === q.toLowerCase());
}

/**
 * The search box, which also takes a request in plain words. Typing filters the list by text
 * straight away, as a search always has; pressing Enter on something that reads like a request
 * asks the local model to turn it into the page's own filters, shown back as removable
 * "Understood as" chips so it is always clear what the list is showing.
 */
export default function AskBox({
  value,
  onChange,
  onAsk,
  asking,
  onCancel,
  chips,
  count,
  canAsk,
  note,
}: {
  value: string;
  onChange: (v: string) => void;
  onAsk: () => void;
  asking: boolean;
  onCancel: () => void;
  chips: UnderstoodChip[];
  count: number | null;
  /** The text reads like a request, so Enter will ask rather than just search. */
  canAsk: boolean;
  note: string | null;
}) {
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-primary/30 bg-card px-3.5 py-3 ring-4 ring-primary/[0.07]">
      <form
        className="flex items-center gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!asking) onAsk();
        }}
      >
        {asking ? <Loader2 className="size-[18px] shrink-0 animate-spin text-primary" /> : <Sparkles className="size-[18px] shrink-0 text-primary" />}
        <label htmlFor="txn-ask" className="sr-only">
          Search or ask
        </label>
        <input
          id="txn-ask"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && asking) onCancel();
          }}
          placeholder="Search, or ask: “food over ₹500 last week”"
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
        {value && !asking && (
          <button type="button" onClick={() => onChange("")} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Clear the search">
            <X className="size-4" />
          </button>
        )}
        {count != null && !asking && (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {count} result{count === 1 ? "" : "s"}
          </span>
        )}
        {asking ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          canAsk && (
            <Button type="submit" size="sm" variant="secondary" className="gap-1 text-primary">
              <Sparkles className="size-3.5" /> Ask
            </Button>
          )
        )}
      </form>
      {asking && (
        <p className="text-xs text-muted-foreground">
          Jarvis is reading that… usually a couple of seconds, longer if the model on your PC is waking up.
        </p>
      )}
      {!asking && chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Understood as</span>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onRemove}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/15"
              aria-label={`Remove ${c.label}`}
            >
              {c.label} <X className="size-3" />
            </button>
          ))}
        </div>
      )}
      {!asking && note && <p className="text-xs text-muted-foreground">{note}</p>}
      {!asking && canAsk && chips.length === 0 && !note && value.trim() && (
        <p className="text-xs text-muted-foreground">Searching the text as you type · press Enter to let Jarvis read it as a request.</p>
      )}
    </section>
  );
}
