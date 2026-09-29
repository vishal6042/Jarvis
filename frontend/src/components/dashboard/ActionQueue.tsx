import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import type { Insight, Severity } from "@/lib/insights";
import { Button } from "@/components/ui/button";

const RANK: Record<Severity, number> = { red: 0, amber: 1, info: 2, green: 3 };

const BADGE: Record<Severity, { label: string; className: string }> = {
  red: { label: "Urgent", className: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300" },
  amber: { label: "Watch", className: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300" },
  info: { label: "Idea", className: "bg-primary/10 text-primary" },
  green: { label: "Good", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

/**
 * What to do next, most urgent first: the insights as a row of cards, each with the one action
 * that deals with it. Four show; the rest are a click away rather than a scroll away.
 */
export default function ActionQueue({ insights }: { insights: Insight[] }) {
  const navigate = useNavigate();
  const [all, setAll] = useState(false);
  const ranked = [...insights].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const shown = all ? ranked : ranked.slice(0, 4);
  const pressing = insights.filter((i) => i.severity === "red" || i.severity === "amber").length;

  if (ranked.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border bg-card p-5 text-sm">
        <CheckCircle2 className="size-5 text-[color:var(--ok)]" />
        Nothing needs you right now. Jarvis will flag bills, budgets and unusual spending as they come up.
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">Do this next</h2>
        <span className="text-sm text-muted-foreground">
          {pressing > 0 ? `${pressing} need${pressing === 1 ? "s" : ""} attention` : "nothing urgent"} · most urgent first
        </span>
        <div className="flex-1" />
        {ranked.length > 4 && (
          <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `See all ${ranked.length}`}
          </button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {shown.map((i) => {
          const badge = BADGE[i.severity];
          return (
            <div key={i.id} className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4">
              <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
              <div className="text-base leading-snug font-semibold">{i.title}</div>
              <div className="text-sm text-muted-foreground">{i.detail}</div>
              {i.href && (
                <Button
                  variant={i.severity === "red" ? "default" : "outline"}
                  className="mt-auto h-10"
                  onClick={() => navigate(i.href!)}
                >
                  {i.cta ?? "Open"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
