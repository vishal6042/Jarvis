import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import CardArt from "@/components/CardArt";
import { netWorthTrend } from "@/api";
import type { NetWorthPoint } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const netWorthConfig = {
  netWorth: { label: "Net worth", color: "#8b5cf6" },
} satisfies ChartConfig;

/** Month-end savings cash for the last 12 months, optionally lifted by the investment portfolio. */
export default function NetWorthTrendCard({ addInvestments = 0 }: { addInvestments?: number }) {
  const [points, setPoints] = useState<NetWorthPoint[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    netWorthTrend(12)
      .then((p) => alive && setPoints(p))
      .catch(() => alive && setPoints([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const data = useMemo(
    () =>
      points.map((p) => ({
        label: new Date(`${p.month}-01T00:00:00`).toLocaleString(undefined, { month: "short" }),
        netWorth: Math.round(Number(p.netWorth)) + addInvestments,
      })),
    [points, addInvestments],
  );
  const hasData = data.some((d) => d.netWorth !== 0);

  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="#8b5cf6" subtle />
      <CardHeader>
        <CardTitle>Net worth trend</CardTitle>
        <CardDescription>
          Savings cash at each month-end{addInvestments > 0 ? " · incl. investments" : ""} · last 12 months
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : !hasData ? (
          <div className="flex h-[260px] flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium">No balance history yet</p>
            <p className="text-sm text-muted-foreground">Import a savings statement to build your net-worth trend.</p>
          </div>
        ) : (
          <ChartContainer config={netWorthConfig} className="h-[260px] w-full">
            <AreaChart data={data} margin={{ left: 16, right: 16, top: 8 }}>
              <defs>
                <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-netWorth)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-netWorth)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
              <YAxis hide domain={["auto", "auto"]} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Area dataKey="netWorth" name="Net worth" type="monotone" stroke="var(--color-netWorth)" fill="url(#nw-fill)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
