import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Upload } from "lucide-react";
import { cardSummaries, listTransactions, type CardSummary } from "@/api";
import type { Transaction } from "@/types";
import { useFamily, useInvestments, useLoans, useReminderPayments, useReminders, useThresholds } from "@/lib/store";
import { useFinanceSummary } from "@/lib/finance";
import { useReserve } from "@/lib/prefs";
import { buildForecast } from "@/lib/forecast";
import { buildInsights } from "@/lib/insights";
import { currentMonthBreakdown } from "@/lib/breakdown";
import { useFinanceScore } from "@/lib/useFinanceScore";
import { openCommandBar } from "@/components/CommandBar";
import Hero from "@/components/dashboard/Hero";
import JarvisTake from "@/components/dashboard/JarvisTake";
import ActionQueue from "@/components/dashboard/ActionQueue";
import MonthSpendCard from "@/components/dashboard/MonthSpendCard";
import UpcomingCard from "@/components/dashboard/UpcomingCard";
import StatementsCard from "@/components/dashboard/StatementsCard";
import { GoalsCard, RecurringCard, WealthCard } from "@/components/dashboard/BottomRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** "tomorrow", "today", "in 3 days" or "on 30 Sept" for a yyyy-MM-dd. */
function whenFrom(iso: string, now = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((new Date(`${iso}T00:00:00`).getTime() - today) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  return `on ${new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

/**
 * The command centre: where the money is and where it is heading (hero), what Jarvis makes of it,
 * what to do next, then this month, the next two weeks and the cards side by side, and the
 * longer-term picture — investments, goals, recurring payments — at the bottom.
 */
export default function Dashboard() {
  const { activeId, activeMember } = useFamily();
  // A member with no income of their own: salary and earning are left out, and the score uses
  // the buffer-and-spending rubric. The whole household always earns, whoever earns it.
  const earns = activeMember.earns;
  const f = useFinanceSummary();
  const navigate = useNavigate();
  const now = new Date();

  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    listTransactions(0, 500)
      .then((t) => alive && setTxns(t))
      .catch(() => alive && setTxns([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const [cards, setCards] = useState<CardSummary[]>([]);
  useEffect(() => {
    cardSummaries().then(setCards).catch(() => setCards([]));
  }, []);
  const { items: reminders } = useReminders();
  const { paidKeys } = useReminderPayments();
  const { items: investments } = useInvestments(activeId);
  const { items: loans } = useLoans(activeId);
  const { items: thresholds } = useThresholds();
  const [reserve] = useReserve();

  // The month before the one the score uses, so the no-income rubric can say whether spending is
  // steady. Transfers and card settlements are excluded, the same way spend is counted elsewhere.
  const priorMonthSpend = useMemo(() => {
    // Deliberately not the `now` above: that is a fresh Date each render, and depending on it
    // would rebuild this every render and re-fire the scoring effect in a loop.
    const ref = new Date();
    const start = new Date(ref.getFullYear(), ref.getMonth() - 2, 1);
    const end = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
    return txns.reduce((sum, t) => {
      if (t.direction !== "DEBIT" || t.transfer || t.settlement) return sum;
      const at = new Date(t.occurredAt);
      return at >= start && at < end ? sum + t.amount : sum;
    }, 0);
  }, [txns]);

  // Memoised: the score hook keys its effect on this object.
  const metrics = useMemo(
    () => ({
      monthlyIncome: f.earning, // last completed month's income
      monthlySpend: f.lastMonthSpend, // pair with income — a full month, not this month's partial
      savingsRate: f.savingsRate,
      cashSavings: f.savings,
      investments: f.investments,
      outstandingLoans: f.outstanding,
      monthlyEmi: f.emiTotal,
      earnsIncome: earns,
      previousMonthSpend: priorMonthSpend,
    }),
    [f.earning, f.lastMonthSpend, f.savingsRate, f.savings, f.investments, f.outstanding, f.emiTotal, earns, priorMonthSpend],
  );
  const score = useFinanceScore(metrics);
  const [tipsOpen, setTipsOpen] = useState(false);

  const forecast = useMemo(
    () => buildForecast({ balance: f.savings, txns, reminders, cards, reserve, paidKeys, earns }),
    [f.savings, txns, reminders, cards, reserve, paidKeys, earns],
  );
  const breakdown = useMemo(() => currentMonthBreakdown(txns), [txns]);
  const reviewCount = useMemo(
    () => txns.filter((t) => !t.transfer && !t.settlement && (!t.category || t.category === "Uncategorized" || t.accountId == null)).length,
    [txns],
  );
  const insights = useMemo(
    () => buildInsights({ cards, reminders, txns, thresholds, breakdown, forecast, reviewCount, savingsRate: f.savingsRate, paidKeys }),
    [cards, reminders, txns, thresholds, breakdown, forecast, reviewCount, f.savingsRate, paidKeys],
  );

  // One line under the greeting: whose money this is, when salary lands, what needs attention.
  const salary = forecast.events.find((e) => e.kind === "income");
  const pressing = insights.filter((i) => i.severity === "red" || i.severity === "amber").length;
  const context = [
    now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
    activeId !== "all" && activeMember.relation !== "Self" ? `${activeMember.name}'s money` : null,
    salary ? `salary expected ${whenFrom(salary.on, now)}` : null,
    pressing > 0 ? `${pressing} thing${pressing === 1 ? "" : "s"} need${pressing === 1 ? "s" : ""} attention` : "nothing urgent",
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{greeting(now)}</h1>
          <p className="text-sm text-muted-foreground">{context.join(" · ")}</p>
        </div>
        <button
          type="button"
          onClick={openCommandBar}
          className="flex h-11 w-full items-center gap-2.5 rounded-xl border bg-card px-4 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 sm:w-80"
        >
          <Search className="size-4" />
          <span className="flex-1">Ask Jarvis anything…</span>
          <kbd className="rounded-md border px-1.5 py-0.5 font-mono text-xs">Ctrl K</kbd>
        </button>
      </div>

      <Hero
        savings={f.savings}
        investments={f.investments}
        loans={f.outstanding}
        forecast={forecast}
        score={score.result}
        scoreLoading={score.loading}
        scoreError={score.error}
        onWhy={() => setTipsOpen(true)}
      />

      {score.hasData && <JarvisTake score={score.result} loading={score.loading} error={score.error} open={tipsOpen} onOpenChange={setTipsOpen} />}

      <ActionQueue insights={insights} />

      {!loading && txns.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Upload className="size-6" />
            </div>
            <div>
              <p className="font-medium">No transactions yet</p>
              <p className="text-sm text-muted-foreground">Import a bank or credit-card statement to populate your dashboard.</p>
            </div>
            <Button onClick={() => navigate("/import")} className="gap-2">
              <Upload className="size-4" /> Import statement
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <MonthSpendCard b={breakdown} thresholds={thresholds} />
        <UpcomingCard cards={cards} txns={txns} investments={investments} loans={loans} reminders={reminders} paidKeys={paidKeys} earns={earns} />
        <StatementsCard cards={cards} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <WealthCard investments={investments} />
        <GoalsCard />
        <RecurringCard txns={txns} />
      </div>
    </div>
  );
}
