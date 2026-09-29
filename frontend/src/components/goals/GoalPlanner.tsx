import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import Panel from "@/components/page/Panel";
import StatusChip from "@/components/page/StatusChip";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import PlanChart from "./PlanChart";
import {
  COUNT_WAYS,
  againstKeep,
  inWords,
  longDate,
  monthLong,
  monthName,
  monthShort,
  monthsBetween,
  monthsWord,
  payoutNoun,
  planOptions,
  type FundedPlan,
  type GoalRead,
  type Payout,
} from "./plan";

/** One of the planner's options: a date as its title, a verdict on the right, then the working. */
function Option({
  title,
  verdict,
  recommended,
  muted,
  children,
}: {
  title: string;
  verdict?: ReactNode;
  recommended?: boolean;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-2.5 rounded-xl p-4 ${
        recommended ? "border-2 border-primary bg-primary/[0.03]" : "border"
      } ${muted ? "opacity-80" : ""}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 text-[15px] font-semibold">{title}</span>
        {verdict}
      </div>
      {children}
    </div>
  );
}

/**
 * The goal planner: three ways to reach the selected goal, worked out from what you keep each month
 * and the deposits already maturing. (a) keep the date and see what it costs a month, (b) let the
 * maturing FDs/RDs carry part of it and set aside a comfortable monthly amount, (c) change nothing
 * and see when today's pace gets there. An option whose data is missing is left out, not faked.
 */
export default function GoalPlanner({
  read,
  keep,
  basis,
  payouts,
  reminderOn,
  onUsePlan,
  onSetAside,
  onAdjust,
  today = new Date(),
}: {
  read: GoalRead;
  keep: number;
  /** How many months "what you keep" is the median of. */
  basis: number;
  payouts: Payout[];
  reminderOn: boolean;
  onUsePlan: (plan: FundedPlan) => void;
  onSetAside: (amount: number) => void;
  onAdjust: () => void;
  today?: Date;
}) {
  const g = read.goal;
  const target = g.targetDate ? new Date(`${g.targetDate}T00:00:00`) : null;
  const { keepDate, plan, eta, count } = planOptions(read, keep, payouts, today);
  const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  // Keeping the date wins when it fits; otherwise the deposits plan does.
  const recommend: "a" | "b" | null = keepDate?.realistic ? "a" : plan ? "b" : null;

  const plural = plan ? plan.used.length > 1 : false;
  const kindSet = plan ? [...new Set(plan.used.map((p) => p.inv.kind))] : [];
  const oneKind = kindSet.length === 1 ? kindSet[0] : null;
  // "FDs", "RD", or "deposits" when the plan mixes both — for the chart label and "FDs kept".
  const kinds = oneKind ? `${oneKind}${plural ? "s" : ""}` : "deposits";
  const planName = `${oneKind ?? "deposit"} plan`;
  const noun = plan ? payoutNoun(plan.used) : "";
  const payMonths = plan ? [...new Set(plan.used.map((p) => p.on.slice(0, 7)))] : [];
  const payWhen = plan
    ? payMonths.length === 1
      ? `in ${monthLong(new Date(`${plan.used[0].on}T00:00:00`))}`
      : `between ${monthShort(new Date(`${plan.used[0].on}T00:00:00`))} and ${monthShort(new Date(`${plan.used[plan.used.length - 1].on}T00:00:00`))}`
    : "";

  return (
    <Panel
      id="goal-planner"
      title={
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.06em] text-primary uppercase">
            <Sparkles className="size-3.5" /> Goal planner
          </span>
          <span className="text-xl font-semibold">
            {count === 0 ? `Planning ${g.name}` : `${COUNT_WAYS[count]} to reach ${g.name}`}
          </span>
        </span>
      }
    >
      <p className="-mt-2 text-[13px] text-muted-foreground">
        {count === 0
          ? "There is nothing to plan with yet: no monthly surplus in the last few months and no deposit maturing. Once either shows up, the options appear here."
          : `Worked out from what you keep each month${payouts.length > 0 ? " and the money you already have coming" : ""}.`}
      </p>

      {keepDate && target && (
        <Option
          title={`Keep ${monthLong(target)}`}
          muted={!keepDate.realistic}
          recommended={recommend === "a"}
          verdict={
            keepDate.realistic ? (
              <StatusChip tone="idea">recommended</StatusChip>
            ) : (
              <span className="text-[13px] font-medium text-rose-700 dark:text-rose-400">not realistic</span>
            )
          }
        >
          <p className="text-[13px] text-foreground/85">
            Set aside {inWords(keepDate.needed)} every month for {monthsWord(keepDate.months)}
            {keep > 0 ? `: ${againstKeep(keepDate.needed, keep)}` : ", while you are not keeping anything a month at the moment"}
            {keepDate.realistic
              ? `, leaving ${inWords(keep - keepDate.needed)} a month for everything else.`
              : ". Only works with money on top of that, like a large bonus."}
          </p>
          {keepDate.realistic && !reminderOn && (
            <div>
              <Button variant="outline" onClick={() => onSetAside(keepDate.needed)}>
                Set aside {formatINR(keepDate.needed)} each month
              </Button>
            </div>
          )}
        </Option>
      )}

      {plan && (
        <Option
          title={`${monthLong(plan.by)}, with ${noun.replace(/\d+ /g, "")}`}
          recommended={recommend === "b"}
          verdict={recommend === "b" ? <StatusChip tone="idea">recommended</StatusChip> : undefined}
        >
          <p className="text-[13px] text-foreground/85">
            {noun.charAt(0).toUpperCase() + noun.slice(1)} {plural ? "pay" : "pays"} out{" "}
            <strong className="font-semibold text-foreground">
              {inWords(plan.payoutTotal)} {payWhen}
            </strong>
            .{" "}
            {plan.monthly > 0 ? (
              <>
                Put that toward {g.name} and set aside{" "}
                <strong className="font-semibold text-foreground">{formatINR(plan.monthly)} a month</strong> from {monthName(first)}:{" "}
                {againstKeep(plan.monthly, keep)}, with room to spare.
              </>
            ) : (
              <>That covers {g.name} on its own by {longDate(plan.by)}, with nothing more to set aside.</>
            )}
            {plan.keepsDate && " The target date stays as it is."}
          </p>
          <PlanChart
            saved={g.savedAmount}
            target={g.targetAmount}
            monthly={plan.monthly}
            months={plan.months}
            used={plan.used}
            by={plan.by}
            kinds={kinds}
            today={today}
          />
          <details className="text-[13px]">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {plural ? `The ${plan.used.length} deposits it uses` : "The deposit it uses"}
            </summary>
            <ul className="mt-2 divide-y rounded-lg border">
              {plan.used.map((p) => (
                <li key={p.inv.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    {p.inv.name} <span className="text-muted-foreground">· {p.inv.kind}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">{longDate(new Date(`${p.on}T00:00:00`))}</span>
                  <span className="shrink-0 font-mono tabular-nums">{formatINR(p.amount)}</span>
                </li>
              ))}
            </ul>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onUsePlan(plan)}>Use this plan</Button>
            <Button variant="outline" onClick={onAdjust}>
              Adjust
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {[
              plan.keepsDate ? null : `Moves the target to ${longDate(plan.by)}`,
              `notes the ${plural ? `${plan.used.length} deposits` : "deposit"} on the goal`,
              plan.monthly > 0 ? `adds a ${formatINR(plan.monthly)} monthly reminder` : null,
            ]
              .filter(Boolean)
              .join(", ")
              .replace(/^./, (c) => c.toUpperCase())
              .replace(/, ([^,]*)$/, " and $1")}
            . You confirm each step.
          </p>
        </Option>
      )}

      {eta && (
        <Option
          title={`${monthLong(eta)}, ${plan ? `${kinds} kept` : "at today's pace"}`}
          verdict={<span className="text-[13px] text-muted-foreground">no change needed</span>}
        >
          <p className="text-[13px] text-foreground/85">
            Keep saving at today's pace{plan ? ` and leave ${noun.replace(/\d+ /g, "")} alone` : ""}, putting everything you keep toward{" "}
            {g.name}.{" "}
            {plan
              ? (() => {
                  const gap = monthsBetween(plan.by, eta);
                  return gap > 0
                    ? `${monthsWord(gap).replace(/^./, (c) => c.toUpperCase())} later than the ${planName}.`
                    : gap === 0
                      ? `The same month as the ${planName}, but it takes every rupee you keep.`
                      : `${monthsWord(-gap).replace(/^./, (c) => c.toUpperCase())} sooner than the ${planName}, but it takes every rupee you keep.`;
                })()
              : target
                ? eta <= target
                  ? "That is in time for the target date."
                  : `That is ${monthsWord(monthsBetween(target, eta))} after the target date.`
                : ""}
          </p>
        </Option>
      )}

      {basis > 0 && keep > 0 && (
        <p className="text-xs text-muted-foreground">
          "What you keep" is the median of the last {monthsWord(basis)} ({formatINR(keep)}), the same pace as the forecast below.
        </p>
      )}
    </Panel>
  );
}
