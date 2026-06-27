import { formatINR } from "./format";

export interface FinanceContext {
  memberName: string; // "your" or a member name
  savings: number; // net worth from savings
  earning: number; // this month
  spend: number; // this month
  outstanding: number; // loans
  emiTotal: number; // monthly EMI
  investments: number; // current value
  savingsRate: number; // %
}

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

/** Heuristic, FE-only Q&A over the user's data. Swappable to the backend Ollama agent later. */
export function answerQuery(question: string, c: FinanceContext): string {
  const q = question.toLowerCase();
  const who = c.memberName === "your" ? "your" : `${c.memberName}'s`;

  if (has(q, "net worth", "networth", "saving", "savings")) {
    return `${who === "your" ? "Your" : who} savings (net worth) is ${formatINR(c.savings)}. This month: earned ${formatINR(c.earning)}, spent ${formatINR(c.spend)} — a savings rate of ${c.savingsRate}%.`;
  }
  if (has(q, "spend", "spent", "expense", "expenditure")) {
    return `${who === "your" ? "You" : c.memberName} spent ${formatINR(c.spend)} this month.`;
  }
  if (has(q, "earn", "income", "salary")) {
    return `${who === "your" ? "Your" : who} income this month is ${formatINR(c.earning)}.`;
  }
  if (has(q, "emi")) {
    return `Total monthly EMI is ${formatINR(c.emiTotal)} across ${who} loans.`;
  }
  if (has(q, "loan", "outstanding", "debt", "owe")) {
    return `Outstanding loans total ${formatINR(c.outstanding)}, with ${formatINR(c.emiTotal)} due in EMIs each month.`;
  }
  if (has(q, "invest", "mutual", "sip", "fund", "fd", "ppf")) {
    return `${who === "your" ? "Your" : who} investments are currently worth ${formatINR(c.investments)}.`;
  }
  if (has(q, "rate")) {
    return `${who === "your" ? "Your" : who} savings rate this month is ${c.savingsRate}%.`;
  }
  if (has(q, "summary", "overview", "how am i", "doing")) {
    return `Snapshot — savings ${formatINR(c.savings)}, investments ${formatINR(c.investments)}, outstanding loans ${formatINR(c.outstanding)}. This month: earned ${formatINR(c.earning)}, spent ${formatINR(c.spend)} (${c.savingsRate}% saved).`;
  }

  return `I can answer questions about ${who} savings, spending, income, loans/EMIs, and investments. Try: "What are my savings this month?" or "How much do I owe in loans?"`;
}

export const ASSISTANT_SUGGESTIONS = [
  "What are my savings this month?",
  "How much did I spend this month?",
  "What's my outstanding loan amount?",
  "How much are my investments worth?",
  "Give me a summary",
];
