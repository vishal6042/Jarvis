import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { Visual } from "@/types";

/*
 * The next question, one click away. Suggestions come from what was asked and from the figures the
 * answer drew — never from the model's prose — so they are cheap, predictable and always about
 * something the answer actually showed.
 */

export interface FollowUpSet {
  questions: string[];
  /** Where the full picture lives, when the answer was about spending. */
  analyticsHref?: string;
}

const SPEND_WORDS = /\b(spen[dt]|spending|expens|cost|paid|bought|shop|food|categor|merchant|bills?|where did)/i;

/**
 * The biggest row of the answer's breakdown whose title matches. Titles, not tone: the tools send
 * investments and loans with the spend tone too, and "What was in PPF?" would make no sense.
 */
function topOf(visuals: Visual[], title: RegExp): string | null {
  const b = visuals.find((v) => v.kind === "breakdown" && title.test(v.title) && v.points.length > 0);
  if (!b) return null;
  const best = b.points.reduce((a, p) => ((p.value ?? 0) > (a.value ?? 0) ? p : a));
  return best.label?.trim() || null;
}

export function followUpsFor(question: string, visuals: Visual[] = []): FollowUpSet {
  const q = question.toLowerCase();
  const topCategory = topOf(visuals, /by category/i);
  const topMerchant = topOf(visuals, /merchant/i);
  const spendy = SPEND_WORDS.test(q) || visuals.some((v) => /^spend|spent|merchant/i.test(v.title));
  const out: string[] = [];

  if (topCategory) out.push(`What was in ${topCategory}?`);
  if (topMerchant) out.push(`What did I buy at ${topMerchant}?`);
  if (spendy) out.push(/last month/.test(q) ? "Compare with the month before" : "Compare with last month");
  if (/sav/.test(q)) out.push("How can I save more this month?");
  if (/loan|emi|debt/.test(q)) out.push("When will I be debt-free?");
  if (/invest|sip|\bfd\b|mutual|portfolio/.test(q)) out.push("What matures next?");
  if (/safe to spend|afford|left to spend/.test(q)) out.push("What's due before salary?");
  // Too little to go on: offer the two questions that are always worth asking.
  for (const fallback of ["What's due this week?", "Give me a summary"]) {
    if (out.length >= 2) break;
    out.push(fallback);
  }

  const asked = q.replace(/[?.!\s]+$/, "");
  const questions = Array.from(new Set(out))
    .filter((s) => s.toLowerCase().replace(/[?.!\s]+$/, "") !== asked)
    .slice(0, 3);
  return {
    questions,
    analyticsHref: spendy ? (topCategory ? `/analytics?category=${encodeURIComponent(topCategory)}` : "/analytics") : undefined,
  };
}

/** Suggestion chips under an answer; clicking one asks it. */
export default function FollowUps({ set, disabled, onAsk }: { set: FollowUpSet; disabled: boolean; onAsk: (q: string) => void }) {
  if (set.questions.length === 0 && !set.analyticsHref) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {set.questions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onAsk(s)}
          disabled={disabled}
          className="h-8 rounded-full border bg-card px-3 text-[13px] transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
        >
          {s}
        </button>
      ))}
      {set.analyticsHref && (
        <Link to={set.analyticsHref} className="inline-flex h-8 items-center gap-1 px-1 text-[13px] font-medium text-primary hover:underline">
          Open in Analytics <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}
