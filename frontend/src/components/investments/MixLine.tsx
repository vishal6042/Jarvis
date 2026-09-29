import { useMemo } from "react";
import { Link } from "react-router-dom";
import AiLine from "@/components/page/AiLine";
import { FIXED_RETURN_KINDS, MARKET_LINKED_KINDS, allocationByKind, totalValue, valueToday } from "@/lib/portfolio";
import type { Investment } from "@/lib/sample";
import { SHORT } from "./holdings";

const listOf = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0]);
const MIX_QUESTION = "Is my investment mix right for me: how much is fixed-return, how much moves with the market, and what is locked in?";

/**
 * Jarvis's one-line read of the portfolio: how much of it earns a fixed return and how much moves
 * with the market, and the biggest sum that is locked away and until when. It is the question
 * the table can't answer at a glance, and the one worth asking before adding the next holding.
 */
export default function MixLine({ items }: { items: Investment[] }) {
  const read = useMemo(() => {
    const total = totalValue(items);
    if (total <= 0) return null;
    const slices = allocationByKind(items);
    const share = (kinds: string[]) => slices.filter((s) => kinds.includes(s.kind)).reduce((s, k) => s + k.value, 0) / total;
    const fixedPct = Math.round(share(FIXED_RETURN_KINDS) * 100);
    const market = slices.filter((s) => MARKET_LINKED_KINDS.includes(s.kind));
    const marketPct = Math.round(share(MARKET_LINKED_KINDS) * 100);

    // The largest holding still locked in, and the year it opens up.
    const today = new Date();
    const locked = items
      .filter((i) => i.maturityDate && new Date(`${i.maturityDate}T00:00:00`) > today)
      .map((i) => ({ inv: i, value: valueToday(i, today).value }))
      .sort((a, b) => b.value - a.value)[0];
    const lockedLabel = locked ? (items.filter((i) => i.kind === locked.inv.kind).length === 1 ? SHORT[locked.inv.kind] : locked.inv.name) : null;
    const lockedPart = locked
      ? `, and ${lockedLabel} alone (${Math.round((locked.value / total) * 100)}%) is locked until ${(locked.inv.maturityDate as string).slice(0, 4)}`
      : "";

    const marketList = market.map((s) => `${SHORT[s.kind] === "Funds" ? "mutual funds" : SHORT[s.kind]} (${Math.round(s.pct)}%)`);
    if (fixedPct >= 50) {
      return {
        text: `${fixedPct >= 80 ? "Your money is safe and steady: " : ""}${fixedPct}% is in fixed-return products${lockedPart}.`,
        detail:
          market.length === 0
            ? "None of it moves with the market."
            : `Only ${listOf(marketList)} ${market.length === 1 ? "moves" : "move"} with the market.${fixedPct >= 80 ? " That mix is a choice worth making on purpose rather than by default." : ""}`,
      };
    }
    return {
      text: `${marketPct}% of your money moves with the market${lockedPart}.`,
      detail: `${listOf(marketList)}; fixed-return products hold the other ${100 - marketPct}%.`,
    };
  }, [items]);

  if (!read) return null;
  return (
    <AiLine
      text={read.text}
      detail={read.detail}
      action={
        <Link to={`/assistant?q=${encodeURIComponent(MIX_QUESTION)}`} className="whitespace-nowrap text-primary hover:underline">
          Ask about it →
        </Link>
      }
    />
  );
}
