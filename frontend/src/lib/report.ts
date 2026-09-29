import type { RecurringPayment, Transaction } from "@/types";
import { inferSalary, isoDay } from "@/lib/forecast";
import { merchantLabel } from "@/lib/format";

/*
 * Everything the Analytics page shows, worked out in one place from the ledger so every section
 * agrees with every other (and with the dashboard, which uses the same spend rule):
 *
 *   spend  = purchases on savings and cards, minus refunds credited to a card,
 *            leaving out moves between own accounts (transfer) and card-bill payments (settlement);
 *   income = money credited to a savings account that is neither of those.
 *
 * Days are the person's own (local) calendar days, not UTC ones: an alert at 00:30 on the 1st
 * belongs to the new month.
 */

// ---------------------------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------------------------

export const localDay = (t: Transaction) => isoDay(new Date(t.occurredAt));
const real = (t: Transaction) => !t.transfer && !t.settlement;

/** What a row adds to spend: a purchase adds, a refund on a card takes away, anything else is 0. */
export function spendOf(t: Transaction, cardIds: ReadonlySet<number>): number {
  if (!real(t)) return 0;
  if (t.direction === "DEBIT") return t.amount;
  return t.accountId != null && cardIds.has(t.accountId) ? -t.amount : 0;
}

/** What a row adds to income: a credit to a (non-card) account that is real money in. */
export function incomeOf(t: Transaction, cardIds: ReadonlySet<number>): number {
  if (!real(t) || t.direction !== "CREDIT" || t.accountId == null || cardIds.has(t.accountId)) return 0;
  return t.amount;
}

/** Categories that are the same every month: what is committed rather than chosen. */
export const FIXED = new Set(["Loan EMI", "Bills & Utilities", "Rent", "Insurance", "EMI"]);
/** A single payment this large, outside the fixed categories, is a one-off rather than a habit. */
export const ONE_OFF = 20_000;

// ---------------------------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------------------------

export type PeriodKind = "month" | "quarter" | "year" | "custom";
export type CompareMode = "same-days" | "whole";

export interface Window {
  from: string; // yyyy-MM-dd, inclusive
  to: string; // yyyy-MM-dd, inclusive
  label: string;
  short: string;
  days: number; // days in the whole period
  elapsed: number; // days of it that have happened
  running: boolean; // it contains today
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => isoDay(new Date(y, m, d));
const parse = (s: string) => new Date(`${s}T00:00:00`);
const dayCount = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000) + 1;
const addDays = (s: string, n: number) => {
  const d = parse(s);
  return isoDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};
const monthName = (m: number, style: "long" | "short" = "long") =>
  new Date(2000, m, 1).toLocaleDateString("en-IN", { month: style });
export const fmtDay = (s: string) => parse(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function finish(from: string, to: string, label: string, short: string, today: string): Window {
  const days = dayCount(from, to);
  const running = from <= today && today <= to;
  const elapsed = running ? dayCount(from, today) : today < from ? 0 : days;
  return { from, to, label, short, days, elapsed, running };
}

/**
 * The period `offset` steps back from the current one. Quarters and years follow the Indian
 * financial year (April to March), which is how salary, tax and investments are counted.
 */
export function windowFor(kind: PeriodKind, offset: number, now = new Date(), custom?: { from: string; to: string }): Window {
  const today = isoDay(now);
  if (kind === "custom" && custom) {
    return finish(custom.from, custom.to, `${fmtDay(custom.from)} – ${fmtDay(custom.to)}`, "Custom", today);
  }
  if (kind === "year" || kind === "quarter") {
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    if (kind === "year") {
      const y = fyStartYear - offset;
      return finish(ymd(y, 3, 1), ymd(y + 1, 2, 31), `FY ${y}–${pad((y + 1) % 100)}`, `FY${pad((y + 1) % 100)}`, today);
    }
    const qNow = Math.floor(((now.getMonth() + 9) % 12) / 3); // 0 = Apr–Jun
    const qi = fyStartYear * 4 + qNow - offset;
    const y = Math.floor(qi / 4);
    const q = qi - y * 4;
    const startMonth = 3 + q * 3; // may run past December into the next year
    const from = ymd(y, startMonth, 1);
    const to = ymd(y, startMonth + 3, 0);
    const a = parse(from);
    const b = parse(to);
    return finish(
      from,
      to,
      `Q${q + 1} FY${pad((y + 1) % 100)} · ${monthName(a.getMonth(), "short")}–${monthName(b.getMonth(), "short")} ${b.getFullYear()}`,
      `Q${q + 1}`,
      today,
    );
  }
  const m = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return finish(
    ymd(m.getFullYear(), m.getMonth(), 1),
    ymd(m.getFullYear(), m.getMonth() + 1, 0),
    `${monthName(m.getMonth())} ${m.getFullYear()}`,
    monthName(m.getMonth(), "short"),
    today,
  );
}

/**
 * What a period is compared with: the one before it — only as far into it as this one has got
 * when this one is still running and the mode is "same days", so a half-month is never set
 * against a whole one.
 */
export function compareWindow(w: Window, kind: PeriodKind, mode: CompareMode, now = new Date()): Window {
  let prev: Window;
  if (kind === "custom") {
    const to = addDays(w.from, -1);
    prev = finish(addDays(to, -(w.days - 1)), to, "the days before", "before", isoDay(now));
  } else {
    // The previous period is the one that contains the day before this one starts.
    const anchor = parse(addDays(w.from, -1));
    prev = windowFor(kind, 0, anchor);
    prev = { ...prev, running: false, elapsed: prev.days };
  }
  if (mode === "same-days" && w.running && w.elapsed < w.days) {
    const to = addDays(prev.from, Math.min(prev.days, w.elapsed) - 1);
    // The year only when it is not this one, so "1 Aug–29 Aug" stays short.
    const year = prev.from.slice(0, 4) !== isoDay(now).slice(0, 4) ? ` ${prev.from.slice(0, 4)}` : "";
    return { ...prev, to, label: `${fmtDay(prev.from)}–${fmtDay(to)}${year}`, elapsed: dayCount(prev.from, to), days: dayCount(prev.from, to) };
  }
  return prev;
}

const within = (t: Transaction, w: { from: string; to: string }) => {
  const d = localDay(t);
  return d >= w.from && d <= w.to;
};

// ---------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------

export interface MonthPoint {
  key: string; // yyyy-MM
  label: string; // "Sept"
  income: number;
  spend: number;
  kept: number;
  rate: number | null; // % of income kept; null without income
  expected: number; // income still expected (current month only)
  current: boolean;
  suspect: boolean; // a data-confidence issue touches this month
}

export interface CategoryLine {
  category: string;
  total: number;
  share: number;
  compare: number;
  deltaPct: number | null;
  avg: number; // monthly average over the complete months before the period
  series: number[]; // per month of `months`
  budget: number | null;
  fixed: boolean;
  oneOff: boolean; // most of it came from one-off payments
}

export interface MerchantLine {
  name: string;
  total: number;
  count: number;
  category: string | null;
  note: string | null; // "USD 118" / card last digits
}

export interface ConfidenceIssue {
  id: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  months: string[]; // yyyy-MM it distorts
}

export interface LookItem {
  id: string;
  badge: string;
  title: string;
  detail: string;
  href: string;
}

export interface Report {
  window: Window;
  compare: Window;
  income: number;
  expected: number; // salary still expected inside the period
  spend: number;
  compareSpend: number;
  compareIncome: number;
  kept: number; // income + expected − spend
  rate: number | null;
  avgRate: number | null;
  fixed: number;
  oneOffs: number;
  lifestyle: number;
  typicalLifestyle: number;
  oneOffItems: { name: string; amount: number }[];
  perDay: number;
  comparePerDay: number;
  perDayWithoutOneOffs: number;
  categories: CategoryLine[];
  months: MonthPoint[];
  ledgerStart: string | null;
  days: { day: string; total: number }[]; // each day of the window, for the rhythm grid
  weekdayPerDay: number;
  weekendPerDay: number;
  medianPayment: number;
  payments: number;
  smallShareCount: number; // share of payments under ₹500
  smallShareMoney: number; // share of money in those
  merchants: MerchantLine[];
  bank: { total: number; count: number };
  cards: { total: number; count: number };
  confidence: ConfidenceIssue[];
  look: LookItem[];
  txns: Transaction[]; // the rows the period's spend is made of
}

const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function buildReport(input: {
  txns: Transaction[];
  cardIds: ReadonlySet<number>;
  kind: PeriodKind;
  window: Window;
  compare: Window;
  budgets: Record<string, number>;
  earns: boolean;
  now?: Date;
}): Report {
  const { txns, cardIds, kind, window: w, compare: cw, budgets, earns } = input;
  const now = input.now ?? new Date();
  const today = isoDay(now);

  const inW = txns.filter((t) => within(t, w));
  const inC = txns.filter((t) => within(t, cw));
  const spendRows = inW.filter((t) => spendOf(t, cardIds) !== 0);
  const sum = (rows: Transaction[], f: (t: Transaction) => number) => rows.reduce((s, t) => s + f(t), 0);
  const spend = sum(inW, (t) => spendOf(t, cardIds));
  const income = sum(inW, (t) => incomeOf(t, cardIds));
  const compareSpend = sum(inC, (t) => spendOf(t, cardIds));
  const compareIncome = sum(inC, (t) => incomeOf(t, cardIds));

  // Salary still to come inside a running period: the forecast's own estimate.
  let expected = 0;
  if (w.running && earns) {
    const sal = inferSalary(txns, now, earns);
    if (sal.amount > 0 && !sal.receivedThisMonth) {
      const on = ymd(now.getFullYear(), now.getMonth(), Math.min(sal.dayOfMonth, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()));
      if (on >= today && on <= w.to) expected = sal.amount;
    }
  }

  // Ledger start: the first month with a normal amount of activity. Alerts are only forwarded
  // from when the phone app was set up, so the first month is usually a few stray rows (a ₹452
  // "income" month) that would wreck every average and savings rate it touched.
  const first = txns.reduce<string | null>((m, t) => (m == null || localDay(t) < m ? localDay(t) : m), null);
  const perMonth = new Map<string, number>();
  for (const t of txns) perMonth.set(localDay(t).slice(0, 7), (perMonth.get(localDay(t).slice(0, 7)) ?? 0) + 1);
  const counts = Array.from(perMonth.values()).sort((a, b) => a - b);
  const typicalCount = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  const firstFull = Array.from(perMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .find(([, n]) => n >= typicalCount * 0.4)?.[0] ?? null;

  // Months for the trend: six ending with the period's last month (a whole year shows its months).
  const endMonth = parse(w.to < today ? w.to : today);
  const count = kind === "year" ? Math.min(12, (endMonth.getFullYear() - parse(w.from).getFullYear()) * 12 + endMonth.getMonth() - parse(w.from).getMonth() + 1) : 6;
  const monthKeys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const k = monthKey(new Date(endMonth.getFullYear(), endMonth.getMonth() - i, 1));
    if (!firstFull || k >= firstFull) monthKeys.push(k);
  }
  const byMonth = new Map<string, Transaction[]>();
  for (const t of txns) {
    const k = localDay(t).slice(0, 7);
    if (!monthKeys.includes(k)) continue;
    const list = byMonth.get(k) ?? [];
    list.push(t);
    byMonth.set(k, list);
  }
  const currentKey = today.slice(0, 7);

  // Categories: this period, the comparison, and each month of the trend.
  const catTotals = (rows: Transaction[]) => {
    const m = new Map<string, number>();
    for (const t of rows) {
      const v = spendOf(t, cardIds);
      if (v === 0) continue;
      const k = t.category ?? "Uncategorized";
      m.set(k, (m.get(k) ?? 0) + v);
    }
    return m;
  };
  const now_ = catTotals(inW);
  const then_ = catTotals(inC);
  const monthCats = new Map(monthKeys.map((k) => [k, catTotals(byMonth.get(k) ?? [])]));
  // Averages: the complete months before this period.
  const priorMonths = monthKeys.filter((k) => k < w.from.slice(0, 7));
  const avgOf = (cat: string) =>
    priorMonths.length ? priorMonths.reduce((s, k) => s + (monthCats.get(k)?.get(cat) ?? 0), 0) / priorMonths.length : 0;

  // One-offs: single payments of ₹20,000 or more outside the fixed categories.
  const oneOffRows = spendRows.filter((t) => t.direction === "DEBIT" && t.amount >= ONE_OFF && !FIXED.has(t.category ?? ""));
  const oneOffs = sum(oneOffRows, (t) => t.amount);
  const oneOffByCat = new Map<string, number>();
  for (const t of oneOffRows) oneOffByCat.set(t.category ?? "Uncategorized", (oneOffByCat.get(t.category ?? "Uncategorized") ?? 0) + t.amount);
  const fixed = Array.from(now_.entries())
    .filter(([c]) => FIXED.has(c))
    .reduce((s, [, v]) => s + v, 0);
  const lifestyle = Math.max(0, spend - fixed - oneOffs);
  // A typical month's everyday spend, the same way, over the months before this period.
  const typicalLifestyle = priorMonths.length
    ? priorMonths.reduce((s, k) => {
        const rows = byMonth.get(k) ?? [];
        const total = sum(rows, (t) => spendOf(t, cardIds));
        const f = Array.from((monthCats.get(k) ?? new Map<string, number>()).entries())
          .filter(([c]) => FIXED.has(c))
          .reduce((a, [, v]) => a + v, 0);
        const o = sum(
          rows.filter((t) => real(t) && t.direction === "DEBIT" && t.amount >= ONE_OFF && !FIXED.has(t.category ?? "")),
          (t) => t.amount,
        );
        return s + Math.max(0, total - f - o);
      }, 0) / priorMonths.length
    : 0;

  const categories: CategoryLine[] = Array.from(now_.entries())
    .filter(([, v]) => v > 0)
    .map(([category, total]) => {
      const compare = then_.get(category) ?? 0;
      return {
        category,
        total,
        share: spend > 0 ? total / spend : 0,
        compare,
        deltaPct: compare > 0 ? ((total - compare) / compare) * 100 : null,
        avg: avgOf(category),
        series: monthKeys.map((k) => monthCats.get(k)?.get(category) ?? 0),
        budget: budgets[category] ?? null,
        fixed: FIXED.has(category),
        oneOff: (oneOffByCat.get(category) ?? 0) >= total * 0.5,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Data confidence: things in the ledger that are probably distorting these numbers.
  const confidence: ConfidenceIssue[] = [];
  for (const k of monthKeys) {
    const cats = monthCats.get(k);
    const label = `${monthName(Number(k.slice(5)) - 1)}`;
    const cardPay = cats?.get("Card Payment") ?? 0;
    if (cardPay >= 5_000) {
      confidence.push({
        id: `cardpay-${k}`,
        title: `${label}: ${fmtINR(cardPay)} "Card Payment" counted as spend`,
        detail: "A card-bill payment not matched to its card, so it counts as spending on top of the card's own purchases. Often the same payment imported twice, from the statement and the SMS.",
        href: `/transactions?month=${k}&category=${encodeURIComponent("Card Payment")}`,
        cta: "Review payment",
        months: [k],
      });
    }
    const transfers = cats?.get("Transfers") ?? 0;
    if (transfers >= 10_000) {
      confidence.push({
        id: `transfers-${k}`,
        title: `${label}: ${fmtINR(transfers)} paid to people is filed as "Transfers"`,
        detail: "It counts as spending, since the money left your accounts. Give it a real category (family support, rent, a loan repaid), or mark it as a transfer if it went to your own account.",
        href: `/transactions?month=${k}&category=Transfers`,
        cta: "Review transfers",
        months: [k],
      });
    }
  }
  // A payment that is the same every month (the EMI) missing from some of them.
  for (const cat of ["Loan EMI", "Rent"]) {
    const complete = monthKeys.filter((k) => k < currentKey || (k === currentKey && now.getDate() > 12));
    const present = complete.filter((k) => (monthCats.get(k)?.get(cat) ?? 0) > 0);
    const missing = complete.filter((k) => (monthCats.get(k)?.get(cat) ?? 0) === 0);
    if (present.length >= 2 && missing.length > 0) {
      const amount = monthCats.get(present[present.length - 1])?.get(cat) ?? 0;
      const names = missing.map((k) => monthName(Number(k.slice(5)) - 1));
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
      confidence.push({
        id: `missing-${cat}`,
        title: `${cat} missing in ${list}`,
        detail: `${fmtINR(amount)} is paid every month, but no alert reached Jarvis in ${missing.length === 1 ? "that month" : "those months"}. Add it from the statement so spend isn't understated.`,
        href: `/transactions?category=${encodeURIComponent(cat)}&month=all`,
        cta: "Add from statement",
        months: missing,
      });
    }
  }
  const suspectMonths = new Set(confidence.flatMap((c) => c.months));

  const months: MonthPoint[] = monthKeys.map((k) => {
    const rows = byMonth.get(k) ?? [];
    const inc = sum(rows, (t) => incomeOf(t, cardIds));
    const sp = sum(rows, (t) => spendOf(t, cardIds));
    const current = k === currentKey;
    const exp = current ? expected : 0;
    const base = inc + exp;
    return {
      key: k,
      label: monthName(Number(k.slice(5)) - 1, "short"),
      income: inc,
      spend: sp,
      kept: base - sp,
      // A rate only means something against a real income.
      rate: base >= 1_000 ? Math.round(((base - sp) / base) * 100) : null,
      expected: exp,
      current,
      suspect: suspectMonths.has(k),
    };
  });
  const completeRates = months.filter((m) => !m.current && m.rate != null).map((m) => m.rate as number);
  const avgRate = completeRates.length ? Math.round(completeRates.reduce((s, r) => s + r, 0) / completeRates.length) : null;
  const base = income + expected;

  // Rhythm: each day of the period (months only — a quarter's grid would be unreadable).
  const days: { day: string; total: number }[] = [];
  if (kind === "month" || (kind === "custom" && w.days <= 62)) {
    for (let d = w.from; d <= w.to; d = addDays(d, 1)) days.push({ day: d, total: 0 });
    const idx = new Map(days.map((d, i) => [d.day, i]));
    for (const t of spendRows) {
      const i = idx.get(localDay(t));
      if (i != null) days[i].total += spendOf(t, cardIds);
    }
  }
  let weekday = 0;
  let weekend = 0;
  let wdDays = 0;
  let weDays = 0;
  for (let d = w.from; d <= (w.running ? today : w.to); d = addDays(d, 1)) {
    const dow = parse(d).getDay();
    if (dow === 0 || dow === 6) weDays++;
    else wdDays++;
  }
  for (const t of spendRows) {
    const dow = parse(localDay(t)).getDay();
    if (dow === 0 || dow === 6) weekend += spendOf(t, cardIds);
    else weekday += spendOf(t, cardIds);
  }
  const purchases = spendRows.filter((t) => t.direction === "DEBIT");
  const small = purchases.filter((t) => t.amount < 500);

  // Merchants, by readable name.
  const mm = new Map<string, MerchantLine>();
  for (const t of spendRows) {
    const name = merchantLabel(t);
    const cur = mm.get(name) ?? { name, total: 0, count: 0, category: t.category, note: null };
    cur.total += spendOf(t, cardIds);
    if (t.direction === "DEBIT") cur.count++;
    if (t.originalCurrency && t.originalAmount != null) cur.note = `${t.originalCurrency} ${Math.round(t.originalAmount)}`;
    mm.set(name, cur);
  }
  const merchants = Array.from(mm.values())
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const onCards = purchases.filter((t) => t.accountId != null && cardIds.has(t.accountId));
  const onBank = purchases.filter((t) => !(t.accountId != null && cardIds.has(t.accountId)));

  // Worth a look: categories well above their own usual, and single payments far above the
  // category's typical one. Expected things (fixed categories) are left out.
  const look: LookItem[] = [];
  for (const c of categories) {
    if (c.fixed || c.oneOff || c.avg <= 0) continue;
    const ratio = c.total / c.avg;
    if (ratio >= 2 && c.total - c.avg >= 1_500) {
      const top = spendRows
        .filter((t) => (t.category ?? "Uncategorized") === c.category && t.direction === "DEBIT")
        .sort((a, b) => b.amount - a.amount)[0];
      look.push({
        id: `cat-${c.category}`,
        badge: `${ratio.toFixed(1)}×`,
        title: `${c.category}: ${fmtINR(c.total)} against ~${fmtINR(c.avg)} usual`,
        detail: top ? `${merchantLabel(top)} ${fmtINR(top.amount)} is the biggest part` : "",
        href: `?category=${encodeURIComponent(c.category)}`,
      });
    }
  }
  const history = txns.filter((t) => localDay(t) < w.from && t.direction === "DEBIT" && real(t));
  for (const t of purchases) {
    const cat = t.category ?? "Uncategorized";
    if (FIXED.has(cat) || t.amount < 3_000 || t.amount >= ONE_OFF) continue;
    const typical = median(history.filter((h) => (h.category ?? "Uncategorized") === cat).map((h) => h.amount));
    if (typical > 0 && t.amount >= typical * 10) {
      look.push({
        id: `txn-${t.id}`,
        badge: `${Math.round(t.amount / typical)}×`,
        title: `${merchantLabel(t)}: ${fmtINR(t.amount)} in one payment`,
        detail: `a typical ${cat.toLowerCase()} payment is ${fmtINR(typical)} · ${fmtDay(localDay(t))}`,
        href: `/transactions?q=${encodeURIComponent(t.merchant ?? "")}`,
      });
    }
  }

  const elapsed = Math.max(1, w.elapsed || w.days);
  return {
    window: w,
    compare: cw,
    income,
    expected,
    spend,
    compareSpend,
    compareIncome,
    kept: base - spend,
    rate: base >= 1_000 ? Math.round(((base - spend) / base) * 100) : null,
    avgRate,
    fixed,
    oneOffs,
    lifestyle,
    typicalLifestyle,
    oneOffItems: oneOffRows.map((t) => ({ name: merchantLabel(t), amount: t.amount })).sort((a, b) => b.amount - a.amount),
    perDay: spend / elapsed,
    comparePerDay: compareSpend / Math.max(1, cw.days),
    perDayWithoutOneOffs: (spend - oneOffs) / elapsed,
    categories,
    months,
    ledgerStart: firstFull ? `${firstFull}-01` : first,
    days,
    weekdayPerDay: wdDays ? weekday / wdDays : 0,
    weekendPerDay: weDays ? weekend / weDays : 0,
    medianPayment: median(purchases.map((t) => t.amount)),
    payments: purchases.length,
    smallShareCount: purchases.length ? small.length / purchases.length : 0,
    smallShareMoney: spend > 0 ? small.reduce((s, t) => s + t.amount, 0) / spend : 0,
    merchants,
    bank: { total: onBank.reduce((s, t) => s + t.amount, 0), count: onBank.length },
    cards: { total: onCards.reduce((s, t) => s + t.amount, 0), count: onCards.length },
    confidence,
    look: look.slice(0, 4),
    txns: spendRows,
  };
}

/** Repeat payments with readable names, their yearly cost, and whether they have stopped. */
export function recurringLines(items: RecurringPayment[], txns: Transaction[], now = new Date()) {
  const today = isoDay(now);
  const stale = addDays(today, -10);
  return items
    .map((r) => {
      const same = txns.filter((t) => t.merchant === r.merchant);
      const foreign = same.find((t) => t.originalCurrency && t.originalAmount != null);
      return {
        name: merchantLabel({ merchantNorm: same.find((t) => t.merchantNorm)?.merchantNorm, merchant: r.merchant ?? r.category }),
        cadence: r.cadence,
        amount: r.amount,
        yearly: r.monthlyEstimate * 12,
        monthly: r.monthlyEstimate,
        nextExpected: r.nextExpected,
        lastPaid: r.lastPaid,
        stopped: r.nextExpected < stale,
        note: foreign ? `${foreign.originalCurrency} ${Math.round(foreign.originalAmount as number)}` : null,
        merchant: r.merchant,
      };
    })
    .sort((a, b) => (a.stopped === b.stopped ? b.monthly - a.monthly : a.stopped ? 1 : -1));
}

function fmtINR(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
