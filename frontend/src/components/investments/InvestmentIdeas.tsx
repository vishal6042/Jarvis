import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import Panel from "@/components/page/Panel";
import StatusChip, { type ChipTone } from "@/components/page/StatusChip";
import { getGoals, type ApiGoal } from "@/lib/api/finance";
import { useFinanceSummary } from "@/lib/finance";
import { formatINR } from "@/lib/format";
import { useReserve } from "@/lib/prefs";
import type { Investment } from "@/lib/sample";
import { lakh, monthYear, nextMaturity, pct1, returnCaveat, SHORT } from "./holdings";

interface Idea {
  key: string;
  tone: ChipTone;
  chip: string;
  title: string;
  detail: string;
  action?: ReactNode;
}

const at = (iso: string) => new Date(`${iso}T00:00:00`);

/** "a month", "4 months", "2 years". */
function gapText(months: number): string {
  if (months <= 1) return "a month";
  if (months < 24) return `${months} months`;
  return `${Math.round(months / 12)} years`;
}

/**
 * What Jarvis would point out about these holdings alongside the cash and goals around them.
 * Each card is worked out from data and shown only when it applies — cash above the reserve, a
 * maturity landing after a goal needs the money, an EPF return that rests on an assumption, the
 * 80C room LIC premiums take — so an empty panel means there is nothing to say, not a gap.
 */
export default function InvestmentIdeas({ items }: { items: Investment[] }) {
  const f = useFinanceSummary();
  const [reserve] = useReserve();
  const [goals, setGoals] = useState<ApiGoal[]>([]);
  useEffect(() => {
    let alive = true;
    getGoals()
      .then((g) => alive && setGoals(g))
      .catch(() => alive && setGoals([]));
    return () => {
      alive = false;
    };
  }, []);

  const ideas = useMemo(() => {
    const out: Idea[] = [];
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    // 1 · Cash sitting idle above the reserve.
    const spare = f.savings - reserve;
    if (f.savingsAccounts.length > 0 && spare > 0) {
      out.push({
        key: "cash",
        tone: "idea",
        chip: "Idea",
        title: `${lakh(spare)} of cash is above your reserve`,
        detail: `${lakh(f.savings)} sits in savings; your reserve is ${lakh(reserve)}. A sweep or short FD would earn on the rest.`,
      });
    }

    // 2 · The next maturity lands after a goal needs its money.
    const next = nextMaturity(items, today);
    if (next) {
      const goal = goals
        .filter((g) => g.targetDate && g.savedAmount < g.targetAmount && g.targetDate >= todayIso.slice(0, 7) && at(g.targetDate) < next.on)
        .sort((a, b) => (b.targetDate as string).localeCompare(a.targetDate as string))[0];
      if (goal?.targetDate) {
        const kinds = new Set(next.items.map((i) => i.kind));
        const only = next.items[0].kind;
        const noun = kinds.size > 1 ? "Deposits" : only === "LIC" ? (next.items.length > 1 ? "LIC policies" : "LIC policy") : `${SHORT[only]}${next.items.length > 1 ? "s" : ""}`;
        const verb = next.items.length > 1 ? "mature" : "matures";
        // Calendar months apart: a June target and an August payout are "2 months", whatever the days.
        const target = at(goal.targetDate);
        const gap = Math.max(1, (next.on.getFullYear() - target.getFullYear()) * 12 + (next.on.getMonth() - target.getMonth()));
        const left = goal.targetAmount - goal.savedAmount;
        const cover = next.total >= left ? "they cover what is left of it" : `they cover ${Math.round((next.total / left) * 100)}% of the ${lakh(left)} still to go`;
        out.push({
          key: "goal",
          tone: "idea",
          chip: "Idea",
          title: `${next.items.length > 1 ? noun : `Your ${noun}`} ${verb} ${gapText(gap)} after the ${goal.name} target`,
          detail: `${lakh(next.total)} in ${monthYear(next.on)} against ${goal.name} in ${monthYear(at(goal.targetDate))}. Move the goal to ${monthYear(next.on)} and ${next.items.length > 1 ? cover : cover.replace("they cover", "it covers")}.`,
          action: (
            <Link to="/goals" className="text-sm font-semibold whitespace-nowrap text-primary hover:underline">
              Plan →
            </Link>
          ),
        });
      }
    }

    // 3 · EPF's return is an estimate, and says what it rests on.
    const caveat = returnCaveat(items, today);
    if (caveat) {
      const sip = caveat.inv.sip ?? 0;
      out.push({
        key: "return",
        tone: "watch",
        chip: "Watch",
        title: `EPF's ${pct1(caveat.annualised)} a year is an estimate`,
        detail: `Jarvis knows only the ${lakh(caveat.inv.principal)} put in and today's ${formatINR(sip)} a month, so it assumes that went in over the last ${caveat.assumedYears} year${caveat.assumedYears === 1 ? "" : "s"}, not in smaller amounts since ${caveat.startYear}. The passbook's yearly balances would give a true figure.`,
      });
    }

    // 4 · 80C: LIC premiums, on the old regime only. The EPF share isn't known here, so it isn't summed.
    const lic = items.filter((i) => i.kind === "LIC" && (i.sip ?? 0) > 0);
    const premiums = lic.reduce((s, i) => s + (i.sip ?? 0) * (i.contributionFrequency === "yearly" ? 1 : 12), 0);
    if (premiums > 0) {
      const epf = items.some((i) => i.kind === "PF");
      out.push({
        key: "tax",
        tone: "idea",
        chip: "Tax",
        title: "If you're on the old tax regime",
        detail: `LIC premiums ${formatINR(Math.round(premiums))} a year${epf ? " plus your EPF share" : ""} count toward the ₹1.5L 80C limit.`,
      });
    }
    return out;
  }, [items, goals, f.savings, f.savingsAccounts.length, reserve]);

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> Jarvis's ideas
        </span>
      }
      note="from your holdings, goals and cash together"
    >
      {ideas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing stands out right now. Ideas appear here when your cash, goals or holdings call for one.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {ideas.map((i) => (
            <div key={i.key} className="flex flex-col gap-2 rounded-xl border border-border/70 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
              <StatusChip tone={i.tone} className="mt-0.5">
                {i.chip}
              </StatusChip>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{i.title}</p>
                <p className="text-[13px] text-muted-foreground">{i.detail}</p>
              </div>
              {i.action && <div className="shrink-0 sm:self-center">{i.action}</div>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
