import { Lightbulb, Loader2, Sparkles } from "lucide-react";
import { scoreColor } from "@/lib/useFinanceScore";
import type { FinanceScoreResult } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Jarvis's own words about the month: the score's encouraging headline and its best tip, in a
 * strip right under the hero so it reads before the lists. The other tips sit one click away.
 */
export default function JarvisTake({
  score,
  loading,
  error,
  open,
  onOpenChange: setOpen,
}: {
  score: FinanceScoreResult | null;
  loading: boolean;
  error: boolean;
  /** The all-tips dialog, controlled so the hero's "Why?" link can open it too. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!score && !loading) {
    return error ? (
      <p className="px-1 text-sm text-muted-foreground">Jarvis couldn't write its take right now — the AI service may be down.</p>
    ) : null;
  }
  const color = score ? scoreColor(score.score) : "var(--primary)";
  const [first, ...rest] = score?.tips ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-gradient-to-r from-primary/[0.07] to-transparent p-5 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {loading && !score ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
      </div>
      {score ? (
        <>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[15px] leading-snug font-medium">{score.headline}</p>
            {first && (
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0" style={{ color }} />
                <span>{first}</span>
              </p>
            )}
          </div>
          {rest.length > 0 && (
            <button type="button" className="shrink-0 text-sm font-medium text-primary hover:underline" onClick={() => setOpen(true)}>
              {rest.length} more tip{rest.length > 1 ? "s" : ""}
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Jarvis is reading your month…</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Finance score {score?.score} · <span style={{ color }}>{score?.rating}</span>
            </DialogTitle>
            <DialogDescription>Savings, debt, buffer and investing, assessed by Jarvis.</DialogDescription>
          </DialogHeader>
          {score && (
            <div className="space-y-3">
              <p className="font-medium leading-snug">{score.headline}</p>
              <ul className="space-y-2">
                {score.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Lightbulb className="mt-0.5 size-4 shrink-0" style={{ color }} />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
