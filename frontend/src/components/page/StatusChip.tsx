import type { ReactNode } from "react";

export type ChipTone = "urgent" | "watch" | "idea" | "good" | "neutral" | "ai";

const TONES: Record<ChipTone, string> = {
  urgent: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  watch: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  idea: "bg-primary/10 text-primary",
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  neutral: "bg-muted text-muted-foreground",
  ai: "border border-dashed border-primary/50 text-primary",
};

/** The app's one set of status labels: Urgent, Watch, Idea, Good, a neutral tag, and "✦ Jarvis suggests". */
export default function StatusChip({ tone, children, className = "" }: { tone: ChipTone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}>{children}</span>;
}
