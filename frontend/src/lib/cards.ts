import type { CardSummary } from "@/api";

/**
 * One entry per statement rather than per card. Cards sharing a billing group are billed on one
 * consolidated statement, and the server repeats that statement's bill, dates, limit and
 * utilisation on every card in the group, so anything that adds up bills or lists dues must
 * see the group once. Only {@code unbilled} is per card, so the merged entry sums it.
 */
export function statementsOf(cards: CardSummary[]): CardSummary[] {
  const out: CardSummary[] = [];
  const groups = new Map<string, CardSummary[]>();
  for (const c of cards) {
    if (!c.billingGroup) {
      out.push(c);
      continue;
    }
    const members = groups.get(c.billingGroup);
    if (members) {
      members.push(c);
    } else {
      groups.set(c.billingGroup, [c]);
      out.push(c); // placeholder, keeps the group where its first card was
    }
  }
  return out.map((c) => {
    const members = c.billingGroup ? groups.get(c.billingGroup) : undefined;
    if (!members || members.length < 2) return c;
    return {
      ...c,
      displayName: `${c.bank} •••• ${members.map((m) => m.last4).join(" · ")}`,
      unbilled: members.reduce((s, m) => s + m.unbilled, 0),
    };
  });
}
