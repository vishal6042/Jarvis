import { Sparkles } from "lucide-react";
import type { Transaction } from "@/types";
import type { Forecast } from "@/lib/forecast";
import { isoDay } from "@/lib/forecast";
import type { OutflowSummary } from "@/lib/calendarEvents";
import type { Insight } from "@/lib/insights";
import type { MonthBreakdown } from "@/lib/breakdown";
import { localDay, spendOf } from "@/lib/report";
import { formatINR, merchantLabel } from "@/lib/format";

/*
 * The brief at the top of an empty chat, on the same dark panel as the dashboard hero: what is
 * coming in, what goes out this week, what yesterday cost, and the one thing worth watching. It is
 * the answer to "anything I should know?" before it is asked. Every line is read from the same
 * forecast, calendar, spend rule and insights the rest of the app uses, so it never disagrees with
 * the dashboard.
 */

const lakh = (n: number) => formatINR(n, { compact: true });
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** "today", "tomorrow", "in 3 days" or "on 30 Sept" for a yyyy-MM-dd. */
function whenFrom(iso: string, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((new Date(`${iso}T00:00:00`).getTime() - today) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  return `on ${fmtDay(iso)}`;
}

interface Cell {
  label: string;
  value: string;
  /** Up to two quieter lines under the value. */
  subs: { text: string; tone?: "warn" }[];
}

export interface BriefInput {
  now: Date;
  forecast: Forecast;
  /** upcomingOutflows(7, …): everything due in the next week. */
  week: OutflowSummary;
  txns: Transaction[];
  cardIds: ReadonlySet<number>;
  insights: Insight[];
  thresholds: Record<string, number>;
  breakdown: MonthBreakdown;
  /** False for a member with no income of their own: "Coming in" then says so rather than guessing. */
  earns: boolean;
}

/** The four cells, worked out from data only: a cell with nothing to report says so plainly. */
function briefCells(i: BriefInput): Cell[] {
  // Coming in: the expected salary while it has not landed; once it has, say so.
  const salaryEvent = i.forecast.events.find((e) => e.kind === "income");
  const coming: Cell = salaryEvent
    ? {
        label: "Coming in",
        value: `Salary ${whenFrom(salaryEvent.on, i.now)} · ~${lakh(salaryEvent.amount)}`,
        subs: [{ text: `usual amount, from the last ${i.forecast.salary.basis} month${i.forecast.salary.basis === 1 ? "" : "s"}` }],
      }
    : i.forecast.salary.receivedThisMonth
      ? { label: "Coming in", value: "Salary is in", subs: [{ text: `next one around day ${i.forecast.salary.dayOfMonth}` }] }
      : {
          label: "Coming in",
          value: "Nothing expected",
          subs: [{ text: i.earns ? "no regular salary found in the last three months" : "no income of their own" }],
        };

  // Due this week: the first two things going out, in date order.
  const outs = i.week.items.filter((e) => e.direction === "out");
  const line = (e: (typeof outs)[number]) =>
    `${e.title} ${e.amount != null ? lakh(e.amount) : "(amount not set)"} · ${fmtDay(e.on)}`;
  const due: Cell =
    outs.length === 0
      ? { label: "Due this week", value: "Nothing due", subs: [{ text: "no bills or reminders in the next 7 days" }] }
      : {
          label: "Due this week",
          value: line(outs[0]),
          subs: [
            ...(outs[1] ? [{ text: line(outs[1]), tone: outs[1].kind === "card-due" ? ("warn" as const) : undefined }] : []),
            ...(outs.length > 2 ? [{ text: `+${outs.length - 2} more · ${formatINR(i.week.total)} in all` }] : []),
          ],
        };

  // Yesterday, by the shared spend rule: purchases add, card refunds take away, own moves don't count.
  const y = new Date(i.now.getFullYear(), i.now.getMonth(), i.now.getDate() - 1);
  const yIso = isoDay(y);
  let spent = 0;
  let largest: Transaction | null = null;
  for (const t of i.txns) {
    if (localDay(t) !== yIso) continue;
    const s = spendOf(t, i.cardIds);
    spent += s;
    if (s > 0 && (!largest || s > spendOf(largest, i.cardIds))) largest = t;
  }
  const yesterday: Cell =
    spent > 0
      ? {
          label: "Yesterday",
          value: `${formatINR(spent)} spent`,
          subs: largest ? [{ text: `largest: ${merchantLabel(largest)} ${formatINR(largest.amount)}` }] : [],
        }
      : { label: "Yesterday", value: "Nothing spent", subs: [{ text: fmtDay(yIso) }] };

  // Watch: anything urgent first, then the budget furthest over, then any other warning.
  const red = i.insights.find((x) => x.severity === "red");
  const over = Object.entries(i.thresholds)
    .filter(([, limit]) => limit > 0)
    .map(([cat, limit]) => ({ cat, limit, total: i.breakdown.rows.find((r) => r.category === cat)?.total ?? 0 }))
    .filter((b) => b.total > b.limit)
    .sort((a, b) => b.total / b.limit - a.total / a.limit)[0];
  const amber = i.insights.find((x) => x.severity === "amber");
  const watch: Cell = red
    ? { label: "Watch", value: red.title, subs: [{ text: red.detail, tone: "warn" }] }
    : over
      ? { label: "Watch", value: `${over.cat} at ${Math.round((over.total / over.limit) * 100)}%`, subs: [{ text: `of its ${lakh(over.limit)} budget` }] }
      : amber
        ? { label: "Watch", value: amber.title, subs: [{ text: amber.detail }] }
        : { label: "Watch", value: "Nothing to flag", subs: [{ text: "no bills overdue or budgets over" }] };

  return [coming, due, yesterday, watch];
}

/**
 * The daily brief panel. Shown only on a fresh chat: once a conversation is under way it would
 * push the answers down for no reason. It is not sent anywhere — it is worked out here, each time
 * the page opens.
 */
export default function DailyBrief(props: BriefInput) {
  const cells = briefCells(props);
  const date = props.now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-[#16132a] p-4 text-[#f4f2fb] ring-1 ring-white/5 sm:p-5">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-[#b9b3d1] uppercase">
        <Sparkles className="size-3.5" /> Your brief · {date}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0 space-y-0.5 rounded-xl bg-[#221e3d] px-3 py-2.5 sm:px-3.5 sm:py-3">
            <div className="text-xs text-[#b9b3d1]">{c.label}</div>
            <div className="text-sm leading-snug font-semibold break-words sm:text-[15px]">{c.value}</div>
            {c.subs.map((s) => (
              <div key={s.text} className={`text-xs leading-snug break-words ${s.tone === "warn" ? "text-[#ffb3c2]" : "text-[#b9b3d1]"}`}>
                {s.text}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
