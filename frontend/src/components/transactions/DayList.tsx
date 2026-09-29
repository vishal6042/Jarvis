import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import type { Account, Transaction } from "@/types";
import { formatINR, formatOriginal, merchantLabel } from "@/lib/format";
import { FIXED, ONE_OFF, localDay, spendOf } from "@/lib/report";
import { isoDay } from "@/lib/forecast";
import StatusChip from "@/components/page/StatusChip";
import { Button } from "@/components/ui/button";
import { dayHeading, initials, isUncategorised, shortAccount } from "@/components/transactions/shared";

/** Rows drawn at first, and added each time the end of the list comes into view. */
const STEP = 60;

/** A single purchase this large, outside the fixed categories: not a habit, so it is labelled. */
export const isOneOff = (t: Transaction) =>
  t.direction === "DEBIT" && !t.transfer && !t.settlement && t.amount >= ONE_OFF && !FIXED.has(t.category ?? "");

/**
 * The ledger as days: a header per local calendar day with what was spent that day, then its
 * rows by readable name, with the category, account and any foreign amount on the line beneath.
 * It grows as you scroll instead of paging, so every row is still reachable without the reader
 * losing their place between pages.
 */
export default function DayList({
  rows,
  resetKey,
  loading,
  emptyText,
  accounts,
  cardIds,
  monthly,
  suggestFor,
  selected,
  onToggle,
  onToggleShown,
  onOpen,
  onEdit,
  onDelete,
  onCategory,
  onSuggestion,
}: {
  rows: Transaction[];
  /** Changes when the filters do; the list then starts from the top again. */
  resetKey: string;
  loading: boolean;
  emptyText: string;
  accounts: Account[];
  cardIds: ReadonlySet<number>;
  /** Raw merchant strings the recurring detector sees monthly. */
  monthly: ReadonlySet<string>;
  /** The category Jarvis thinks a row belongs in, when that differs from its own. */
  suggestFor: (t: Transaction) => string | null;
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onToggleShown: (ids: number[], on: boolean) => void;
  onOpen: (t: Transaction) => void;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
  onCategory: (t: Transaction) => void;
  onSuggestion: () => void;
}) {
  const [limit, setLimit] = useState(STEP);
  const sentinel = useRef<HTMLDivElement>(null);
  const today = isoDay(new Date());
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  // Another filter starts from the top again; a row saved in place keeps the reader's place.
  useEffect(() => setLimit(STEP), [resetKey]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= rows.length) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + STEP), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, rows.length]);

  // Day totals come from every row of the day, not only the ones drawn so far.
  const totals = useMemo(() => {
    const m = new Map<string, { spend: number; income: number }>();
    for (const t of rows) {
      const d = localDay(t);
      const cur = m.get(d) ?? { spend: 0, income: 0 };
      cur.spend += spendOf(t, cardIds);
      if (t.direction === "CREDIT" && !t.transfer && !t.settlement) cur.income += t.amount;
      m.set(d, cur);
    }
    return m;
  }, [rows, cardIds]);

  const shown = useMemo(() => rows.slice(0, limit), [rows, limit]);
  const days = useMemo(() => {
    const out: { day: string; rows: Transaction[] }[] = [];
    for (const t of shown) {
      const d = localDay(t);
      if (out.length && out[out.length - 1].day === d) out[out.length - 1].rows.push(t);
      else out.push({ day: d, rows: [t] });
    }
    return out;
  }, [shown]);

  const shownIds = shown.map((t) => t.id);
  const allShown = shownIds.length > 0 && shownIds.every((id) => selected.has(id));

  if (loading) {
    return (
      <section className="flex h-40 items-center justify-center gap-2 rounded-2xl border bg-card text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </section>
    );
  }
  if (rows.length === 0) {
    return (
      <section className="flex h-40 flex-col items-center justify-center gap-1 rounded-2xl border bg-card text-center">
        <p className="text-sm font-medium">No transactions found</p>
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center gap-3 border-b px-4 py-2 text-xs text-muted-foreground sm:px-5">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={allShown}
            onChange={() => onToggleShown(shownIds, !allShown)}
            aria-label="Select every row shown"
          />
          Select shown
        </label>
        <div className="flex-1" />
        <span>
          {shown.length < rows.length ? `Showing ${shown.length} of ${rows.length}` : `${rows.length} row${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {days.map(({ day, rows: dayRows }) => {
        const t = totals.get(day) ?? { spend: 0, income: 0 };
        return (
          <div key={day}>
            <div className="flex items-baseline gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5 sm:px-5">
              <span className="text-[13px] font-semibold">
                {dayHeading(day, today)}
                {day === today && <span className="font-normal text-muted-foreground"> · today</span>}
              </span>
              <span className="flex-1" />
              {t.spend !== 0 ? (
                <span className="font-mono text-[13px] text-muted-foreground tabular-nums">{formatINR(t.spend)}</span>
              ) : t.income > 0 ? (
                <span className="font-mono text-[13px] text-emerald-700 tabular-nums dark:text-emerald-400">+{formatINR(t.income)}</span>
              ) : null}
            </div>
            {dayRows.map((row) => (
              <Row
                key={row.id}
                t={row}
                account={shortAccount(row, byId)}
                monthly={!!row.merchant && monthly.has(row.merchant)}
                suggestion={suggestFor(row)}
                selected={selected.has(row.id)}
                onToggle={() => onToggle(row.id)}
                onOpen={() => onOpen(row)}
                onEdit={() => onEdit(row)}
                onDelete={() => onDelete(row)}
                onCategory={() => onCategory(row)}
                onSuggestion={onSuggestion}
              />
            ))}
          </div>
        );
      })}

      {shown.length < rows.length && (
        <div ref={sentinel} className="flex justify-center p-3">
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + STEP)}>
            Show more ({rows.length - shown.length} left)
          </Button>
        </div>
      )}
    </section>
  );
}

/** One transaction: avatar, readable name with its chips, the meta line, and the amount. */
function Row({
  t,
  account,
  monthly,
  suggestion,
  selected,
  onToggle,
  onOpen,
  onEdit,
  onDelete,
  onCategory,
  onSuggestion,
}: {
  t: Transaction;
  account: string | null;
  monthly: boolean;
  suggestion: string | null;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCategory: () => void;
  onSuggestion: () => void;
}) {
  const income = t.direction === "CREDIT";
  const name = merchantLabel(t);
  const oneOff = isOneOff(t);
  const original = formatOriginal(t);
  const uncategorised = isUncategorised(t);
  const avatar = income
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
    : oneOff
      ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300"
      : "bg-primary/10 text-primary";

  const stop = (fn: () => void) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    fn();
  };

  return (
    // The whole row opens the detail; its inner controls stop the click so they do their own thing.
    <div
      onClick={onOpen}
      className={`group flex cursor-pointer items-center gap-3 border-b border-border/40 px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/30 sm:gap-3.5 sm:px-5 ${
        selected ? "bg-primary/5" : suggestion ? "bg-primary/[0.03]" : ""
      }`}
    >
      <input
        type="checkbox"
        className={`size-4 shrink-0 accent-primary transition-opacity ${selected ? "" : "opacity-40 group-hover:opacity-100 focus-visible:opacity-100"}`}
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggle}
        aria-label={`Select ${name}`}
      />
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold ${avatar}`} aria-hidden>
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <button
            type="button"
            onClick={stop(onOpen)}
            className="min-w-0 truncate text-left text-sm font-medium hover:underline"
            title={t.merchantNorm && t.merchantNorm !== t.merchant ? `Alert text: ${t.merchant}` : "Open details"}
          >
            {name}
          </button>
          {oneOff && <StatusChip tone="neutral">one-off</StatusChip>}
          {monthly && <StatusChip tone="neutral">monthly</StatusChip>}
          {t.tags?.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {tag}
            </span>
          ))}
          {t.tags && t.tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{t.tags.length - 3}</span>}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {suggestion ? (
            <button type="button" onClick={stop(onSuggestion)} title="Jarvis suggests another category — open the review queue">
              <span className="line-through">{t.category}</span>{" "}
              <span className="font-semibold text-primary">
                <Sparkles className="inline size-3 align-[-1px]" /> {suggestion}?
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stop(onCategory)}
              title="Change category"
              className={`hover:underline ${uncategorised ? "font-medium text-amber-700 dark:text-amber-400" : ""}`}
            >
              {t.category ?? "Uncategorized"}
            </button>
          )}
          {t.settlement && " · bill payment"}
          {t.transfer && " · transfer"}
          {` · ${account ?? "no account"}`}
          {original && ` · ${original}`}
        </div>
      </div>
      <div className={`shrink-0 font-mono text-sm tabular-nums ${income ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
        {income ? "+" : ""}
        {formatINR(t.amount)}
      </div>
      <div className="hidden shrink-0 gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:flex">
        <Button variant="ghost" size="icon-sm" onClick={stop(onEdit)} aria-label="Edit">
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" className="text-rose-500 hover:text-rose-600" onClick={stop(onDelete)} aria-label="Delete">
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
