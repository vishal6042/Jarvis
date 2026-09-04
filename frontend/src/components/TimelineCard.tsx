import { useNavigate } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import CardArt from "@/components/CardArt";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import type { Forecast, ForecastEvent } from "@/lib/forecast";

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

const COLOR: Record<ForecastEvent["kind"], string> = {
  income: "var(--ok)",
  reminder: "var(--warn)",
  card: "var(--danger)",
  start: "var(--info)",
  end: "var(--primary)",
};

/** The next 30 days as a vertical timeline: each known event and the balance after it. */
export default function TimelineCard({ f }: { f: Forecast }) {
  const navigate = useNavigate();
  return (
    <Card className="relative isolate h-full overflow-hidden">
      <CardArt color="var(--info)" subtle />
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4 text-[var(--info)]" /> Next 30 days
        </CardTitle>
        <CardDescription>
          {f.healthy
            ? `Lowest point ${formatINR(f.minBalance)} on ${fmtDay(f.minOn)} — above your ${formatINR(f.reserve, { compact: true })} reserve`
            : `Dips to ${formatINR(f.minBalance)} on ${fmtDay(f.minOn)} — below your ${formatINR(f.reserve, { compact: true })} reserve`}
          {f.unknownCount > 0 ? ` · ${f.unknownCount} bill${f.unknownCount === 1 ? "" : "s"} without an amount` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="relative ml-2 border-l border-border/70 pl-5">
          {f.events.map((e, i) => {
            const last = i === f.events.length - 1;
            return (
              <li key={`${e.on}-${e.label}-${i}`} className={`relative ${last ? "" : "pb-4"}`}>
                <span
                  className="absolute top-1.5 -left-[1.6rem] size-3 rounded-full ring-4 ring-card"
                  style={{ backgroundColor: COLOR[e.kind] }}
                />
                <button
                  type="button"
                  onClick={() => e.href && navigate(e.href)}
                  disabled={!e.href}
                  className="flex w-full items-start justify-between gap-3 text-left disabled:cursor-default"
                >
                  <span className="min-w-0">
                    <span className="block text-xs text-muted-foreground">{fmtDay(e.on)}</span>
                    <span className={`block truncate text-sm ${e.kind === "start" || e.kind === "end" ? "font-semibold" : "font-medium"}`}>
                      {e.label}
                    </span>
                    {e.detail && <span className="block text-xs text-muted-foreground">{e.detail}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    {e.kind === "start" || e.kind === "end" ? (
                      <span className="text-sm font-bold tabular-nums">{formatINR(e.balanceAfter)}</span>
                    ) : e.unknownAmount ? (
                      <span className="text-xs text-muted-foreground">amount not set</span>
                    ) : (
                      <>
                        <span className={`block text-sm font-semibold tabular-nums ${e.amount > 0 ? "text-[var(--ok)]" : ""}`}>
                          {e.amount > 0 ? "+" : "−"}
                          {formatINR(Math.abs(e.amount))}
                        </span>
                        <span className="block text-[11px] text-muted-foreground tabular-nums">→ {formatINR(e.balanceAfter, { compact: true })}</span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
