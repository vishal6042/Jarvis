import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, ListChecks, Plus, Sparkles, Wand2 } from "lucide-react";
import {
  createTransaction,
  deleteTransaction,
  listAccounts,
  listDuplicates,
  listRecurring,
  listTransactions,
  updateTransaction,
} from "@/api";
import { aiFilter, type AiFilter } from "@/lib/api/aiAssist";
import type { Account, Direction, RecurringPayment, Transaction } from "@/types";
import { formatINR } from "@/lib/format";
import { fmtDay, incomeOf, localDay, spendOf } from "@/lib/report";
import { inferSalary, isoDay } from "@/lib/forecast";
import { useFamily } from "@/lib/store";
import { useIsAdmin } from "@/lib/session";
import PageHeader from "@/components/page/PageHeader";
import HeadlineStrip, { type HeadlineCell } from "@/components/page/HeadlineStrip";
import SidePanel from "@/components/page/SidePanel";
import { BulkCategoryDialog, TransactionDetailDialog } from "@/components/TransactionDetail";
import MerchantCleanupDialog from "@/components/MerchantCleanupDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogTitle } from "@/components/ui/dialog";
import AskBox, { looksLikeRequest, type UnderstoodChip } from "@/components/transactions/AskBox";
import DayList from "@/components/transactions/DayList";
import ReviewQueue from "@/components/transactions/ReviewQueue";
import { buildQueue } from "@/components/transactions/queue";
import { useDismissed, useSuggestions } from "@/components/transactions/suggestions";
import {
  EditTransactionDialog,
  FilterSelect,
  QuickCategoryDialog,
  RulesDialog,
  draftOf,
  emptyDraft,
  requestOf,
  type Draft,
} from "@/components/transactions/dialogs";
import {
  CUSTOM,
  allCategories,
  categoryItems,
  currentMonthKey,
  monthEnd,
  monthLabel,
  shiftMonth,
  needsReview,
  useMediaQuery,
} from "@/components/transactions/shared";

const MONTH_KEY = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Categories the model may choose from, beyond the ones the ledger already uses. */
const MODEL_EXTRA = ["Groceries", "Rent", "Miscellaneous"];

/** What the model understood from the last request, and what the dates were before it. */
interface Understood {
  category?: string;
  direction?: Direction;
  min?: number;
  max?: number;
  from?: string;
  to?: string;
  accountId?: number;
  text?: string;
  before: { month: string; from: string; to: string };
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** "22–28 Sept" for a range inside one month, "30 Aug – 5 Sept" across two, one end on its own. */
function rangeLabel(from?: string, to?: string): string {
  if (from && to) {
    if (from.slice(0, 7) === to.slice(0, 7)) {
      return `${Number(from.slice(8))}–${fmtDay(to)}`;
    }
    return `${fmtDay(from)} – ${fmtDay(to)}`;
  }
  if (from) return `From ${fmtDay(from)}`;
  if (to) return `Until ${fmtDay(to)}`;
  return "";
}

/**
 * Transactions: the ledger for a month (or any range) as days with their spend, readable merchant
 * names and the month's four numbers on top. The search box also takes plain-words requests the
 * local model turns into filters, and a review queue — docked beside the list on a wide screen,
 * sliding in on a narrow one — gathers everything that wants a decision: wrong-looking
 * categories, better names, money to people filed as transfers, rows missing a category or
 * account, and probable duplicates.
 */
export default function Transactions() {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recurring, setRecurring] = useState<RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dups, setDups] = useState<Transaction[][]>([]);
  const loaded = useRef(false);
  const { activeMember } = useFamily();
  const admin = useIsAdmin();

  // Filters — seeded from the URL so other pages can deep-link (e.g. ?month=2026-09&category=Food,
  // ?account=6,7,8 for the cards on one statement, ?from=&to= for a date range, ?review=1).
  const [params] = useSearchParams();
  const [input, setInput] = useState(params.get("q") ?? ""); // what is in the box
  const [q, setQ] = useState(params.get("q") ?? ""); // the text the list is filtered by
  const [dir, setDir] = useState<"all" | Direction>((params.get("type") as Direction | null) ?? "all");
  const [cat, setCat] = useState<string>(params.get("category") ?? "all");
  const [acct, setAcct] = useState<string>(params.get("account") ?? "all");
  const [minAmt, setMinAmt] = useState<number | null>(null);
  const [maxAmt, setMaxAmt] = useState<number | null>(null);
  // Default to the current month — the usual question is "what did I spend this month".
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [month, setMonth] = useState<string>(
    params.get("month") ?? (params.has("from") || params.has("to") ? CUSTOM : currentMonthKey()),
  ); // "all" | "custom" | "YYYY-MM"
  const [review, setReview] = useState(params.get("review") === "1"); // only rows needing attention

  // Ask-to-filter
  const [understood, setUnderstood] = useState<Understood | null>(null);
  const [asking, setAsking] = useState(false);
  const [askNote, setAskNote] = useState<string | null>(null);
  const askToken = useRef(0);

  // The review queue docks at xl and is a side panel below it.
  const wide = useMediaQuery("(min-width: 1280px)");
  const [queueOpen, setQueueOpen] = useState(() => params.get("review") === "1" || window.matchMedia("(min-width: 1280px)").matches);
  const firstWide = useRef(true);
  useEffect(() => {
    if (firstWide.current) {
      firstWide.current = false;
      return;
    }
    setQueueOpen(wide); // crossing the breakpoint: docked when there is room, tucked away when not
  }, [wide]);
  const suggest = useSuggestions();
  const { dismissed, dismiss } = useDismissed();

  // Dialogs and selection
  const [quick, setQuick] = useState<Transaction | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<Transaction | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);

  const reload = useCallback(() => {
    // Only the first load blanks the list; later ones refresh it in place, keeping the scroll.
    if (!loaded.current) setLoading(true);
    Promise.all([listTransactions(0, 5000), listAccounts()])
      .then(([t, a]) => {
        setTxns(t);
        setAccounts(a);
      })
      .catch(() => {
        if (!loaded.current) {
          setTxns([]);
          setAccounts([]);
        }
      })
      .finally(() => {
        loaded.current = true;
        setLoading(false);
      });
    listDuplicates()
      .then(setDups)
      .catch(() => setDups([]));
  }, []);
  useEffect(() => {
    reload();
    listRecurring()
      .then((r) => setRecurring(r ?? []))
      .catch(() => setRecurring([]));
  }, [reload]);

  /** Rows saved by the queue, patched in place rather than reloading five thousand rows. */
  const patch = useCallback((rows: Transaction[]) => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    setTxns((prev) => prev.map((t) => byId.get(t.id) ?? t));
  }, []);

  const cardIds = useMemo(() => new Set(accounts.filter((a) => a.type !== "SAVINGS").map((a) => a.id)), [accounts]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    txns.forEach((t) => t.category && set.add(t.category));
    return Array.from(set).sort();
  }, [txns]);
  const pickable = useMemo(() => categoryItems(categories), [categories]);

  // Months present in the data, newest first — drives the month filter. The current month is
  // always offered, even before anything has landed in it.
  const months = useMemo(() => {
    const set = new Set<string>([currentMonthKey()]);
    txns.forEach((t) => set.add(localDay(t).slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [txns]);

  // The date window alone — the strip, the review queue and the list all start from it.
  const periodRows = useMemo(
    () =>
      txns.filter((t) => {
        const day = localDay(t);
        if (month === CUSTOM) return !((from && day < from) || (to && day > to));
        if (month === "all") return true;
        return day.startsWith(month);
      }),
    [txns, month, from, to],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return periodRows
      .filter((t) => {
        if (review && !needsReview(t)) return false;
        if (dir !== "all" && t.direction !== dir) return false;
        if (cat !== "all" && (t.category ?? "") !== cat) return false;
        // One id, or several for the cards billed on one statement ("6,7,8").
        if (acct !== "all" && !acct.split(",").includes(String(t.accountId ?? ""))) return false;
        if (minAmt != null && t.amount < minAmt) return false;
        if (maxAmt != null && t.amount > maxAmt) return false;
        if (needle) {
          const hay = `${t.merchantNorm ?? ""} ${t.merchant ?? ""} ${t.category ?? ""} ${t.note ?? ""} ${t.accountName ?? ""} ${(t.tags ?? []).join(" ")}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [periodRows, q, dir, cat, acct, minAmt, maxAmt, review]);

  // A new filter set clears the selection, so a bulk action never reaches rows no longer shown.
  useEffect(() => {
    setSelected(new Set());
  }, [q, dir, cat, acct, month, from, to, review, minAmt, maxAmt]);

  const queue = useMemo(
    () => buildQueue({ periodRows, viewRows: filtered, dups, suggestions: suggest.map, dismissed, admin }),
    [periodRows, filtered, dups, suggest.map, dismissed, admin],
  );
  const suggestionByRow = useMemo(() => {
    const m = new Map<number, string>();
    for (const w of queue.wrong) for (const r of w.rows) m.set(r.id, w.to);
    return m;
  }, [queue.wrong]);
  const monthly = useMemo(
    () => new Set(recurring.filter((r) => r.cadence === "Monthly" && r.merchant).map((r) => r.merchant as string)),
    [recurring],
  );

  // ---- The month strip, by the shared spend rule ----
  const isMonth = MONTH_KEY.test(month);
  const narrowed = dir !== "all" || cat !== "all" || acct !== "all" || minAmt != null || maxAmt != null || !!q.trim() || review;
  const strip = useMemo(() => {
    const out = filtered.reduce((s, t) => s + spendOf(t, cardIds), 0);
    const income = filtered.reduce((s, t) => s + incomeOf(t, cardIds), 0);
    const purchases = filtered.filter((t) => t.direction === "DEBIT" && spendOf(t, cardIds) > 0);
    let expected = 0;
    if (month === currentMonthKey() && !narrowed) {
      const sal = inferSalary(txns, new Date(), activeMember.earns);
      if (sal.amount > 0 && !sal.receivedThisMonth) expected = sal.amount;
    }
    // Days of the month that have happened, for a per-day figure (a month view only).
    let days = 0;
    if (isMonth) {
      const now = new Date();
      days = month === currentMonthKey() ? now.getDate() : month < currentMonthKey() ? Number(monthEnd(month).slice(8)) : 0;
    }
    return { out, income, expected, payments: purchases.length, median: median(purchases.map((t) => t.amount)), perDay: days > 0 ? out / days : null };
  }, [filtered, cardIds, month, narrowed, txns, activeMember.earns, isMonth]);

  const cells: HeadlineCell[] = [
    { label: "Out", value: formatINR(strip.out), sub: strip.perDay != null && strip.out > 0 ? `${formatINR(strip.perDay)} a day` : undefined },
    {
      label: "In",
      value: formatINR(strip.income),
      sub: strip.expected > 0 ? <span className="text-primary">+{formatINR(strip.expected, { compact: true })} expected</span> : undefined,
    },
    { label: "Payments", value: String(strip.payments), sub: strip.payments > 0 ? `median ${formatINR(strip.median)}` : undefined },
    {
      label: "Needs a look",
      value: String(queue.count),
      tone: queue.count > 0 ? "warn" : undefined,
      sub:
        wide && queueOpen ? (
          <span className="text-amber-800 dark:text-amber-300">queue open →</span>
        ) : (
          <button type="button" onClick={() => setQueueOpen(true)} className="font-medium text-amber-800 hover:underline dark:text-amber-300">
            open the queue →
          </button>
        ),
    },
  ];

  // ---- Period ----
  const periodLabel =
    month === "all" ? "All months" : month === CUSTOM ? rangeLabel(from || undefined, to || undefined) || "Custom dates" : monthLabel(month);
  function pickMonth(v: string) {
    // Start a new range from the month that was on screen; from "All months" both ends start open.
    if (v === CUSTOM && month !== CUSTOM) {
      if (month === "all") {
        setFrom("");
        setTo("");
      } else {
        setFrom(`${month}-01`);
        setTo(monthEnd(month));
      }
    }
    setMonth(v);
  }
  function step(n: number) {
    setMonth(isMonth ? shiftMonth(month, n) : currentMonthKey());
  }
  // Moving one end of the range past the other drags the other along, so it never inverts.
  function pickFrom(v: string) {
    setFrom(v);
    if (to && v > to) setTo(v);
  }
  function pickTo(v: string) {
    setTo(v);
    if (from && v < from) setFrom(v);
  }

  // ---- Ask ----
  const modelCategories = useMemo(() => Array.from(new Set([...allCategories(categories), ...MODEL_EXTRA])).sort(), [categories]);

  function type(v: string) {
    if (asking) {
      askToken.current++;
      setAsking(false);
    }
    setInput(v);
    setQ(v);
    setUnderstood(null);
    setAskNote(null);
  }

  /** Put the model's answer on the page's own filters; false when it gave nothing to use. */
  function applyAi(f: AiFilter, query: string): boolean {
    const before = understood?.before ?? { month, from, to };
    const known = modelCategories.find((c) => c.toLowerCase() === (f.category ?? "").trim().toLowerCase());
    const category = f.category?.trim() ? (known ?? f.category.trim()) : undefined;
    const direction = f.direction === "DEBIT" || f.direction === "CREDIT" ? f.direction : undefined;
    const min = f.minAmount != null && Number.isFinite(f.minAmount) && f.minAmount > 0 ? f.minAmount : undefined;
    const max = f.maxAmount != null && Number.isFinite(f.maxAmount) && f.maxAmount > 0 ? f.maxAmount : undefined;
    let dFrom = f.from && DAY.test(f.from) ? f.from : undefined;
    let dTo = f.to && DAY.test(f.to) ? f.to : undefined;
    if (dFrom && dTo && dFrom > dTo) [dFrom, dTo] = [dTo, dFrom];
    const accountId = f.accountId != null && accounts.some((a) => a.id === f.accountId) ? f.accountId : undefined;
    const rawText = f.text?.trim() || undefined;
    const structured = [category, direction, min, max, dFrom, dTo, accountId].some((x) => x !== undefined);
    // A text that is the whole request back again is no better than searching it.
    const text = rawText && (structured || rawText.toLowerCase() !== query.toLowerCase()) ? rawText : undefined;
    if (!structured && !text) return false;

    // Fields the previous request set and this one does not go back to how they were.
    setCat(category ?? (understood?.category ? "all" : cat));
    setDir(direction ?? (understood?.direction ? "all" : dir));
    setMinAmt(min ?? (understood?.min != null ? null : minAmt));
    setMaxAmt(max ?? (understood?.max != null ? null : maxAmt));
    setAcct(accountId != null ? String(accountId) : understood?.accountId != null ? "all" : acct);
    setQ(text ?? "");
    if (dFrom || dTo) {
      setMonth(CUSTOM);
      setFrom(dFrom ?? "");
      setTo(dTo ?? "");
    } else if (understood?.from || understood?.to) {
      setMonth(before.month);
      setFrom(before.from);
      setTo(before.to);
    }
    setUnderstood({ category, direction, min, max, from: dFrom, to: dTo, accountId, text, before });
    return true;
  }

  async function ask() {
    const query = input.trim();
    if (!query || !looksLikeRequest(query, modelCategories)) {
      setQ(query);
      return;
    }
    const token = ++askToken.current;
    setAsking(true);
    setAskNote(null);
    try {
      const f = await aiFilter(
        query,
        modelCategories,
        accounts.map((a) => ({ id: a.id, name: a.displayName })),
        isoDay(new Date()),
      );
      if (token !== askToken.current) return;
      if (!applyAi(f, query)) {
        setQ(query);
        setAskNote("Jarvis found no filters in that, so the list is searching the text.");
      }
    } catch {
      if (token !== askToken.current) return;
      setQ(query);
      setAskNote("Jarvis could not read that just now, so the list is searching the text.");
    } finally {
      if (token === askToken.current) setAsking(false);
    }
  }
  function cancelAsk() {
    askToken.current++;
    setAsking(false);
    setQ(input);
  }

  const chips: UnderstoodChip[] = [];
  if (understood) {
    const u = understood;
    if (u.category && cat === u.category) chips.push({ key: "cat", label: `Category: ${u.category}`, onRemove: () => setCat("all") });
    if (u.direction && dir === u.direction)
      chips.push({ key: "dir", label: u.direction === "CREDIT" ? "Money in" : "Money out", onRemove: () => setDir("all") });
    if (u.min != null && minAmt === u.min) chips.push({ key: "min", label: `Amount ≥ ${formatINR(u.min)}`, onRemove: () => setMinAmt(null) });
    if (u.max != null && maxAmt === u.max) chips.push({ key: "max", label: `Amount ≤ ${formatINR(u.max)}`, onRemove: () => setMaxAmt(null) });
    if ((u.from || u.to) && month === CUSTOM && from === (u.from ?? "") && to === (u.to ?? ""))
      chips.push({
        key: "dates",
        label: rangeLabel(u.from, u.to),
        onRemove: () => {
          setMonth(u.before.month);
          setFrom(u.before.from);
          setTo(u.before.to);
        },
      });
    if (u.accountId != null && acct === String(u.accountId))
      chips.push({
        key: "acct",
        label: accounts.find((a) => a.id === u.accountId)?.displayName ?? "Account",
        onRemove: () => setAcct("all"),
      });
    if (u.text && q === u.text) chips.push({ key: "text", label: `“${u.text}”`, onRemove: () => setQ("") });
  }

  function clearFilters() {
    type("");
    setDir("all");
    setCat("all");
    setAcct("all");
    setMinAmt(null);
    setMaxAmt(null);
    setMonth(currentMonthKey());
    setFrom("");
    setTo("");
    setReview(false);
  }
  const anyFilter = narrowed || month !== currentMonthKey();

  // ---- Filter items ----
  const dirItems = [
    { value: "all", label: "All types" },
    { value: "CREDIT", label: "Income" },
    { value: "DEBIT", label: "Expense" },
  ];
  const catItems = [
    { value: "all", label: "All categories" },
    ...(cat !== "all" && !categories.includes(cat) ? [cat] : []).map((c) => ({ value: c, label: c })),
    ...categories.map((c) => ({ value: c, label: c })),
  ];
  const acctItems = [
    { value: "all", label: "All accounts" },
    ...accounts.map((a) => ({ value: String(a.id), label: a.displayName })),
    // A set of cards from a statement link, named after them so the filter reads sensibly.
    ...(acct.includes(",")
      ? [{ value: acct, label: `Cards ${accounts.filter((a) => acct.split(",").includes(String(a.id))).map((a) => a.last4).join(" · ")}` }]
      : []),
  ];
  const monthItems = [
    { value: "all", label: "All months" },
    { value: CUSTOM, label: "Custom dates" },
    ...(isMonth && !months.includes(month) ? [month] : []).map((m) => ({ value: m, label: monthLabel(m, "short") })),
    ...months.map((m) => ({ value: m, label: monthLabel(m, "short") })),
  ];

  // ---- Add / edit / delete ----
  async function save() {
    if (!editing) return;
    const req = requestOf(editing);
    if (!req) return;
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

  function toggleOne(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleShown(ids: number[], on: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });
  }

  const getSuggestions = () => suggest.start(queue.merchants, modelCategories, txns);

  const queuePanel = (onClose?: () => void) => (
    <ReviewQueue
      items={queue}
      categories={pickable}
      admin={admin}
      running={suggest.running}
      progress={suggest.progress}
      error={suggest.error}
      note={suggest.note}
      hasSuggestions={Object.keys(suggest.map).length > 0}
      onGetSuggestions={getSuggestions}
      onCancelSuggestions={suggest.cancel}
      onClose={onClose}
      onOpen={setDetail}
      onEdit={(t) => setEditing(draftOf(t))}
      onDelete={setToDelete}
      onPatched={patch}
      onReload={reload}
      onDismiss={dismiss}
      onCleanup={() => setCleanupOpen(true)}
    />
  );

  const docked = wide && queueOpen;
  // The Review toggle filters to rows missing a category or account, so it counts those.
  const reviewTotal = queue.loose.length;

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        title="Transactions"
        subtitle={
          loading
            ? "Loading…"
            : `${periodLabel} · ${filtered.length} transaction${filtered.length === 1 ? "" : "s"} · ${formatINR(strip.out)} out`
        }
      >
        <div className="flex h-11 items-center rounded-xl border bg-card">
          <Button variant="ghost" size="icon" className="h-10 w-11" aria-label="Previous month" onClick={() => step(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[72px] px-1 text-center text-sm font-semibold whitespace-nowrap">
            {isMonth ? monthLabel(month, "short") : month === "all" ? "All months" : "Custom"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-11"
            aria-label="Next month"
            disabled={isMonth && month >= currentMonthKey()}
            onClick={() => step(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button variant="outline" className="h-11 gap-2" onClick={() => setRulesOpen(true)}>
          <Wand2 className="size-4" /> Rules
        </Button>
        <Button className="h-11 gap-2" onClick={() => setEditing(emptyDraft())}>
          <Plus className="size-4" /> Add transaction
        </Button>
      </PageHeader>

      <div className={docked ? "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]" : ""}>
        <div className="min-w-0 space-y-4">
          <AskBox
            value={input}
            onChange={type}
            onAsk={ask}
            asking={asking}
            onCancel={cancelAsk}
            chips={chips}
            count={input.trim() || chips.length ? filtered.length : null}
            canAsk={looksLikeRequest(input, modelCategories) && chips.length === 0}
            note={askNote}
          />

          <HeadlineStrip cells={cells} />

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect value={month} onChange={pickMonth} items={monthItems} width="w-[140px]" label="Period" />
            {month === CUSTOM && (
              <div className="flex items-center gap-2">
                <DatePicker value={from} onChange={pickFrom} placeholder="From" className="w-[140px]" />
                <span className="shrink-0 text-sm text-muted-foreground">to</span>
                <DatePicker value={to} onChange={pickTo} placeholder="To" className="w-[140px]" />
              </div>
            )}
            <FilterSelect value={dir} onChange={(v) => setDir(v as "all" | Direction)} items={dirItems} width="w-[130px]" label="Type" />
            <FilterSelect value={cat} onChange={setCat} items={catItems} width="w-[170px]" label="Category" />
            <FilterSelect value={acct} onChange={setAcct} items={acctItems} width="w-[180px]" label="Account" />
            <div className="flex items-center gap-1">
              <AmountInput value={minAmt} onChange={setMinAmt} placeholder="Min ₹" label="Smallest amount" />
              <span className="text-sm text-muted-foreground">–</span>
              <AmountInput value={maxAmt} onChange={setMaxAmt} placeholder="Max ₹" label="Largest amount" />
            </div>
            <Button
              variant={review ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => {
                setReview((v) => !v);
                if (!review) setQueueOpen(true);
              }}
              title="Only rows without a category or account"
            >
              <ListChecks className="size-3.5" /> Review{reviewTotal > 0 ? ` (${reviewTotal})` : ""}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => setCleanupOpen(true)}>
              <Sparkles className="size-3.5" /> Clean up merchants
            </Button>
            {anyFilter && (
              <button type="button" onClick={clearFilters} className="px-1 text-sm font-medium text-primary hover:underline">
                Clear filters
              </button>
            )}
          </div>

          <DayList
            rows={filtered}
            resetKey={[q, dir, cat, acct, month, from, to, review, minAmt, maxAmt].join("|")}
            loading={loading}
            emptyText={txns.length === 0 ? "Add one or import a statement to get started." : "Try clearing your filters."}
            accounts={accounts}
            cardIds={cardIds}
            monthly={monthly}
            suggestFor={(t) => suggestionByRow.get(t.id) ?? null}
            selected={selected}
            onToggle={toggleOne}
            onToggleShown={toggleShown}
            onOpen={setDetail}
            onEdit={(t) => setEditing(draftOf(t))}
            onDelete={setToDelete}
            onCategory={setQuick}
            onSuggestion={() => setQueueOpen(true)}
          />
        </div>

        {docked && (
          <aside className="sticky top-4 max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto rounded-2xl border bg-card">
            {queuePanel(() => setQueueOpen(false))}
          </aside>
        )}
      </div>

      {!wide && (
        <SidePanel open={queueOpen} onClose={() => setQueueOpen(false)}>
          <DialogTitle className="sr-only">Review queue</DialogTitle>
          {queuePanel()}
        </SidePanel>
      )}

      <QuickCategoryDialog txn={quick} categories={categories} onClose={() => setQuick(null)} onSaved={reload} />
      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} categories={categories} onApplied={reload} />
      <MerchantCleanupDialog open={cleanupOpen} onOpenChange={setCleanupOpen} onApplied={reload} />
      <TransactionDetailDialog
        txn={detail}
        accounts={accounts}
        onClose={() => setDetail(null)}
        onEdit={(t) => {
          setDetail(null);
          setEditing(draftOf(t));
        }}
        onDelete={(t) => {
          setDetail(null);
          setToDelete(t);
        }}
        onCategory={(t) => {
          setDetail(null);
          setQuick(t);
        }}
        onChanged={reload}
      />
      <BulkCategoryDialog
        open={bulkOpen}
        ids={[...selected]}
        categories={categories}
        onClose={() => setBulkOpen(false)}
        onDone={() => {
          setBulkOpen(false);
          setSelected(new Set());
          reload();
        }}
      />
      <EditTransactionDialog draft={editing} accounts={accounts} saving={saving} onChange={setEditing} onClose={() => setEditing(null)} onSave={save} />
      <ConfirmDialog
        open={toDelete != null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete transaction?"
        description={toDelete ? `${toDelete.merchant ?? "This transaction"} · ${formatINR(toDelete.amount)} will be permanently removed.` : undefined}
        onConfirm={confirmDelete}
      />

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border bg-card/95 px-4 py-2 shadow-lg shadow-primary/10 ring-1 ring-primary/20 backdrop-blur">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button size="sm" className="gap-1" onClick={() => setBulkOpen(true)}>
              <Sparkles className="size-3.5" /> Categorise
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A rupee amount box for the amount-range filter; empty means no bound. */
function AmountInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      min="0"
      value={value ?? ""}
      onChange={(e) => {
        const n = Number(e.target.value);
        onChange(e.target.value === "" || !Number.isFinite(n) || n <= 0 ? null : n);
      }}
      placeholder={placeholder}
      aria-label={label}
      className="h-8 w-[88px]"
    />
  );
}
