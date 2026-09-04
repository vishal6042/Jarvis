import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Sparkles } from "lucide-react";
import CardArt from "@/components/CardArt";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Insight, Severity } from "@/lib/insights";

const DOT: Record<Severity, string> = {
  red: "var(--danger)",
  amber: "var(--warn)",
  green: "var(--ok)",
  info: "var(--info)",
};

/** "Jarvis noticed …" — the rule-based action centre. Top three shown; the rest behind "View all". */
export default function InsightsCard({ insights }: { insights: Insight[] }) {
  const navigate = useNavigate();
  const [all, setAll] = useState(false);
  const shown = all ? insights : insights.slice(0, 3);
  const urgent = insights.filter((i) => i.severity === "red").length;
  return (
    <Card className="relative isolate h-full overflow-hidden">
      <CardArt color="var(--primary)" subtle />
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary jarvis-pulse" />
          Jarvis noticed {insights.length === 0 ? "nothing unusual" : `${insights.length} thing${insights.length === 1 ? "" : "s"}`}
        </CardTitle>
        <CardDescription>
          {urgent > 0 ? `${urgent} need${urgent === 1 ? "s" : ""} action` : "Computed from your ledger, not guessed"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.length === 0 && (
          <p className="text-sm text-muted-foreground">Bills are paid, budgets hold, and nothing is out of pattern.</p>
        )}
        {shown.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => i.href && navigate(i.href)}
            disabled={!i.href}
            className="flex w-full items-start gap-3 rounded-lg border bg-background/40 px-3 py-2 text-left transition-colors hover:bg-background/70 disabled:cursor-default"
          >
            <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: DOT[i.severity] }} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{i.title}</span>
              <span className="block text-xs text-muted-foreground">{i.detail}</span>
            </span>
            {i.href && (
              <span className="mt-1 inline-flex shrink-0 items-center text-xs text-primary">
                {i.cta ?? "Open"} <ChevronRight className="size-3" />
              </span>
            )}
          </button>
        ))}
        {insights.length > 3 && (
          <button type="button" onClick={() => setAll((v) => !v)} className="w-full pt-1 text-center text-xs text-primary hover:underline">
            {all ? "Show fewer" : `View all ${insights.length}`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
