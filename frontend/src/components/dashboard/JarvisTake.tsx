import { useState } from "react";
import { Lightbulb, Loader2, Sparkles } from "lucide-react";
import { scoreColor } from "@/lib/useFinanceScore";
import type { FinanceScoreResult } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** The score as a ring filled to score/100, coloured by band. */
function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" role="img" aria-label={`Finance score ${score} of 100`}>
      <circle cx={32} cy={32} r={r} fill="none" stroke="var(--muted)" strokeWidth={6} />
      <circle
        cx={32}
        cy={32}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${(c * Math.max(0, Math.min(100, score))) / 100} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text x={32} y={38} textAnchor="middle" fill="currentColor" fontSize={18} fontWeight={700}>
        {score}
      </text>
    </svg>
  );
}

/**
 * The finance score and Jarvis's own words about it: the encouraging headline and the best tip,
 * in a strip right under the hero so it reads before the lists. The other tips sit one click away.
 */
export default function JarvisTake({ score, loading, error }: { score: FinanceScoreResult | null; loading: boolean; error: boolean }) {
  const [open, setOpen] = useState(false);
  if (!score && !loading) {
    return error ? (
      <p className="px-1 text-sm text-muted-foreground">Jarvis couldn't write its take right now — the AI service may be down.</p>
    ) : null;
  }
  const color = score ? scoreColor(score.score) : "var(--primary)";
  const [first, ...rest] = score?.tips ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-gradient-to-r from-primary/[0.07] to-transparent p-5 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex shrink-0 items-center gap-3 sm:border-r sm:pr-5">
        {score ? (
          <ScoreRing score={score.score} />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-full border-[6px] border-muted text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Sparkles className="size-3.5 text-primary" /> Finance score
          </div>
          <div className="text-lg font-semibold" style={{ color: score ? color : undefined }}>
            {score ? score.rating : "Scoring…"}
          </div>
        </div>
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
