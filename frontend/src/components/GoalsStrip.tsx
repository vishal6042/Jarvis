import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Target } from "lucide-react";
import CardArt from "@/components/CardArt";
import { getGoals, type ApiGoal } from "@/lib/api/finance";
import { formatINR } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FALLBACK = "#8b5cf6";

/** Compact progress strip for the dashboard: the goals page has the full view and forecasts. */
export default function GoalsStrip() {
  const navigate = useNavigate();
  const [goals, setGoals] = useState<ApiGoal[] | null>(null);
  useEffect(() => {
    let alive = true;
    getGoals()
      .then((g) => alive && setGoals(g))
      .catch(() => alive && setGoals([]));
    return () => {
      alive = false;
    };
  }, []);

  if (!goals || goals.length === 0) return null;
  const active = [...goals]
    .sort((a, b) => b.savedAmount / Math.max(1, b.targetAmount) - a.savedAmount / Math.max(1, a.targetAmount))
    .slice(0, 4);
  const saved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const target = goals.reduce((s, g) => s + g.targetAmount, 0);

  return (
    <Card className="relative isolate cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:shadow-primary/10 hover:ring-1 hover:ring-primary/40" onClick={() => navigate("/goals")}>
      <CardArt color={FALLBACK} icon={Target} subtle />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4 text-primary" /> Goals
          </CardTitle>
          <CardDescription>
            {formatINR(saved)} of {formatINR(target)} across {goals.length} goal{goals.length > 1 ? "s" : ""}
          </CardDescription>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {active.map((g) => {
          const color = g.color ?? FALLBACK;
          const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100)) : 0;
          return (
            <div key={g.id} className="rounded-xl border bg-card/60 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">{g.name}</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color }}>
                  {pct}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">
                {formatINR(g.savedAmount)} of {formatINR(g.targetAmount)}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
