import { useEffect, useState } from "react";
import type { Account, Transaction } from "@/types";
import { CATEGORIES } from "@/lib/sample";
import { isoDay } from "@/lib/forecast";

/*
 * Small pieces the Transactions page and its parts share: the filter sentinels, which rows need a
 * person's eye, and how a row names its account and its day.
 */

export const NONE = "none"; // Select sentinel for "no account" / "no category"
export const CUSTOM = "custom"; // month-filter sentinel for a from/to date range

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM" for today, in local time. */
export const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

/** The month `n` steps from a "YYYY-MM" key (negative is back). */
export function shiftMonth(key: string, n: number): string {
  const d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** The last day of a "YYYY-MM" month, as yyyy-MM-dd (day 0 of the next month). */
export const monthEnd = (key: string) => isoDay(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0));

export const monthLabel = (key: string, style: "long" | "short" = "long") =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", { month: style, year: "numeric" });

/** Rows worth a look: no category / Uncategorized, or not linked to an account. */
export function needsReview(t: Transaction): boolean {
  if (t.transfer || t.settlement) return false;
  return !t.category || t.category === "Uncategorized" || t.accountId == null;
}

/**
 * Money sent to someone and filed as "Transfers": the word reads like moving your own money, so
 * it quietly counts as spend with no idea what it was for.
 */
export function paidToPerson(t: Transaction): boolean {
  return t.direction === "DEBIT" && t.category === "Transfers" && !t.transfer && !t.settlement;
}

/** No category yet, or the placeholder one. */
export const isUncategorised = (t: Transaction) => !t.category || t.category === "Uncategorized";

const FIXED_CATEGORIES = ["Card Payment", "Loan EMI", "Transfers", "Income", "Uncategorized"];
/** Every category worth offering: the standard set, the ones the ledger uses, and the fixed ones. */
export function allCategories(seen: string[]): string[] {
  return Array.from(new Set([...CATEGORIES, ...seen, ...FIXED_CATEGORIES]));
}
export function categoryItems(seen: string[]): { value: string; label: string }[] {
  return allCategories(seen).map((c) => ({ value: c, label: c }));
}

/** Category options = the standard set + Card Payment, with the row's own value folded in. */
export function categoryOptions(current?: string | null): string[] {
  const base = [...CATEGORIES, "Card Payment"];
  return current && !base.includes(current) ? [current, ...base] : base;
}

/** "Bandhan 8519" for a bank account, "card 0009" for a card — what the design's meta line shows. */
export function shortAccount(t: Transaction, byId: Map<number, Account>): string | null {
  const a = t.accountId != null ? byId.get(t.accountId) : undefined;
  if (!a) return t.accountName;
  if (a.type !== "SAVINGS") return `card ${a.last4}`;
  return `${a.bank.split(/\s+/)[0]} ${a.last4}`;
}

/** One or two letters for the row's avatar, from its readable name. */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** "Mon 28 Sept" — with the year only when it is not this one. */
export function dayHeading(day: string, today: string): string {
  const d = new Date(`${day}T00:00:00`);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return d
    .toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })
    .replace(/,/g, "");
}

/** Short date for lists: "26 Sept". */
export const shortDate = (t: Transaction) =>
  new Date(t.occurredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** A raw merchant string as a cache / lookup key. */
export const merchantKey = (raw: string) => raw.trim().toLowerCase();

/** Whether a media query matches, kept current — the review queue docks at xl and slides in below. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/** sessionStorage that never throws (private windows, blocked storage). */
export function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the cache is a convenience */
  }
}
