import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { Pencil, Plus, PiggyBank, TrendingUp, Trash2 } from "lucide-react";
import CardArt from "@/components/CardArt";
import {
  KIND_META,
  type Investment,
  type InvestmentKind,
} from "@/lib/sample";
import { useFamily, useInvestments } from "@/lib/store";
import { EPF_YEARLY_RAISE, maturityProjection } from "@/lib/rdMath";
import { monthlyEquivalent, portfolioReturn, valueToday } from "@/lib/portfolio";
import { formatINR, formatDate } from "@/lib/format";
import PageHeader from "@/components/page/PageHeader";
import HeadlineStrip, { type HeadlineCell } from "@/components/page/HeadlineStrip";
import Panel from "@/components/page/Panel";
import HoldingsTable from "@/components/investments/HoldingsTable";
import MaturityTimeline from "@/components/investments/MaturityTimeline";
import InvestmentIdeas from "@/components/investments/InvestmentIdeas";
import MixLine from "@/components/investments/MixLine";
import {
  SHORT,
  cardAnchor,
  countsLabel,
  groupTitle,
  lakh,
  longDate,
  monthYear,
  nextMaturity,
  pct1,
  returnCaveat,
  sectionAnchor,
} from "@/components/investments/holdings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ConfirmDialog from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const KINDS = Object.keys(KIND_META) as InvestmentKind[];
const histConfig = {
  value: { label: "Value", color: "var(--chart-1)" },
  contributed: { label: "Invested", color: "var(--chart-3)" },
} satisfies ChartConfig;

type FormState = {
  kind: InvestmentKind;
  name: string;
  principal: string;
  current: string;
  rate: string;
  sip: string;
  openingDate: string;
  commencementDate: string;
  maturityDate: string;
  notes: string;
};
const EMPTY: FormState = {
  kind: "FD",
  name: "",
  principal: "",
  current: "",
  rate: "",
  sip: "",
  openingDate: "",
  commencementDate: "",
  maturityDate: "",
  notes: "",
};

function num(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function toForm(i: Investment): FormState {
  return {
    kind: i.kind,
    name: i.name,
    principal: String(i.principal ?? ""),
    current: String(i.current ?? ""),
    rate: i.rate != null ? String(i.rate) : "",
    sip: i.sip != null ? String(i.sip) : "",
    openingDate: i.openingDate ?? "",
    commencementDate: i.commencementDate ?? "",
    maturityDate: i.maturityDate ?? "",
    notes: i.notes ?? "",
  };
}

function InvestmentCard({
  inv,
  onOpen,
  onEdit,
  onDelete,
  canDelete,
  highlight,
}: {
  inv: Investment;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canDelete: boolean;
  /** Just jumped to from the holdings table: ringed for a moment so the eye finds it. */
  highlight: boolean;
}) {
  // An FD entered at its principal shows the interest accrued so far, the same figure the table uses.
  const now = valueToday(inv);
  const gain = now.value - inv.principal;
  const pct = inv.principal ? ((gain / inv.principal) * 100).toFixed(1) : "0";
  const color = KIND_META[inv.kind].color;
  return (
    <Card
      id={cardAnchor(inv.id)}
      className={`group relative isolate cursor-pointer scroll-mt-24 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 hover:ring-1 hover:ring-primary/40 ${
        highlight ? "ring-2 ring-primary" : ""
      }`}
      onClick={onOpen}
    >
      <CardArt color={color} icon={inv.kind === "MF" ? TrendingUp : PiggyBank} />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="absolute bottom-3 left-4 z-20 flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground opacity-0 shadow-md shadow-primary/30 transition-opacity group-hover:opacity-100 hover:brightness-110 focus-visible:opacity-100"
      >
        <Pencil className="size-3" /> Edit
      </button>
      <CardHeader className="relative z-10 flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-start gap-2">
          <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <div>
            <CardTitle className="text-base">{inv.name}</CardTitle>
            <CardDescription>{KIND_META[inv.kind].label}</CardDescription>
          </div>
        </div>
        <Badge
          variant="secondary"
          className="border-transparent"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {inv.kind}
        </Badge>
      </CardHeader>
      <CardContent className="relative z-10 space-y-1.5 text-sm">
        <Row label="Invested" value={formatINR(inv.principal)} />
        <Row label="Current" value={`${now.accrued ? "≈ " : ""}${formatINR(now.value)}`} />
        {now.accrued && now.since && (
          <p className="-mt-1 text-right text-[11px] text-muted-foreground">
            accrued at {now.rate}% since {longDate(now.since)}
          </p>
        )}
        {inv.sip ? <Row label="SIP / month" value={formatINR(inv.sip)} /> : null}
        {(() => {
          const mp = maturityProjection(inv);
          return mp ? (
            <Row
              label={inv.kind === "PF" ? "At 58" : "At maturity"}
              value={`${formatINR(Math.round(mp.maturityValue))} · ${formatDate(mp.maturityOn)}`}
            />
          ) : null;
        })()}
        <div className="flex items-center justify-between pt-1">
          <span className="text-muted-foreground">Gain</span>
          <span className={gain >= 0 ? "font-semibold text-emerald-500" : "font-semibold text-rose-500"}>
            {now.accrued ? "≈ " : ""}
            {formatINR(gain)} ({pct}%)
          </span>
        </div>
        {/* Always there, so the hover-only Edit pill has a row of its own instead of covering "Gain". */}
        <div className="flex h-9 items-center justify-end pt-1">
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function DetailsDialog({ inv, onClose, onEdit }: { inv: Investment | null; onClose: () => void; onEdit: () => void }) {
  if (!inv) return null;
  const now = valueToday(inv);
  // Real two-point view: amount invested vs current value (no fabricated monthly history).
  const hist = [
    { label: inv.openingDate ? formatDate(inv.openingDate) : "Invested", contributed: inv.principal, value: inv.principal },
    { label: "Now", contributed: inv.principal, value: now.value },
  ];
  const gain = now.value - inv.principal;
  const approx = now.accrued ? "≈ " : "";
  return (
    <Dialog open={!!inv} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ backgroundColor: KIND_META[inv.kind].color }} />
            {inv.name}
            <Badge
              variant="secondary"
              className="border-transparent"
              style={{
                backgroundColor: `${KIND_META[inv.kind].color}22`,
                color: KIND_META[inv.kind].color,
              }}
            >
              {inv.kind}
            </Badge>
          </DialogTitle>
          <DialogDescription>{KIND_META[inv.kind].label}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Detail label="Invested" value={formatINR(inv.principal)} />
          <Detail label="Current value" value={`${approx}${formatINR(now.value)}`} />
          <Detail
            label="Gain"
            value={`${approx}${formatINR(gain)} (${inv.principal ? ((gain / inv.principal) * 100).toFixed(1) : 0}%)`}
          />
          {inv.rate != null && <Detail label="Interest rate" value={`${inv.rate}%`} />}
          {inv.sip != null && <Detail label="SIP / month" value={formatINR(inv.sip)} />}
          {inv.openingDate && <Detail label="Opening date" value={formatDate(inv.openingDate)} />}
          {inv.commencementDate && (
            <Detail label="Commencement" value={formatDate(inv.commencementDate)} />
          )}
          {inv.maturityDate && <Detail label="Maturity" value={formatDate(inv.maturityDate)} />}
        </div>
        {now.accrued && now.since && (
          <p className="text-xs text-muted-foreground">
            Current value is interest accrued at {now.rate}% since {longDate(now.since)}, compounded quarterly. Enter the bank's figure to replace it.
          </p>
        )}

        {inv.notes && <p className="text-sm text-muted-foreground">{inv.notes}</p>}

        {(() => {
          const mp = maturityProjection(inv);
          if (!mp) return null;
          const color = KIND_META[inv.kind].color;
          const epf = inv.kind === "PF";
          return (
            <div className="rounded-xl border bg-card/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">{epf ? "Projection at 58" : "Maturity projection"}</p>
                <span className="text-xs text-muted-foreground">
                  {mp.monthsLeft} of {mp.totalMonths} months left
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {epf ? (
                  <>
                    <Detail label="Turns 58 on" value={formatDate(mp.maturityOn)} />
                    <Detail label="Projected balance" value={formatINR(Math.round(mp.maturityValue))} />
                    <Detail label="Contributions to come" value={formatINR(Math.round(mp.contributionsToCome ?? 0))} />
                    <Detail label="Interest to come" value={formatINR(Math.round(mp.interestToCome ?? 0))} />
                  </>
                ) : (
                  <>
                    <Detail label="Matures on" value={formatDate(mp.maturityOn)} />
                    <Detail label="Maturity value" value={formatINR(Math.round(mp.maturityValue))} />
                    <Detail label="Total deposits" value={formatINR(mp.totalDeposits)} />
                    <Detail label="Interest earned" value={formatINR(Math.round(mp.interestEarned))} />
                  </>
                )}
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${Math.round((mp.monthsDone / mp.totalMonths) * 100)}%`, backgroundColor: color }} />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {epf
                  ? `From today's ${formatINR(inv.current)}, with ${formatINR(inv.sip ?? 0)} a month rising ${EPF_YEARLY_RAISE * 100}% a year and ${inv.rate ?? 0}% interest credited yearly. An estimate: raises and rates will vary.`
                  : `Accrued so far ≈ ${formatINR(Math.round(mp.valueNow))} · ${inv.rate ?? 0}% compounded quarterly`}
              </p>
            </div>
          );
        })()}

        <div>
          <p className="mb-2 text-sm font-medium">Invested vs current value</p>
          <ChartContainer config={histConfig} className="h-[200px] w-full">
            <AreaChart data={hist} margin={{ left: 4, right: 4, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Area dataKey="contributed" type="natural" stroke="var(--color-contributed)" fill="var(--color-contributed)" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
              <Area dataKey="value" type="natural" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.2} strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button className="gap-1" onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

/**
 * The portfolio, overview first: a header with the type filter and "Add holding", Jarvis's read
 * of the mix, the headline numbers, one table indexing every holding, when money frees up next to
 * what Jarvis would do about it — and below all that the per-holding cards, grouped by product,
 * where each holding is opened, edited or deleted. The table's rows jump to those cards.
 */
export default function Investments() {
  const { activeMember, members } = useFamily();
  const isAll = activeMember.id === "all";
  const { items: allItems, update, remove } = useInvestments(isAll ? "all" : activeMember.id);
  const [kindFilter, setKindFilter] = useState<string>("all");
  // The filter offers only the kinds actually held; one that vanished (another member) falls back to all.
  const presentKinds = useMemo(() => KINDS.filter((k) => allItems.some((i) => i.kind === k)), [allItems]);
  const filter = kindFilter !== "all" && presentKinds.includes(kindFilter as InvestmentKind) ? kindFilter : "all";
  const items = useMemo(() => (filter === "all" ? allItems : allItems.filter((i) => i.kind === filter)), [allItems, filter]);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [details, setDetails] = useState<Investment | null>(null);
  // Viewing everyone, a new holding has to belong to someone: the add dialog asks who.
  const [addFor, setAddFor] = useState<string>("");
  const adder = useInvestments(isAll ? addFor || "all" : activeMember.id);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY, kind: filter === "all" ? EMPTY.kind : (filter as InvestmentKind) });
    setAddFor("");
    setAddOpen(true);
  }
  function openEdit(inv: Investment) {
    setDetails(null);
    setEditing(inv);
    setForm(toForm(inv));
    setAddOpen(true);
  }
  function closeForm() {
    setAddOpen(false);
    setEditing(null);
    setForm(EMPTY);
  }
  const [toDelete, setToDelete] = useState<Investment | null>(null);

  // A row in the holdings table scrolls to its card (or its group) and rings it for a moment.
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  function jump(anchor: string) {
    const el = document.getElementById(anchor);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: anchor.startsWith("inv-kind-") ? "start" : "center" });
    setFlash(anchor);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
  }

  const totals = useMemo(() => portfolioReturn(items), [items]);
  const caveat = useMemo(() => returnCaveat(items), [items]);
  const next = useMemo(() => nextMaturity(items), [items]);
  const anyAccrued = useMemo(() => items.some((i) => valueToday(i).accrued), [items]);
  const fromPayslip = items.filter((i) => i.salaryDeducted).reduce((s, i) => s + monthlyEquivalent(i), 0);

  function set<K extends keyof FormState>(k: K) {
    return (v: string) => setForm((f) => ({ ...f, [k]: v }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing && isAll && !addFor) return;
    const payload = {
      kind: form.kind,
      name: form.name.trim(),
      principal: num(form.principal) ?? 0,
      current: num(form.current) ?? num(form.principal) ?? 0,
      rate: num(form.rate),
      sip: num(form.sip),
      openingDate: form.openingDate || undefined,
      commencementDate: form.commencementDate || undefined,
      maturityDate: form.maturityDate || undefined,
      notes: form.notes || undefined,
    };
    if (editing) update(editing.id, payload);
    else adder.add(payload);
    closeForm();
  }

  const subtitle = [
    `${lakh(totals.current)} across ${items.length} holding${items.length === 1 ? "" : "s"}`,
    totals.monthlyCommitment > 0 ? `${formatINR(Math.round(totals.monthlyCommitment))} going in each month` : null,
    activeMember.relation !== "Self" && !isAll ? activeMember.name : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const cells: HeadlineCell[] = [
    {
      label: "Value",
      value: formatINR(totals.current),
      sub: (
        <span className={totals.gain >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
          {totals.gain >= 0 ? "▲" : "▼"} {formatINR(Math.abs(totals.gain))} · {pct1(Math.abs(totals.gainPct))}
        </span>
      ),
      extra: anyAccrued ? <span className="text-xs text-muted-foreground">includes FD interest accrued (≈)</span> : undefined,
    },
    { label: "Invested", value: formatINR(totals.invested), sub: "your own money in" },
    {
      label: "Return a year",
      value:
        totals.annualised == null ? (
          "—"
        ) : (
          <>
            {pct1(totals.annualised)}
            {caveat && <span className="text-amber-700 dark:text-amber-400"> *</span>}
          </>
        ),
      sub:
        totals.annualised == null ? (
          "needs opening dates"
        ) : caveat ? (
          <span className="text-amber-700 dark:text-amber-400">EPF part is an estimate · see below</span>
        ) : (
          "across every holding"
        ),
    },
    {
      label: "Going in a month",
      value: formatINR(Math.round(totals.monthlyCommitment)),
      sub: fromPayslip > 0 ? `${formatINR(Math.round(fromPayslip))} from payslip` : "SIPs, RDs and premiums",
    },
    {
      label: "Next maturity",
      value: next ? monthYear(next.on) : "—",
      sub: next ? `${countsLabel(next.items)} · ${lakh(next.total)}${next.known ? "" : " today"}` : "nothing dated to come",
    },
  ];

  const kindItems = [
    { value: "all", label: "All" },
    ...presentKinds.map((k) => ({ value: k, label: SHORT[k] })),
  ];
  const memberItems = members.map((m) => ({ value: m.id, label: m.name }));

  return (
    <div className="space-y-6">
      <PageHeader title="Investments" subtitle={subtitle}>
        {presentKinds.length > 1 && (
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" role="tablist" aria-label="Filter by type">
            {kindItems.map((k) => (
              <button
                key={k.value}
                type="button"
                role="tab"
                aria-selected={filter === k.value}
                title={k.value === "all" ? "Every type" : KIND_META[k.value as InvestmentKind].label}
                onClick={() => setKindFilter(k.value)}
                className={`h-9 shrink-0 rounded-lg px-3 text-sm sm:px-3.5 transition-colors ${filter === k.value ? "bg-card font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
        <Button
          onClick={openAdd}
          className="h-11 gap-2"
          disabled={isAll && members.length === 0}
          title={isAll && members.length === 0 ? "Add a family member in Settings first; every holding belongs to someone." : undefined}
        >
          <Plus className="size-4" /> Add holding
        </Button>
      </PageHeader>

      {items.length > 0 && (
        <>
          <MixLine items={items} />
          <HeadlineStrip cells={cells} />
          <HoldingsTable items={items} onJump={jump} />
          <div className="grid gap-4 xl:grid-cols-2">
            <MaturityTimeline items={items} />
            <InvestmentIdeas items={items} />
          </div>
        </>
      )}

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No investments yet. Click <b>Add holding</b> to add an FD, PPF, mutual fund, etc.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {KINDS.map((kind) => {
            const group = items.filter((i) => i.kind === kind);
            if (group.length === 0) return null;
            const groupInvested = group.reduce((s, i) => s + i.principal, 0);
            const groupCurrent = group.reduce((s, i) => s + valueToday(i).value, 0);
            const groupAccrued = group.some((i) => valueToday(i).accrued);
            const groupGain = groupCurrent - groupInvested;
            const anchor = sectionAnchor(kind);
            return (
              <Panel
                key={kind}
                id={anchor}
                className={`scroll-mt-24 transition-shadow ${flash === anchor ? "ring-2 ring-primary/60" : ""}`}
                title={
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: KIND_META[kind].color }} />
                    {groupTitle(kind, group)}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                      {group.length}
                    </span>
                  </span>
                }
                note={
                  <>
                    Invested {formatINR(groupInvested)} · Current{" "}
                    <span className="font-semibold text-foreground">
                      {groupAccrued ? "≈" : ""}
                      {formatINR(groupCurrent)}
                    </span>{" "}
                    ·{" "}
                    <span className={groupGain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}>
                      {groupGain >= 0 ? "+" : ""}
                      {formatINR(groupGain)}
                    </span>
                  </>
                }
              >
                <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((inv) => (
                    <InvestmentCard
                      key={inv.id}
                      inv={inv}
                      onOpen={() => setDetails(inv)}
                      onEdit={() => openEdit(inv)}
                      onDelete={() => setToDelete(inv)}
                      canDelete={!isAll}
                      highlight={flash === cardAnchor(inv.id)}
                    />
                  ))}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <DetailsDialog inv={details} onClose={() => setDetails(null)} onEdit={() => details && openEdit(details)} />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete investment?"
        description={toDelete ? `“${toDelete.name}” (${KIND_META[toDelete.kind].label}) will be removed.` : undefined}
        onConfirm={() => toDelete && remove(toDelete.id)}
      />

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => (o ? setAddOpen(true) : closeForm())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit holding" : "Add holding"}</DialogTitle>
            <DialogDescription>FD, RD, PF, PPF, Post Office schemes, or a mutual fund.</DialogDescription>
          </DialogHeader>
          <form id="inv-form" className="grid grid-cols-2 gap-3" onSubmit={submit}>
            {!editing && isAll && (
              <div className="col-span-2">
                <Field label="Whose holding">
                  <Select items={memberItems} value={addFor || null} onValueChange={(v) => setAddFor(v ?? "")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a family member" />
                    </SelectTrigger>
                    <SelectContent>
                      {memberItems.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}
            <Field label="Type">
              <Select
                items={KINDS.map((k) => ({ value: k, label: KIND_META[k].label }))}
                value={form.kind}
                onValueChange={(v) => set("kind")((v ?? "FD") as InvestmentKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: KIND_META[k].color }} />
                        {KIND_META[k].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Name / institution">
              <Input value={form.name} onChange={(e) => set("name")(e.target.value)} required />
            </Field>
            <Field label="Invested (₹)">
              <Input value={form.principal} onChange={(e) => set("principal")(e.target.value)} inputMode="numeric" required />
            </Field>
            <Field label="Current value (₹)">
              <Input value={form.current} onChange={(e) => set("current")(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Interest rate (%)">
              <Input value={form.rate} onChange={(e) => set("rate")(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="SIP / month (₹)">
              <Input value={form.sip} onChange={(e) => set("sip")(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Opening date">
              <DatePicker value={form.openingDate} onChange={set("openingDate")} />
            </Field>
            <Field label="Commencement date">
              <DatePicker value={form.commencementDate} onChange={set("commencementDate")} />
            </Field>
            <Field label="Maturity date">
              <DatePicker value={form.maturityDate} onChange={set("maturityDate")} />
            </Field>
            <div className="col-span-2">
              <Field label="Notes">
                <Input value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
              </Field>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" form="inv-form" disabled={!editing && isAll && !addFor}>
              {editing ? "Save changes" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
