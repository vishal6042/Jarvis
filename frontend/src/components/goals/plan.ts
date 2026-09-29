import type { ApiGoal } from "@/lib/api/finance";
import type { Investment } from "@/lib/sample";
import type { SalaryEstimate } from "@/lib/forecast";
import { isoDay } from "@/lib/forecast";
import { formatINR } from "@/lib/format";
import { maturityLadder } from "@/lib/portfolio";
import { goalEta } from "@/lib/projection";
import { maturityProjection } from "@/lib/rdMath";

/*
 * The arithmetic behind the Goals page: where each goal stands against what the household keeps a
 * month, and the three ways the planner offers to reach one. Pure functions of the goals, the
 * monthly pace (the forecast's own median of the last three months) and the deposits already
 * maturing, so every figure on the page can be traced back to the user's data.
 */

/**
 * Share of what you keep that the recommended plan may commit. The rest is left free, because the
 * pace is a median and a plan that needs every rupee of it fails the first expensive month.
 */
export const PLAN_SHARE = 0.8;

export type GoalState = "reached" | "on-track" | "off-pace" | "undated";

export interface GoalRead {
  goal: ApiGoal;
  remaining: number;
  /** 0–100, for the progress bar. */
  pct: number;
  state: GoalState;
  /** Months left to the target date (at least 1), null when undated or the date has passed. */
  months: number | null;
  /** The target date is set and already behind us, with money still to go. */
  overdue: boolean;
  /** What reaching the target date takes each month, when there is a date ahead. */
  needed: number | null;
  /** When the goal is reached if everything you keep goes to it; null when the pace is not positive. */
  eta: Date | null;
  /** How far off pace it is, for picking which goal the planner opens on (higher = worse). */
  severity: number;
}

const dateOf = (iso: string) => new Date(`${iso}T00:00:00`);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Calendar months from this month to the target's month; the month we are in no longer counts. */
export function monthsUntil(date: string | null | undefined, today = new Date()): number | null {
  if (!date) return null;
  const target = dateOf(date);
  const months = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
  return months <= 0 ? null : months;
}

/** The last day of the month `k` months after this one. */
export const monthEnd = (today: Date, k: number) => new Date(today.getFullYear(), today.getMonth() + k + 1, 0);

export function readGoal(goal: ApiGoal, keep: number, today = new Date()): GoalRead {
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
  const pct = goal.targetAmount > 0 ? Math.min(100, (goal.savedAmount / goal.targetAmount) * 100) : 0;
  const months = monthsUntil(goal.targetDate, today);
  const overdue = !!goal.targetDate && months == null && remaining > 0;
  const needed = months && remaining > 0 ? Math.ceil(remaining / months) : null;
  const eta = remaining > 0 ? goalEta(remaining, keep, today)?.on ?? null : null;

  let state: GoalState;
  if (remaining <= 0) state = "reached";
  else if (!goal.targetDate) state = "undated";
  else if (overdue || keep <= 0 || (needed ?? 0) > keep) state = "off-pace";
  else state = "on-track";

  const severity =
    state !== "off-pace" ? 0 : overdue || keep <= 0 ? Number.POSITIVE_INFINITY : (needed ?? 0) / keep;
  return { goal, remaining, pct, state, months, overdue, needed, eta, severity };
}

/** The goal the planner opens on: the one furthest off pace, the bigger gap breaking ties. */
export function mostOffPace(reads: GoalRead[]): GoalRead | null {
  const off = reads.filter((r) => r.state === "off-pace");
  if (off.length === 0) return null;
  return off.reduce((a, b) => (b.severity > a.severity || (b.severity === a.severity && b.remaining > a.remaining) ? b : a));
}

// ---------------------------------------------------------------------------------------------
// Money already coming
// ---------------------------------------------------------------------------------------------

export interface Payout {
  inv: Investment;
  on: string; // yyyy-MM-dd
  /** What it pays out, from the deposit's own terms: the same figure as "At maturity" on Investments. */
  amount: number;
}

/**
 * FDs and RDs still to mature, soonest first, each with its maturity value. A deposit whose terms
 * are incomplete (no rate, no start date) is left out rather than guessed at.
 */
export function upcomingPayouts(investments: Investment[], today = new Date()): Payout[] {
  const t0 = isoDay(startOfDay(today));
  const out: Payout[] = [];
  for (const m of maturityLadder(investments, today)) {
    if (m.inv.kind !== "FD" && m.inv.kind !== "RD") continue;
    if (m.on < t0) continue;
    const mp = maturityProjection(m.inv, today);
    if (!mp || !(mp.maturityValue > 0)) continue;
    out.push({ inv: m.inv, on: m.on, amount: Math.round(mp.maturityValue) });
  }
  return out;
}

/** "your 5 FDs", "your FD and 2 RDs" — how the deposits a plan uses are named in a sentence. */
export function payoutNoun(used: Payout[]): string {
  const fd = used.filter((p) => p.inv.kind === "FD").length;
  const rd = used.length - fd;
  const part = (n: number, k: string) => (n === 0 ? null : n === 1 ? k : `${n} ${k}s`);
  return `your ${[part(fd, "FD"), part(rd, "RD")].filter(Boolean).join(" and ")}`;
}

/** "FD payouts", "FD and RD payouts" — the note a plan leaves on the goal. */
const payoutKinds = (used: Payout[]) => {
  const kinds = [...new Set(used.map((p) => p.inv.kind))].sort();
  return `${kinds.join(" and ")} payouts`;
};

// ---------------------------------------------------------------------------------------------
// The planner's options
// ---------------------------------------------------------------------------------------------

export interface FundedPlan {
  /** Set aside each month, rounded up to a figure a person would type (0 when the payouts cover it). */
  monthly: number;
  /** How many months of setting aside that is. */
  months: number;
  /** The date the goal is reached by: the target date kept, or a month end. */
  by: Date;
  /** The target date stays as it is. */
  keepsDate: boolean;
  used: Payout[];
  payoutTotal: number;
  /** The note the goal gets when the plan is taken: "Funded by FD payouts, Aug 2027". */
  note: string;
}

/** Round up to ₹500, or ₹100 if that would break the cap, so the figure is one a person would type. */
function friendlyMonthly(x: number, cap: number): number {
  if (x <= 0) return 0;
  for (const step of [500, 100]) {
    const r = Math.ceil(x / step) * step;
    if (r <= cap) return r;
  }
  return Math.ceil(x);
}

/**
 * The recommended plan: put the deposits already maturing toward the goal and set aside at most
 * PLAN_SHARE of what you keep each month. If the target date works on those terms it is kept;
 * otherwise the earliest month end that does. Null when there is no pace, no deposit maturing in
 * time, or when the answer would not use a deposit at all (then it is just a slower "at today's
 * pace", and saying "with your FDs" would be untrue).
 */
export function fundedPlan(
  remaining: number,
  keep: number,
  payouts: Payout[],
  targetDate: string | null | undefined,
  today = new Date(),
): FundedPlan | null {
  if (remaining <= 0 || keep <= 0 || payouts.length === 0) return null;
  const cap = keep * PLAN_SHARE;

  const at = (months: number, by: Date, keepsDate: boolean): FundedPlan | null => {
    const byIso = isoDay(by);
    const used = payouts.filter((p) => p.on <= byIso);
    const payoutTotal = used.reduce((s, p) => s + p.amount, 0);
    const monthly = Math.max(0, remaining - payoutTotal) / months;
    if (monthly > cap || used.length === 0) return null;
    const last = dateOf(used[used.length - 1].on);
    return {
      monthly: friendlyMonthly(monthly, cap),
      months,
      by,
      keepsDate,
      used,
      payoutTotal,
      note: `Funded by ${payoutKinds(used)}, ${monthShort(last)}`,
    };
  };

  const toTarget = monthsUntil(targetDate, today);
  if (targetDate && toTarget) {
    const kept = at(toTarget, dateOf(targetDate), true);
    if (kept) return kept;
  }
  // Fifty years is past any deposit on record; the loop ends long before on real data.
  for (let k = 1; k <= 600; k++) {
    const by = monthEnd(today, k);
    const byIso = isoDay(by);
    const payoutTotal = payouts.filter((p) => p.on <= byIso).reduce((s, p) => s + p.amount, 0);
    if (Math.max(0, remaining - payoutTotal) / k <= cap) return at(k, by, false);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Setting money aside
// ---------------------------------------------------------------------------------------------

/**
 * The day of the month a set-aside reminder falls on: the day after the salary usually lands, so
 * the money is there to move. A salary at the very end of the month puts it on the 1st, and with no
 * salary history it is the 1st too.
 */
export function setAsideDay(salary: SalaryEstimate): number {
  if (salary.basis === 0) return 1;
  const d = salary.dayOfMonth + 1;
  return d > 28 ? 1 : d;
}

/** The next date (after today) that falls on `day` of a month, as yyyy-MM-dd. */
export function nextOnDay(day: number, today = new Date()): string {
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), day);
  return isoDay(thisMonth > startOfDay(today) ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, day));
}

export const setAsideTitle = (goal: ApiGoal) => `Set aside for ${goal.name}`;

// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------

const lakh3 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumSignificantDigits: 3,
});

/** A figure in a sentence: "₹2.22L" from a lakh up, exact below it ("₹84,500"). */
export const inWords = (n: number) => (Math.abs(n) >= 100_000 ? lakh3.format(n) : formatINR(n));

export const monthShort = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
export const monthLong = (d: Date) => d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
export const monthName = (d: Date) => d.toLocaleDateString("en-IN", { month: "long" });
export const longDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const SMALL = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** "seven months", "1 month", "14 months" — small counts spelled out, as a person would say them. */
export function monthsWord(n: number): string {
  const word = n >= 0 && n < SMALL.length ? SMALL[n] : String(n);
  return `${word} month${n === 1 ? "" : "s"}`;
}

/** Whole months from one date's month to another's. */
export const monthsBetween = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

/** How a monthly figure compares with what you keep: "twice what you keep", "40% of what you keep". */
export function againstKeep(needed: number, keep: number): string {
  const r = needed / keep;
  if (r < 0.95) return `${Math.round(r * 100)}% of what you keep`;
  if (r <= 1.05) return "about all of what you keep";
  if (Math.abs(r - 2) < 0.15) return "twice what you keep";
  if (Math.abs(r - 3) < 0.15) return "three times what you keep";
  return `${r.toFixed(1)} times what you keep`;
}

// ---------------------------------------------------------------------------------------------
// What the planner offers, and Jarvis's read of the page
// ---------------------------------------------------------------------------------------------

export interface PlanOptions {
  /** (a) Keep the target date: only when there is a date still ahead. */
  keepDate: { needed: number; months: number; realistic: boolean } | null;
  /** (b) Let the maturing deposits carry part of it. */
  plan: FundedPlan | null;
  /** (c) Change nothing: when today's pace gets there. */
  eta: Date | null;
  count: number;
}

/** The planner's options for one goal, shared by the planner and the line that announces it. */
export function planOptions(read: GoalRead, keep: number, payouts: Payout[], today = new Date()): PlanOptions {
  const keepDate =
    read.goal.targetDate && read.months && read.needed != null
      ? { needed: read.needed, months: read.months, realistic: keep > 0 && read.needed <= keep }
      : null;
  const plan = fundedPlan(read.remaining, keep, payouts, read.goal.targetDate, today);
  return { keepDate, plan, eta: read.eta, count: [keepDate, plan, read.eta].filter(Boolean).length };
}

const listOf = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export const COUNT_WAYS = ["No ways", "One way", "Two ways", "Three ways"];

/**
 * Jarvis's one-line read of the goals: which are on track, which one is furthest off and by how
 * much against what you keep, and where the plan for it is.
 */
export function goalsTake(
  reads: GoalRead[],
  keep: number,
  basis: number,
  planner: { read: GoalRead; count: number } | null,
): { text: string; detail?: string } {
  const open = reads.filter((r) => r.state !== "reached");
  if (reads.length === 0) {
    return { text: "No goals yet.", detail: "Set a target and Jarvis works out how to reach it from what you keep each month." };
  }
  if (open.length === 0) return { text: "Every goal is reached.", detail: "Set the next one when you are ready." };
  const plannerLine =
    planner && planner.count > 0 ? `${COUNT_WAYS[planner.count]} to get there are in the planner, worked out from your own numbers.` : undefined;
  if (basis === 0) {
    return {
      text: "There is not enough history yet to tell whether the goals are on pace.",
      detail: "Once a full month of income and spending is in, each goal gets a date.",
    };
  }
  if (keep <= 0) {
    return {
      text: "Spending has matched or passed income lately, so no goal is moving at today's pace.",
      detail: plannerLine ?? "Once a month ends with money left over, each goal gets a date.",
    };
  }

  const onTrack = open.filter((r) => r.state === "on-track");
  const off = open.filter((r) => r.state === "off-pace").sort((a, b) => b.severity - a.severity);
  const parts: string[] = [];
  if (onTrack.length > 0) parts.push(`${listOf(onTrack.map((r) => r.goal.name))} ${onTrack.length === 1 ? "is" : "are"} on track.`);
  if (off.length > 0) {
    const [worst, ...rest] = off;
    parts.push(
      worst.overdue
        ? `${worst.goal.name} is past its date with ${inWords(worst.remaining)} still to go.`
        : `${worst.goal.name} needs ${inWords(worst.needed ?? 0)} a month, ${againstKeep(worst.needed ?? 0, keep)}, so it needs a plan.`,
    );
    if (rest.length > 0) parts.push(`${listOf(rest.map((r) => r.goal.name))} ${rest.length === 1 ? "is" : "are"} off pace too.`);
    return { text: parts.join(" "), detail: plannerLine };
  }
  if (onTrack.length === 0) {
    const first = open.find((r) => r.eta);
    return {
      text: "No goal has a target date yet.",
      detail: first?.eta ? `At today's pace ${first.goal.name} is reached by ${monthShort(first.eta)}.` : undefined,
    };
  }
  // Each goal fits on its own; say whether they still fit together.
  const together = onTrack.reduce((s, r) => s + (r.needed ?? 0), 0);
  if (onTrack.length > 1 && together > keep) {
    return {
      text: `${parts[0]} Together, though, they need ${inWords(together)} a month, more than the ${inWords(keep)} you keep.`,
      detail: plannerLine,
    };
  }
  return {
    text: parts[0],
    detail: `${onTrack.length > 1 ? "Together they need" : "It needs"} ${inWords(together)} a month of the ${inWords(keep)} you keep.`,
  };
}
