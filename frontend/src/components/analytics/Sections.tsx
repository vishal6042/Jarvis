import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatINR } from "@/lib/format";
import { fmtDay, type Report } from "@/lib/report";
import type { recurringLines } from "@/lib/report";
import { Sparkline } from "@/components/analytics/Charts";

const lakh = (n: number) => formatINR(n, { compact: true });
const pct = (n: number) => `${Math.round(n)}%`;

export { default as Panel } from "@/components/page/Panel";
import Panel from "@/components/page/Panel";

function Delta({ now, then, goodWhenDown = true }: { now: number; then: number; goodWhenDown?: boolean }) {
  if (then <= 0) return <span className="text-muted-foreground">no comparison</span>;
  const d = Math.round(((now - then) / then) * 100);
  const good = goodWhenDown ? d <= 0 : d >= 0;
  return (
    <span className={good ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
      {d <= 0 ? "▼" : "▲"} {Math.abs(d)}% vs {formatINR(then)}
    </span>
  );
}

/** The six numbers that sum the period up, each with its trend over the months shown. */
export function KpiStrip({ r }: { r: Report }) {
  const incomeSeries = r.months.map((m) => m.income + m.expected);
  const spendSeries = r.months.map((m) => m.spend);
  const keptSeries = r.months.map((m) => m.kept);
  const rateSeries = r.months.map((m) => m.rate ?? 0);
  const fixedShare = r.spend > 0 ? (r.fixed / r.spend) * 100 : 0;
  const cells: { label: string; value: string; sub: React.ReactNode; spark?: React.ReactNode }[] = [
    {
      label: "Income",
      value: formatINR(r.income),
      sub: r.expected > 0 ? <span className="text-primary">+{lakh(r.expected)} expected</span> : <Delta now={r.income} then={r.compareIncome} goodWhenDown={false} />,
      spark: <Sparkline values={incomeSeries} color="#0f8a62" dotLast />,
    },
    { label: "Spend", value: formatINR(r.spend), sub: <Delta now={r.spend} then={r.compareSpend} />, spark: <Sparkline values={spendSeries} color="var(--primary)" dotLast /> },
    {
      label: r.expected > 0 ? "Net saved · projected" : "Net saved",
      value: r.kept >= 0 ? lakh(r.kept) : `−${lakh(-r.kept)}`,
      sub: r.expected > 0 ? "once the expected salary lands" : r.income > 0 ? `${pct(Math.max(0, (r.kept / r.income) * 100))} of income` : "no income this period",
      spark: <Sparkline values={keptSeries} color="currentColor" dotLast />,
    },
    {
      label: "Savings rate",
      value: r.rate != null ? `${r.rate}%` : "—",
      sub: r.avgRate != null ? `${r.expected > 0 ? "projected · " : ""}your average ${r.avgRate}%` : "not enough history",
      spark: <Sparkline values={rateSeries} color="currentColor" dotLast />,
    },
    {
      label: "Fixed costs",
      value: formatINR(r.fixed),
      sub: `${pct(fixedShare)} of spend · EMI, bills, rent`,
      spark: (
        <div className="mt-2 flex h-2 w-[120px] overflow-hidden rounded-full bg-primary/15">
          <div className="bg-primary" style={{ width: `${Math.min(100, fixedShare)}%` }} />
        </div>
      ),
    },
    {
      label: "Daily burn",
      value: formatINR(r.perDay),
      sub: r.comparePerDay > 0 ? <Delta now={r.perDay} then={r.comparePerDay} /> : "a day",
      spark: <div className="pt-1 text-xs text-muted-foreground">{formatINR(r.perDayWithoutOneOffs)} a day without one-offs</div>,
    },
  ];
  return (
    <section className="grid overflow-hidden rounded-2xl border bg-card sm:grid-cols-3 xl:grid-cols-6">
      {cells.map((c, i) => (
        <div key={c.label} className={`flex flex-col gap-1.5 border-border/60 p-5 ${i < cells.length - 1 ? "border-b xl:border-r xl:border-b-0" : ""}`}>
          <div className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">{c.label}</div>
          <div className="text-2xl font-semibold tabular-nums">{c.value}</div>
          <div className="text-[13px] text-muted-foreground">{c.sub}</div>
          <div className="mt-auto">{c.spark}</div>
        </div>
      ))}
    </section>
  );
}

/** Spending by how much say there was in it: committed, one-off, everyday. */
export function SpendKinds({ r }: { r: Report }) {
  const total = Math.max(1, r.fixed + r.oneOffs + r.lifestyle);
  const rows = [
    { label: "Commitments", value: r.fixed, color: "#3f2aa8", detail: "Home-loan EMI, bills, rent: the same every month" },
    {
      label: "One-offs",
      value: r.oneOffs,
      color: "#d97706",
      detail: r.oneOffItems.length ? r.oneOffItems.slice(0, 2).map((o) => `${o.name} ${lakh(o.amount)}`).join(" · ") : "No single payment over ₹20,000",
    },
    { label: "Everyday lifestyle", value: r.lifestyle, color: "#9a8cf0", detail: "Shopping, food, groceries, fun, transport: where choices happen" },
  ];
  const ratio = r.typicalLifestyle > 0 ? r.lifestyle / r.typicalLifestyle : null;
  return (
    <Panel title="What kind of spending" note="by how much choice you had over it">
      <div className="flex h-[18px] gap-0.5 overflow-hidden rounded-md">
        {rows.map((x) => (
          <div key={x.label} style={{ width: `${(x.value / total) * 100}%`, backgroundColor: x.color }} />
        ))}
      </div>
      <div className="space-y-3.5">
        {rows.map((x) => (
          <div key={x.label} className="flex gap-3">
            <span className="mt-1 size-3 shrink-0 rounded-[3px]" style={{ backgroundColor: x.color }} />
            <div className="min-w-0 flex-1">
              <div className="flex text-[15px] font-semibold">
                <span className="flex-1">{x.label}</span>
                <span className="font-mono tabular-nums">{formatINR(x.value)}</span>
              </div>
              <div className="truncate text-[13px] text-muted-foreground">{x.detail}</div>
            </div>
          </div>
        ))}
      </div>
      {ratio != null && (
        <div className="mt-auto rounded-xl bg-muted/60 px-3.5 py-3 text-[13px]">
          Everyday spend is {lakh(r.lifestyle)} against about {lakh(r.typicalLifestyle)} in a typical month
          {r.window.running ? " so far" : ""},{" "}
          <strong>
            {ratio < 0.85 ? `${Math.round((1 - ratio) * 100)}% below your usual` : ratio > 1.15 ? `${Math.round((ratio - 1) * 100)}% above your usual` : "about your usual"}
          </strong>
          .
        </div>
      )}
    </Panel>
  );
}

/** Every category with its comparison, its usual month, its trend and its budget. */
export function CategoryTable({ r, onOpen, onBudgets }: { r: Report; onOpen: (category: string) => void; onBudgets: () => void }) {
  const head = "px-2 py-2.5 text-xs font-normal text-muted-foreground";
  const shown = r.categories.slice(0, 10);
  const rest = r.categories.slice(10);
  return (
    <Panel
      title="Categories"
      note="click a row for its trend, merchants and every payment"
      action={
        <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={onBudgets}>
          Edit budgets
        </button>
      }
    >
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className={head}>Category</th>
              <th className={`${head} text-right`}>{r.window.short === "Custom" ? "Period" : r.window.running ? `1–${r.window.elapsed} ${r.window.short}` : r.window.short}</th>
              <th className={`${head} text-right`}>Share</th>
              <th className={`${head} text-right`}>vs {r.compare.label}</th>
              <th className={`${head} text-right`}>Monthly avg</th>
              <th className={head}>Trend</th>
              <th className={head}>Budget</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const over = c.budget != null && c.total > c.budget;
              const color = c.fixed ? "#3f2aa8" : c.oneOff ? "#d97706" : "#9a8cf0";
              return (
                <tr
                  key={c.category}
                  onClick={() => onOpen(c.category)}
                  className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/50 ${over ? "bg-amber-50/70 dark:bg-amber-500/5" : ""}`}
                >
                  <td className="px-2 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                      {c.category}
                      {c.oneOff && <span className="rounded-full bg-amber-100 px-1.5 text-[11px] text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">one-off</span>}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">{formatINR(c.total)}</td>
                  <td className="px-2 py-2.5 text-right text-muted-foreground">{pct(c.share * 100)}</td>
                  <td
                    className={`px-2 py-2.5 text-right ${
                      c.deltaPct == null ? "text-muted-foreground" : c.deltaPct > 5 ? "text-rose-700 dark:text-rose-400" : c.deltaPct < -5 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                    }`}
                  >
                    {c.deltaPct == null ? "new" : `${c.deltaPct > 0 ? "+" : ""}${Math.round(c.deltaPct)}%`}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono text-muted-foreground tabular-nums">{c.avg > 0 ? formatINR(c.avg) : "—"}</td>
                  <td className="px-2 py-1.5 text-primary">
                    <Sparkline values={c.series} width={90} height={24} color="currentColor" />
                  </td>
                  <td className="px-2 py-2.5">
                    {c.budget != null ? (
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <span className={`block h-full rounded-full ${over ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(100, (c.total / c.budget) * 100)}%` }} />
                        </span>
                        <span className={`text-xs ${over ? "font-semibold text-amber-800 dark:text-amber-300" : "text-muted-foreground"}`}>
                          {Math.round((c.total / c.budget) * 100)}% of {lakh(c.budget)}
                        </span>
                      </span>
                    ) : c.fixed ? (
                      <span className="text-xs text-muted-foreground">fixed</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rest.length > 0 && (
        <p className="text-sm text-muted-foreground">
          + {rest.length} smaller categor{rest.length === 1 ? "y" : "ies"} · {formatINR(rest.reduce((s, c) => s + c.total, 0))}
        </p>
      )}
    </Panel>
  );
}

const SHADES = ["bg-muted/60", "bg-primary/10", "bg-primary/25", "bg-primary/45", "bg-primary/70 text-primary-foreground", "bg-primary text-primary-foreground"];
function shade(v: number) {
  if (v <= 0) return 0;
  if (v < 500) return 1;
  if (v < 2_000) return 2;
  if (v < 10_000) return 3;
  if (v < 50_000) return 4;
  return 5;
}

/** Each day of the month shaded by spend, and how the week splits it. */
export function Rhythm({ r }: { r: Report }) {
  const navigate = useNavigate();
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const firstDow = r.days.length ? (new Date(`${r.days[0].day}T00:00:00`).getDay() + 6) % 7 : 0; // Monday first
  const darkest = [...r.days].sort((a, b) => b.total - a.total).slice(0, 2).filter((d) => d.total > 0);
  return (
    <Panel title="Spending rhythm" note={r.days.length ? "each day, darker is more" : undefined}>
      {r.days.length > 0 && (
        <>
          <div className="grid grid-cols-7 gap-1.5 text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="text-center text-muted-foreground">
                {d}
              </div>
            ))}
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {r.days.map((d) => {
              const future = d.day > todayIso;
              return (
                <button
                  key={d.day}
                  type="button"
                  disabled={future}
                  title={future ? undefined : `${fmtDay(d.day)} · ${formatINR(d.total)}`}
                  onClick={() => navigate(`/transactions?from=${d.day}&to=${d.day}&type=DEBIT`)}
                  className={`h-10 rounded-lg px-1.5 py-1 text-left align-top transition-transform hover:scale-[1.04] ${
                    future ? "border border-dashed text-muted-foreground/50" : SHADES[shade(d.total)]
                  } ${d.day === todayIso ? "ring-2 ring-foreground" : ""}`}
                >
                  {Number(d.day.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            less
            {SHADES.slice(1).map((s) => (
              <span key={s} className={`size-3.5 rounded ${s}`} />
            ))}
            more
            <span className="flex-1" />
            {darkest.length > 0 && <span>heaviest: {darkest.map((d) => `${Number(d.day.slice(8))}th (${lakh(d.total)})`).join(", ")}</span>}
          </div>
        </>
      )}
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-xl bg-muted/60 p-3">
          <div className="text-xs text-muted-foreground">Weekday · weekend</div>
          <div className="font-semibold tabular-nums">
            {formatINR(r.weekdayPerDay)} · {formatINR(r.weekendPerDay)}
          </div>
          <div className="text-xs text-muted-foreground">
            a day
            {r.weekendPerDay > 0 && r.weekdayPerDay > r.weekendPerDay * 1.5 ? ` · ${(r.weekdayPerDay / r.weekendPerDay).toFixed(1)}× less at weekends` : ""}
          </div>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <div className="text-xs text-muted-foreground">Typical payment</div>
          <div className="font-semibold tabular-nums">{formatINR(r.medianPayment)}</div>
          <div className="text-xs text-muted-foreground">median of {r.payments} payments</div>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <div className="text-xs text-muted-foreground">Small payments</div>
          <div className="font-semibold tabular-nums">
            {pct(r.smallShareCount * 100)} · {pct(r.smallShareMoney * 100)}
          </div>
          <div className="text-xs text-muted-foreground">of payments · of money, under ₹500</div>
        </div>
      </div>
    </Panel>
  );
}

/** The biggest payees by readable name, and how the money left: bank account or card. */
export function Merchants({ r }: { r: Report }) {
  const navigate = useNavigate();
  const paid = Math.max(1, r.bank.total + r.cards.total);
  return (
    <Panel title="Who you paid" note="largest first">
      <div className="divide-y divide-border/60">
        {r.merchants.map((m) => (
          <button
            key={m.name}
            type="button"
            onClick={() => navigate(`/transactions?q=${encodeURIComponent(m.name)}`)}
            className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-muted/40"
          >
            <span className="min-w-0 flex-1 truncate">
              {m.name}
              <span className="text-xs text-muted-foreground">
                {m.note ? ` · ${m.note}` : ""}
                {m.category ? ` · ${m.category.toLowerCase()}` : ""}
                {m.count > 1 ? ` · ${m.count} payments` : ""}
              </span>
            </span>
            <span className="font-mono tabular-nums">{formatINR(m.total)}</span>
          </button>
        ))}
      </div>
      <div className="pt-1 text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">How you paid</div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        <div className="bg-[#3f2aa8]" style={{ width: `${(r.bank.total / paid) * 100}%` }} />
        <div className="bg-amber-500" style={{ width: `${(r.cards.total / paid) * 100}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        <span>
          <span className="text-[#3f2aa8]">●</span> Bank account {formatINR(r.bank.total)} · {r.bank.count} payments
        </span>
        <span>
          <span className="text-amber-500">●</span> Cards {formatINR(r.cards.total)} · {r.cards.count} payments
        </span>
      </div>
      {r.bank.count + r.cards.count > 0 && (
        <p className="text-[13px] text-muted-foreground">
          Cards take {pct((r.cards.count / (r.bank.count + r.cards.count)) * 100)} of your payments and {pct((r.cards.total / paid) * 100)} of the money.
        </p>
      )}
    </Panel>
  );
}

type RecurringLine = ReturnType<typeof recurringLines>[number];

/** Repeat payments with what each costs a year, and the ones that have stopped. */
export function Subscriptions({ lines }: { lines: RecurringLine[] }) {
  const active = lines.filter((l) => !l.stopped);
  const monthly = active.reduce((s, l) => s + l.monthly, 0);
  const top = active[0];
  return (
    <Panel title="Subscriptions & repeat payments" note={active.length ? `${lakh(monthly)} a month · ${lakh(monthly * 12)} a year` : undefined}>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No repeat payments detected yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 font-normal">Payment</th>
              <th className="py-2 font-normal">Every</th>
              <th className="py-2 text-right font-normal">Each time</th>
              <th className="py-2 text-right font-normal">A year</th>
            </tr>
          </thead>
          <tbody>
            {lines.slice(0, 7).map((l) => (
              <tr key={`${l.merchant}-${l.cadence}`} className={`border-b border-border/50 ${l.stopped ? "text-muted-foreground" : ""}`}>
                <td className="py-2">
                  {l.name}
                  {l.note && <span className="text-xs text-muted-foreground"> · {l.note}</span>}
                </td>
                <td className="py-2 text-muted-foreground">{l.cadence.toLowerCase().replace("ly", "") || l.cadence}</td>
                <td className="py-2 text-right font-mono tabular-nums">{l.stopped ? "stopped" : formatINR(l.amount)}</td>
                <td className="py-2 text-right font-mono tabular-nums">{l.stopped ? <span className="text-xs">since {fmtDay(l.lastPaid)}</span> : formatINR(l.yearly)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {top && monthly > 0 && top.monthly / monthly >= 0.4 && (
        <p className="text-[13px] text-muted-foreground">
          {top.name} alone is {pct((top.monthly / monthly) * 100)} of your repeat payments
          {top.note ? ". Charged in a foreign currency, so the rupee amount moves with the exchange rate." : "."}
        </p>
      )}
    </Panel>
  );
}

/** Genuinely unusual things against your own usual month; expected payments are not flagged. */
export function WorthALook({ r }: { r: Report }) {
  const navigate = useNavigate();
  return (
    <Panel title="Worth a second look" note="against your own usual month">
      {r.look.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" /> Nothing out of the ordinary this period.
        </p>
      ) : (
        r.look.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => navigate(l.href)}
            className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-sm font-bold text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
              {l.badge}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{l.title}</span>
              {l.detail && <span className="block truncate text-[13px] text-muted-foreground">{l.detail}</span>}
            </span>
          </button>
        ))
      )}
      <p className="mt-auto text-xs text-muted-foreground">Rent, EMI and subscriptions are expected, so they are not flagged here.</p>
    </Panel>
  );
}

/** What is probably distorting these numbers, with the way to fix each. */
export function DataConfidence({ r }: { r: Report }) {
  const navigate = useNavigate();
  if (r.confidence.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border bg-card px-6 py-4 text-sm">
        <CheckCircle2 className="size-5 text-emerald-600" />
        <span>
          <strong>Data confidence: high.</strong> Nothing in the ledger looks like it is skewing these numbers.
        </span>
      </section>
    );
  }
  return (
    <Panel
      title="Data confidence"
      note={`${r.confidence.length} thing${r.confidence.length > 1 ? "s are" : " is"} likely skewing these numbers`}
      tone="warn"
      action={
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
          {r.confidence.length} to review
        </span>
      }
    >
      <div className="grid gap-3.5 md:grid-cols-3">
        {r.confidence.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5 rounded-xl bg-amber-50/80 p-4 dark:bg-amber-500/5">
            <div className="flex items-start gap-2 text-sm font-semibold">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              {c.title}
            </div>
            <p className="text-[13px] text-muted-foreground">{c.detail}</p>
            <button type="button" className="mt-auto w-fit pt-1 text-[13px] font-semibold text-primary hover:underline" onClick={() => navigate(c.href)}>
              {c.cta} →
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
