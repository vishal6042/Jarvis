import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, Repeat, TrendingUp } from "lucide-react";
import CardArt from "@/components/CardArt";
import type { RecurringPayment, Transaction } from "@/types";
import { recurringIntelligence } from "@/lib/analytics";
import { formatINR, formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * What the subscriptions actually cost and what has changed about them: the yearly bill, any
 * price rises against the first charge seen, and charges that have stopped arriving.
 */
export default function RecurringIntelligenceCard({
  recurring,
  txns,
}: {
  recurring: RecurringPayment[];
  txns: Transaction[];
}) {
  const navigate = useNavigate();
  const intel = useMemo(() => recurringIntelligence(recurring, txns), [recurring, txns]);
  if (intel.items.length === 0) return null;

  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="#8b5cf6" subtle />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="size-4 text-primary" /> Recurring cost
        </CardTitle>
        <CardDescription>
          {formatINR(intel.monthlyTotal)} a month, {formatINR(intel.yearlyTotal)} a year across {intel.items.length}{" "}
          {intel.items.length === 1 ? "payment" : "payments"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(intel.increased.length > 0 || intel.stale.length > 0) && (
          <div className="space-y-2">
            {intel.increased.map((i) => (
              <div
                key={`up-${i.merchant}`}
                className="flex items-center gap-2.5 rounded-lg border p-2.5 text-sm"
                style={{ borderColor: "color-mix(in oklab, var(--warn) 45%, transparent)" }}
              >
                <TrendingUp className="size-4 shrink-0" style={{ color: "var(--warn)" }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {i.merchant} costs {i.changePct}% more than it did
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatINR(i.firstAmount ?? 0)} then, {formatINR(i.amount)} now · {formatINR(i.yearlyCost)} a year
                  </div>
                </div>
              </div>
            ))}
            {intel.stale.map((i) => (
              <div
                key={`stale-${i.merchant}`}
                className="flex items-center gap-2.5 rounded-lg border p-2.5 text-sm"
                style={{ borderColor: "color-mix(in oklab, var(--info) 45%, transparent)" }}
              >
                <AlertTriangle className="size-4 shrink-0" style={{ color: "var(--info)" }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{i.merchant} has not charged you as expected</div>
                  <div className="text-xs text-muted-foreground">
                    Due {formatDate(i.nextExpected)}, {i.overdueDays} days ago · cancelled, or a payment that failed
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          {intel.items.map((i) => (
            <button
              key={i.merchant}
              type="button"
              onClick={() => navigate(`/transactions?q=${encodeURIComponent(i.merchant)}`)}
              className="flex w-full items-center gap-2.5 rounded-lg border p-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{i.merchant}</span>
                  {i.changePct != null && i.changePct > 5 && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: "color-mix(in oklab, var(--warn) 18%, transparent)", color: "var(--warn)" }}>
                      <ArrowUpRight className="size-2.5" /> {i.changePct}%
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {i.cadence} · {i.category ?? "Uncategorized"} · next {formatDate(i.nextExpected)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-semibold tabular-nums">{formatINR(i.amount)}</div>
                <div className="text-[11px] text-muted-foreground">{formatINR(i.yearlyCost)}/yr</div>
              </div>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Cancelling the lot would free {formatINR(intel.yearlyTotal)} a year. Tap one to see every charge.
        </p>
      </CardContent>
    </Card>
  );
}
