import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, Info, Loader2 } from "lucide-react";
import { listAccounts, listRecurring, listTransactions } from "@/api";
import type { RecurringPayment, Transaction } from "@/types";
import { useFamily, useThresholds } from "@/lib/store";
import { isoDay } from "@/lib/forecast";
import { useStatementsVersion } from "@/lib/statements";
import { formatINR } from "@/lib/format";
import { buildReport, compareWindow, recurringLines, windowFor, type CompareMode, type PeriodKind } from "@/lib/report";
import { IncomeSpendChart, Waterfall, waterfallSteps } from "@/components/analytics/Charts";
import {
  CategoryTable,
  DataConfidence,
  KpiStrip,
  Merchants,
  Panel,
  Rhythm,
  SpendKinds,
  Subscriptions,
  WorthALook,
} from "@/components/analytics/Sections";
import CategoryPanel from "@/components/analytics/CategoryPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "custom", label: "Custom" },
];
const COMPARE_ITEMS = [
  { value: "same-days", label: "Compare: same days last period" },
  { value: "whole", label: "Compare: whole last period" },
];

/** A CSV of the category table, for a spreadsheet or an accountant. */
function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => (typeof c === "string" && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Analytics as a monthly report: the headline numbers, income against spend over the months,
 * what kind of spending it was, the last complete month as a waterfall, every category against
 * its usual, the rhythm of the month, who was paid and how, repeat payments, what is unusual and
 * what in the ledger may be distorting it all. Everything comes from lib/report, one rule.
 */
export default function Analytics() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { activeMember } = useFamily();
  const { items: budgets } = useThresholds();
  const statementsVersion = useStatementsVersion();

  const [kind, setKind] = useState<PeriodKind>("month");
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState<CompareMode>("same-days");
  const today = isoDay(new Date());
  const [custom, setCustom] = useState(() => ({ from: `${today.slice(0, 8)}01`, to: today }));

  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [cardIds, setCardIds] = useState<Set<number>>(new Set());
  const [recurring, setRecurring] = useState<RecurringPayment[]>([]);
  useEffect(() => {
    let alive = true;
    listTransactions(0, 5000)
      .then((t) => alive && setTxns(t))
      .catch(() => alive && setTxns([]));
    listAccounts()
      .then((a) => alive && setCardIds(new Set(a.filter((x) => x.type !== "SAVINGS").map((x) => x.id))))
      .catch(() => undefined);
    listRecurring()
      .then((r) => alive && setRecurring(r ?? []))
      .catch(() => alive && setRecurring([]));
    return () => {
      alive = false;
    };
  }, [statementsVersion]);

  const win = useMemo(() => windowFor(kind, offset, new Date(), custom), [kind, offset, custom]);
  const compare = useMemo(() => compareWindow(win, kind, mode), [win, kind, mode]);
  const report = useMemo(
    () => (txns ? buildReport({ txns, cardIds, kind, window: win, compare, budgets, earns: activeMember.earns }) : null),
    [txns, cardIds, kind, win, compare, budgets, activeMember.earns],
  );
  // The waterfall needs a whole month: this one if it is over, else the last one that is.
  const wfMonthOffset = kind === "month" && !win.running ? offset : 1;
  const waterfall = useMemo(() => {
    if (!txns) return null;
    if (kind === "month" && !win.running && report) return report;
    const w = windowFor("month", wfMonthOffset);
    return buildReport({ txns, cardIds, kind: "month", window: w, compare: compareWindow(w, "month", "whole"), budgets, earns: activeMember.earns });
  }, [txns, cardIds, kind, win.running, report, wfMonthOffset, budgets, activeMember.earns]);
  const lines = useMemo(() => recurringLines(recurring, txns ?? []), [recurring, txns]);

  const category = params.get("category");
  const openCategory = (c: string) => {
    const next = new URLSearchParams(params);
    next.set("category", c);
    setParams(next);
  };
  const closeCategory = () => {
    const next = new URLSearchParams(params);
    next.delete("category");
    setParams(next, { replace: true });
  };

  const exportCsv = () => {
    if (!report) return;
    downloadCsv(`jarvis-analytics-${win.from}-to-${win.to}.csv`, [
      ["Category", "Amount", "Share %", `Compared (${report.compare.label})`, "Change %", "Monthly average", "Budget"],
      ...report.categories.map((c) => [
        c.category,
        Math.round(c.total),
        Math.round(c.share * 100),
        Math.round(c.compare),
        c.deltaPct == null ? "" : Math.round(c.deltaPct),
        Math.round(c.avg),
        c.budget ?? "",
      ]),
      [],
      ["Income", Math.round(report.income)],
      ["Spend", Math.round(report.spend)],
      ["Kept", Math.round(report.kept)],
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {win.label}
            {win.running && kind === "month" ? ` · 1–${win.elapsed} so far` : win.running && kind !== "custom" ? ` · ${win.elapsed} days so far` : ""}, compared with {compare.label}
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => {
                setKind(k.value);
                setOffset(0);
              }}
              className={`h-9 rounded-lg px-3.5 text-sm transition-colors ${kind === k.value ? "bg-card font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {kind === "custom" ? (
          <div className="flex items-center gap-2">
            <Input type="date" className="h-11 w-40" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" />
            <span className="text-muted-foreground">to</span>
            <Input type="date" className="h-11 w-40" value={custom.to} min={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" />
          </div>
        ) : (
          <div className="flex h-11 items-center rounded-xl border bg-card">
            <Button variant="ghost" size="icon" className="h-10 w-11" aria-label="Previous period" onClick={() => setOffset((o) => o + 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-1 text-sm font-semibold whitespace-nowrap">{kind === "month" ? win.label : win.short === "Custom" ? "" : win.label.split(" · ")[0]}</span>
            <Button variant="ghost" size="icon" className="h-10 w-11" aria-label="Next period" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 1))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
        <Select items={COMPARE_ITEMS} value={mode} onValueChange={(v) => v && setMode(v as CompareMode)}>
          <SelectTrigger className="h-11 w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPARE_ITEMS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" className="h-11 gap-2" onClick={exportCsv} disabled={!report}>
          <Download className="size-4" /> Export
        </Button>
      </div>

      {!report ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Working out your numbers…
        </div>
      ) : (
        <>
          {report.expected > 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">
              <Info className="size-4 shrink-0" />
              <span>
                Your salary (about {formatINR(report.expected, { compact: true })}) is still to land this period. Until it does, income and savings show it as{" "}
                <strong>expected</strong>, hatched in the chart.
              </span>
            </div>
          )}

          <KpiStrip r={report} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel
              title="Income, spend and what was kept"
              action={
                <div className="flex gap-4 text-[13px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-[3px] bg-[#0f8a62]" /> Income
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-[3px] bg-primary" /> Spend
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-0.5 w-3.5 bg-amber-600" /> Savings rate
                  </span>
                </div>
              }
            >
              <IncomeSpendChart months={report.months} />
              <p className="text-[13px] text-muted-foreground">
                {report.ledgerStart && `Your ledger starts on ${new Date(`${report.ledgerStart}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. `}
                {report.months.some((m) => m.suspect) && "⚠ marks a month the data-confidence checks below think is off. "}
                {report.expected > 0 && "* projected."}
              </p>
            </Panel>
            <SpendKinds r={report} />
          </div>

          {waterfall && waterfall.income > 0 && (
            <Panel
              title={`${waterfall.window.label}, from income to savings`}
              note={`${kind === "month" && !win.running ? "the month" : "the last complete month"}: where each rupee of ${formatINR(waterfall.income, { compact: true })} went`}
              action={
                waterfall !== report ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-primary hover:underline"
                    onClick={() => {
                      setKind("month");
                      setOffset(wfMonthOffset);
                    }}
                  >
                    Open {waterfall.window.short} →
                  </button>
                ) : undefined
              }
            >
              <Waterfall month={waterfall.window.label} steps={waterfallSteps(waterfall)} />
            </Panel>
          )}

          <CategoryTable r={report} onOpen={openCategory} onBudgets={() => navigate("/settings")} />

          <div className="grid gap-4 xl:grid-cols-2">
            <Rhythm r={report} />
            <Merchants r={report} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Subscriptions lines={lines} />
            <WorthALook r={report} />
          </div>

          <DataConfidence r={report} />

          <CategoryPanel r={report} category={category} cardIds={cardIds} onClose={closeCategory} />
        </>
      )}
    </div>
  );
}
