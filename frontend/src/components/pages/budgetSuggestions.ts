import type { Transaction } from "@/types";
import { categoryTotals } from "@/lib/breakdown";

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** How many complete months a suggestion looks back over. */
export const LOOKBACK = 3;
/** Fewer months than this with any data, and a "usual" is a guess — no suggestion. */
export const MIN_MONTHS = 2;
/** Suggestions round up to the next multiple of this, so they read as budgets, not averages. */
const ROUND_TO = 500;

/** Not something a person budgets for: money in, or rows the ledger could not place. */
const NOT_BUDGETABLE = new Set(["Uncategorized", "Income", "Transfers", "Card Payment"]);

export interface BudgetSuggestion {
  /** The median monthly spend, rounded up to the next ₹500. */
  amount: number;
  /** Complete months it is the median of. */
  months: number;
}

export interface BudgetHistory {
  /** This month's spend so far per category, by the same rule. */
  thisMonth: Map<string, number>;
  /** Categories with a suggestion. */
  suggestions: Map<string, BudgetSuggestion>;
  /** Every budgetable category with any spend this month or in the lookback. */
  spent: Set<string>;
  /** Complete months in the lookback in which the ledger has any spend at all. */
  monthsWithData: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * A suggested budget per category from the household's own spending: the median of the last
 * three complete months, rounded up to the next ₹500. The median rather than the mean, so one
 * month with a big one-off does not set the limit for every month after it. A month the ledger
 * has no data for at all (before the first import) is left out rather than read as ₹0. With
 * fewer than two such months, or a category spent on in only one of them, there is no suggestion:
 * one month is not a habit.
 */
export function budgetHistory(txns: Transaction[], cardIds: ReadonlySet<number>, today = new Date()): BudgetHistory {
  const months: Map<string, number>[] = [];
  for (let back = 1; back <= LOOKBACK; back++) {
    const totals = categoryTotals(txns, monthKey(new Date(today.getFullYear(), today.getMonth() - back, 1)), cardIds);
    if (totals.size > 0) months.push(totals);
  }
  const thisMonth = categoryTotals(txns, monthKey(today), cardIds);

  const spent = new Set<string>();
  for (const m of [thisMonth, ...months]) for (const [k, v] of m) if (v > 0 && !NOT_BUDGETABLE.has(k)) spent.add(k);

  const suggestions = new Map<string, BudgetSuggestion>();
  if (months.length >= MIN_MONTHS) {
    for (const category of spent) {
      const values = months.map((t) => Math.max(0, t.get(category) ?? 0));
      // The category itself needs two months of spending too, or the median is half of one month.
      if (values.filter((v) => v > 0).length < MIN_MONTHS) continue;
      const m = median(values);
      if (m > 0) suggestions.set(category, { amount: Math.ceil(m / ROUND_TO) * ROUND_TO, months: months.length });
    }
  }
  return { thisMonth, suggestions, spent, monthsWithData: months.length };
}
