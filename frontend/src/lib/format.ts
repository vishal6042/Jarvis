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

// Names a person would recognise for the raw text bank alerts carry.
const KNOWN_MERCHANTS: [RegExp, string][] = [
  [/anthropic|claude/i, "Claude"],
  [/googleplay|google play/i, "Google Play"],
  [/rentomoj/i, "Rentomojo"],
  [/netflix/i, "Netflix"],
  [/swiggy/i, "Swiggy"],
  [/blinkit/i, "Blinkit"],
  [/make ?my ?trip/i, "MakeMyTrip"],
  [/amazon/i, "Amazon"],
  [/flipkart/i, "Flipkart"],
  [/myntra/i, "Myntra"],
  [/dmart|avenue supermarts/i, "DMart"],
  [/shell india/i, "Shell"],
  [/book ?my ?show/i, "BookMyShow"],
];

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());

/**
 * A readable merchant name: the accepted clean name when there is one, else the alert's text with
 * its UPI reference, "IN" suffix and bank prefixes taken off ("UPI-653782697753-Blinkit IN" →
 * "Blinkit", "Loan A/c No.XXXXX432573" → "Loan a/c ••2573").
 */
export function merchantLabel(t: { merchantNorm?: string | null; merchant?: string | null }): string {
  if (t.merchantNorm) return t.merchantNorm;
  const raw = (t.merchant ?? "").trim();
  if (!raw) return "Unknown";
  for (const [re, name] of KNOWN_MERCHANTS) if (re.test(raw)) return name;
  const loan = raw.match(/loan a\/c no\.?\s*x*\d*(\d{4})\b/i);
  if (loan) return `Loan a/c ••${loan[1]}`;
  const internal = raw.match(/internal trf\/\w+\/\d+\/(?:from|to)-?(.+)/i);
  if (internal) return `Transfer · ${internal[1].trim()}`;
  const cleaned = raw
    .replace(/^UPI[-/]\d+[-/]/i, "")
    .replace(/\s+IN$/, "")
    .replace(/\*.*$/, "")
    .trim();
  const name = cleaned || raw;
  return name === name.toUpperCase() && /[A-Z]{3}/.test(name) ? titleCase(name) : name;
}
