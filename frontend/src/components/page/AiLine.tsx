import type { ReactNode } from "react";
import { Loader2, Sparkles } from "lucide-react";

/**
 * Jarvis's one-line read of a page, under its header: the observation, a second line on what it
 * means, and at most one action. The same on every page, so it is recognisable as the AI's voice.
 */
export default function AiLine({
  text,
  detail,
  action,
  loading = false,
  leading,
}: {
  text: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  loading?: boolean;
  /** Replaces the sparkle, e.g. with a score ring. */
  leading?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-gradient-to-r from-primary/[0.07] to-transparent p-4 sm:flex-row sm:items-center sm:gap-4">
      {leading ?? (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {loading ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-[15px] leading-snug font-medium">{text}</p>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      </div>
      {action && <div className="shrink-0 text-sm font-semibold">{action}</div>}
    </section>
  );
}
