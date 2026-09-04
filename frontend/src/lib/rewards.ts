import { useCallback, useState } from "react";
import type { Account } from "@/types";

/** Reward rate (%) per category for one card, with a default for everything else. */
export interface CardRewards {
  defaultPct: number;
  byCategory: Record<string, number>;
}

const KEY = "jarvis_rewards";

function read(): Record<string, CardRewards> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, CardRewards>) : {};
  } catch {
    return {};
  }
}

/** Sensible starting points; edit them on the Accounts page. */
export function defaultsFor(a: Account): CardRewards {
  const name = `${a.displayName} ${a.bank}`.toLowerCase();
  if (name.includes("amazon")) return { defaultPct: 1, byCategory: { Shopping: 5 } };
  if ((a.network ?? "").toUpperCase() === "AMEX") return { defaultPct: 1.5, byCategory: { Food: 3, Entertainment: 3 } };
  return { defaultPct: 1, byCategory: {} };
}

export function useRewards(): [Record<string, CardRewards>, (accountId: number, cfg: CardRewards) => void] {
  const [map, setMap] = useState<Record<string, CardRewards>>(read);
  const set = useCallback((accountId: number, cfg: CardRewards) => {
    setMap((m) => {
      const next = { ...m, [String(accountId)]: cfg };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return [map, set];
}

export interface CardPick {
  account: Account;
  pct: number;
  value: number;
}

/** Rank the credit cards by estimated reward for an amount in a category. */
export function bestCard(amount: number, category: string, cards: Account[], cfg: Record<string, CardRewards>): CardPick[] {
  return cards
    .filter((c) => c.type === "CREDIT_CARD")
    .map((c) => {
      const r = cfg[String(c.id)] ?? defaultsFor(c);
      const pct = r.byCategory[category] ?? r.defaultPct;
      return { account: c, pct, value: Math.round((amount * pct) / 100) };
    })
    .sort((a, b) => b.value - a.value);
}
