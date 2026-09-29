import { formatINR } from "@/lib/format";
import { KIND_META, type Investment, type InvestmentKind } from "@/lib/sample";
import { holdingReturn, maturityValue, monthlyEquivalent, sipSchedule, valueToday } from "@/lib/portfolio";

/**
 * The Investments page's view of the holdings: alike ones grouped into one row, the labels those
 * rows and the maturity timeline use, and the anchors that tie a row to its card further down.
 * Pure functions over the stored holdings, so every figure on the page comes from one place.
 */

export const lakh = (n: number) => formatINR(n, { compact: true });
export const monthYear = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
export const dayMonth = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
export const longDate = (iso: string) => at(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
export const pct1 = (n: number) => `${n.toFixed(1)}%`;
const at = (iso: string) => new Date(`${iso}T00:00:00`);

/** What people call each product in conversation — the filter and the counts use these. */
export const SHORT: Record<InvestmentKind, string> = {
  FD: "FD",
  RD: "RD",
  PPF: "PPF",
  PF: "EPF",
  NSC: "NSC",
  KVP: "KVP",
  SSY: "SSY",
  NPS: "NPS",
  LIC: "LIC",
  MF: "Funds",
};

/** Section headings where KIND_META's label, written for a single card, doesn't read as a group. */
export const SECTION_TITLE: Partial<Record<InvestmentKind, string>> = {
  FD: "Fixed deposits",
  RD: "Recurring deposits",
  NSC: "National Savings Certificates",
  LIC: "LIC policies",
  MF: "Mutual funds & SIPs",
};

export const cardAnchor = (id: string) => `inv-${id}`;
export const sectionAnchor = (kind: InvestmentKind) => `inv-kind-${kind}`;

const isPostOffice = (inv: Investment) => /post\s*office|india\s*post|\bpo\b/i.test(`${inv.name} ${inv.notes ?? ""}`);

/** "Fixed deposits", or "Post Office RDs" when every RD is a Post Office one. */
export function groupTitle(kind: InvestmentKind, items: Investment[]): string {
  if (kind === "RD") return items.length > 0 && items.every(isPostOffice) ? "Post Office RDs" : "Recurring deposits";
  return SECTION_TITLE[kind] ?? KIND_META[kind].label;
}

/** "5 FDs", "LIC ×2", "EPF". */
export function countLabel(kind: InvestmentKind, n: number): string {
  if (n <= 1) return SHORT[kind];
  return ["FD", "RD", "NSC", "KVP"].includes(kind) ? `${n} ${SHORT[kind]}s` : `${SHORT[kind]} ×${n}`;
}

/** Several kinds counted together: "5 FDs + 4 RDs". */
export function countsLabel(items: Investment[]): string {
  const by = new Map<InvestmentKind, number>();
  for (const i of items) by.set(i.kind, (by.get(i.kind) ?? 0) + 1);
  return [...by.entries()].map(([k, n]) => countLabel(k, n)).join(" + ");
}

/** The account or certificate number in a holding's name or notes, which is how people tell alike deposits apart. */
export function accountNumber(inv: Investment): string {
  const digits = `${inv.name} ${inv.notes ?? ""}`.match(/\d{4,}/g);
  return digits ? digits[digits.length - 1] : inv.name;
}

const CLASS_WORD: Record<InvestmentKind, string> = {
  PF: "retirement",
  NPS: "retirement",
  LIC: "insurance",
  MF: "market-linked",
  FD: "fixed income",
  RD: "fixed income",
  PPF: "fixed income",
  NSC: "fixed income",
  KVP: "fixed income",
  SSY: "fixed income",
};

/** "₹2L" or "₹2L–₹3L" across a group; null when there is nothing to say. */
function spread(values: number[], fmt: (n: number) => string, each = ""): string | null {
  const v = values.filter((x) => x > 0);
  if (v.length === 0) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return lo === hi ? `${fmt(lo)}${v.length > 1 ? ` ${each}`.trimEnd() : ""}` : `${fmt(lo)}–${fmt(hi)}`;
}

/** The same month for every item, or null. */
function sameMonth(dates: (string | undefined)[]): Date | null {
  if (dates.length === 0 || dates.some((d) => !d)) return null;
  const keys = new Set(dates.map((d) => (d as string).slice(0, 7)));
  return keys.size === 1 ? at(dates[0] as string) : null;
}

/** When a holding (or a group) pays out, as a short phrase, with the payout when its terms give one. */
function freesUp(items: Investment[], today: Date): string {
  const dated = items.filter((i) => i.maturityDate).map((i) => i.maturityDate as string).sort();
  if (dated.length === 0) {
    // NPS Tier I is locked until 60 by the scheme's rules; a Tier II account can be withdrawn any time.
    if (items.every((i) => i.kind === "NPS" && !/tier\s*(2|ii)\b/i.test(i.name))) return "at 60";
    return "—";
  }
  const values = items.map((i) => (i.kind === "PF" ? null : maturityValue(i, today)));
  const total = values.every((v) => v != null) ? values.reduce((s: number, v) => s + (v ?? 0), 0) : null;
  const one = sameMonth(dated);
  if (one && dated.length === items.length) return total != null && total > 0 ? `${monthYear(one)} · ${lakh(total)}` : monthYear(one);
  const years = new Set(dated.map((d) => d.slice(0, 4)));
  if (years.size === 1) {
    const months = [...new Set(dated.map((d) => at(d).toLocaleDateString("en-IN", { month: "short" })))];
    const list = months.length > 1 ? `${months.slice(0, -1).join(", ")} & ${months[months.length - 1]}` : months[0];
    return `${list} ${dated[0].slice(0, 4)}`;
  }
  return `${dated[0].slice(0, 4)}–${dated[dated.length - 1].slice(0, 4)}`;
}

export interface HoldingRow {
  key: string;
  kind: InvestmentKind;
  items: Investment[];
  title: string;
  sub: string;
  invested: number;
  value: number;
  /** Some of the value is Jarvis's accrual estimate for an FD (shown with "≈"). */
  accrued: boolean;
  accruedNote: string | null;
  gainPct: number;
  /** Lowest and highest annualised return across the row; null when none can be computed. */
  yearMin: number | null;
  yearMax: number | null;
  /** The annualised figure rests on an assumed contribution history (EPF). */
  estimated: boolean;
  monthly: number;
  freesUp: string;
  /** Where the row's detail sits further down: the card, or the group's section. */
  anchor: string;
}

/**
 * One row per holding, except that several of the same kind share a row ("Fixed deposits ×5") —
 * five identical deposits read better as one line that opens up than as five near-copies. Largest
 * first, as the allocation bar above them is.
 */
export function holdingRows(investments: Investment[], today = new Date()): HoldingRow[] {
  const byKind = new Map<InvestmentKind, Investment[]>();
  for (const inv of investments) byKind.set(inv.kind, [...(byKind.get(inv.kind) ?? []), inv]);

  const rows: HoldingRow[] = [];
  for (const [kind, items] of byKind) {
    const values = items.map((i) => valueToday(i, today));
    const returns = items.map((i) => holdingReturn(i, today));
    const invested = items.reduce((s, i) => s + i.principal, 0);
    const value = values.reduce((s, v) => s + v.value, 0);
    const years = returns.map((r) => r.annualised).filter((r): r is number => r != null);
    const accruedOnes = values.filter((v) => v.accrued);
    const group = items.length > 1;
    const base = {
      kind,
      items,
      invested,
      value,
      accrued: accruedOnes.length > 0,
      gainPct: invested > 0 ? ((value - invested) / invested) * 100 : 0,
      yearMin: years.length ? Math.min(...years) : null,
      yearMax: years.length ? Math.max(...years) : null,
      estimated: returns.some((r) => r.estimated),
      monthly: items.reduce((s, i) => s + monthlyEquivalent(i), 0),
      freesUp: freesUp(items, today),
    };

    if (!group) {
      const inv = items[0];
      const v = values[0];
      const sub = [CLASS_WORD[kind], inv.rate && kind !== "PF" && kind !== "NPS" ? `${inv.rate}%` : null, inv.salaryDeducted ? "from payslip" : null]
        .filter(Boolean)
        .join(" · ");
      rows.push({
        ...base,
        key: inv.id,
        title: inv.name,
        sub,
        accruedNote: v.accrued && v.since ? `accrued at ${v.rate}% since ${longDate(v.since)}` : null,
        anchor: cardAnchor(inv.id),
      });
      continue;
    }

    // A group's line says what its members have in common: the size, the rate, when they opened.
    const sips = items.map((i) => i.sip ?? 0);
    const yearly = items.every((i) => i.contributionFrequency === "yearly");
    const parts = [
      (() => {
        if (!sips.some((s) => s > 0)) return spread(items.map((i) => i.principal), lakh, "each");
        const s = spread(sips, (n) => formatINR(n), "each");
        return s ? `${s} ${yearly ? "a year" : "a month"}` : null;
      })(),
      spread(items.map((i) => i.rate ?? 0), (n) => `${n}%`),
      (() => {
        const opened = sameMonth(items.map((i) => i.openingDate ?? i.commencementDate));
        return opened ? `opened ${monthYear(opened)}` : null;
      })(),
      (() => {
        const paid = sameMonth(items.map((i) => i.lastContributionOn));
        return paid ? `${paid.toLocaleDateString("en-IN", { month: "short" })} paid` : null;
      })(),
    ].filter((p): p is string => !!p);
    const names = [...new Set(items.map((i) => i.name))];
    const sub = parts.length >= 2 || names.length > 3 ? parts.join(" · ") : names.join(" · ");
    const rate = spread(accruedOnes.map((v) => v.rate ?? 0), (n) => `${n}%`);
    rows.push({
      ...base,
      key: `kind-${kind}`,
      title: `${groupTitle(kind, items)} ×${items.length}`,
      sub,
      accruedNote: accruedOnes.length ? `≈ value accrued at ${rate} since opening, not "₹0 gain"` : null,
      anchor: sectionAnchor(kind),
    });
  }
  return rows.sort((a, b) => b.value - a.value);
}

export interface MaturityGroup {
  key: string;
  /** "Aug 2027", or "2035" when a far-off year's maturities are folded together. */
  label: string;
  on: Date;
  items: Investment[];
  /** Payout at maturity where the terms give it, today's value otherwise (see `known`). */
  total: number;
  known: boolean;
  /** An EPF: it matures at 58 and keeps growing until then, so it has no payout to show. */
  retirement: boolean;
}

/**
 * Holdings still to mature, grouped by the month they pay out. More than three years away the
 * exact month matters less than the year, so a year's several months fold into one "2035".
 * EPF stays on its own: it is a retirement balance, not a payout to plan around.
 */
export function maturityGroups(investments: Investment[], today = new Date()): MaturityGroup[] {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const future = investments.filter((i) => i.maturityDate && at(i.maturityDate) >= start);
  const make = (key: string, label: string, items: Investment[]): MaturityGroup => {
    const payouts = items.filter((i) => i.kind !== "PF").map((i) => maturityValue(i, today));
    const fallback = items.filter((i) => i.kind !== "PF").map((i) => valueToday(i, today).value);
    return {
      key,
      label,
      on: at(items.map((i) => i.maturityDate as string).sort()[0]),
      items,
      total: payouts.reduce((s: number, v, n) => s + (v ?? fallback[n]), 0),
      known: payouts.every((v) => v != null),
      retirement: items.every((i) => i.kind === "PF"),
    };
  };

  const byMonth = new Map<string, Investment[]>();
  for (const inv of future) {
    const key = `${inv.kind === "PF" ? "pf-" : ""}${(inv.maturityDate as string).slice(0, 7)}`;
    byMonth.set(key, [...(byMonth.get(key) ?? []), inv]);
  }
  const months = [...byMonth.entries()].map(([key, items]) => make(key, monthYear(at(items[0].maturityDate as string)), items));

  const farOff = new Date(today.getFullYear() + 3, today.getMonth(), 1);
  const out: MaturityGroup[] = [];
  const byYear = new Map<string, MaturityGroup[]>();
  for (const g of months) {
    if (g.retirement || g.on < farOff) out.push(g);
    else byYear.set(String(g.on.getFullYear()), [...(byYear.get(String(g.on.getFullYear())) ?? []), g]);
  }
  for (const [year, gs] of byYear) {
    out.push(gs.length === 1 ? gs[0] : make(`y-${year}`, year, gs.flatMap((g) => g.items)));
  }
  return out.sort((a, b) => a.on.getTime() - b.on.getTime());
}

/** The soonest month in which something (other than EPF) pays out. */
export function nextMaturity(investments: Investment[], today = new Date()): MaturityGroup | null {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const future = investments
    .filter((i) => i.maturityDate && i.kind !== "PF" && at(i.maturityDate) >= start)
    .sort((a, b) => (a.maturityDate as string).localeCompare(b.maturityDate as string));
  if (future.length === 0) return null;
  const month = (future[0].maturityDate as string).slice(0, 7);
  return maturityGroups(future.filter((i) => (i.maturityDate as string).startsWith(month)), today)[0] ?? null;
}

export interface ReturnCaveat {
  inv: Investment;
  /** The annualised return shown for it. */
  annualised: number;
  /** How many years of instalments Jarvis assumed, and the year the account actually began. */
  assumedYears: number;
  startYear: number;
}

/**
 * The EPF whose return rests on an assumption: Jarvis knows only the total put in and today's
 * contribution, so it spreads that total over the most recent months (see sipSchedule). When
 * those months cover much less time than the account has been open, the figure is an estimate and
 * the page says so wherever it appears.
 */
export function returnCaveat(investments: Investment[], today = new Date()): ReturnCaveat | null {
  for (const inv of investments) {
    const r = holdingReturn(inv, today);
    const schedule = sipSchedule(inv, today);
    if (!r.estimated || r.annualised == null || !schedule) continue;
    const step = inv.contributionFrequency === "yearly" ? 12 : 1;
    return {
      inv,
      annualised: r.annualised,
      assumedYears: Math.max(1, Math.round((schedule.dates.length * step) / 12)),
      startYear: schedule.from.getFullYear(),
    };
  }
  return null;
}
