export function formatINR(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: opts.compact ? 1 : 0,
    notation: opts.compact ? "compact" : "standard",
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * What the merchant charged when it was not rupees ("USD 118.00"), or null. The row's own amount
 * is then the INR equivalent the card is billed.
 */
export function formatOriginal(t: { originalAmount?: number | null; originalCurrency?: string | null }): string | null {
  if (t.originalAmount == null || !t.originalCurrency || t.originalCurrency === "INR") return null;
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: t.originalCurrency, currencyDisplay: "code" }).format(t.originalAmount);
  } catch {
    return `${t.originalCurrency} ${t.originalAmount.toFixed(2)}`;
  }
}
