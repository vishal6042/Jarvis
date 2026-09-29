import api from "@/api";

/*
 * The small AI helpers pages call (ai-orchestrator AssistController). Both run on the local model
 * and neither saves anything: the page shows the result for the person to accept.
 */

/** Filters understood from a typed search; every field is null when the search did not ask for it. */
export interface AiFilter {
  category: string | null;
  direction: "DEBIT" | "CREDIT" | null;
  minAmount: number | null;
  maxAmount: number | null;
  from: string | null; // yyyy-MM-dd
  to: string | null;
  accountId: number | null;
  text: string | null;
}

/** "food over ₹500 last week" → the Transactions page's own filters. */
export async function aiFilter(
  query: string,
  categories: string[],
  accounts: { id: number; name: string }[],
  today: string,
): Promise<AiFilter> {
  return (await api.post<AiFilter>("/api/ai/filter", { query, categories, accounts, today }, { timeout: 180000 })).data;
}

/** A transaction read from a payment screenshot or receipt, for the person to confirm. */
export interface AiReceipt {
  amount: number | null;
  merchant: string | null;
  occurredOn: string | null; // yyyy-MM-dd
  direction: "DEBIT" | "CREDIT";
  method: "UPI" | "CARD" | "CASH" | "NETBANKING" | null;
  reference: string | null;
  category: string | null;
  confidence: number;
}

/** Read an image (a data: URL or bare base64) on the local vision model. */
export async function aiReceipt(image: string, mimeType: string, categories: string[] = []): Promise<AiReceipt> {
  return (await api.post<AiReceipt>("/api/ai/receipt", { image, mimeType, categories }, { timeout: 180000 })).data;
}
