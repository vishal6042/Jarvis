import { useState, type FormEvent } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { Plus, PiggyBank, TrendingUp, Wallet, Trash2 } from "lucide-react";
import {
  investmentHistory,
  KIND_META,
  type Investment,
  type InvestmentKind,
} from "@/lib/sample";
import { useFamily, useInvestments } from "@/lib/store";
import { formatINR, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

function InvestmentCard({
  inv,
  onOpen,
  onDelete,
  canDelete,
}: {
  inv: Investment;
  onOpen: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const gain = inv.current - inv.principal;
  const pct = inv.principal ? ((gain / inv.principal) * 100).toFixed(1) : "0";
  const color = KIND_META[inv.kind].color;
  return (
    <Card
      className="relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
      onClick={onOpen}
    >
      <span
        className="absolute top-0 right-0 h-full w-1.5"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
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
      <CardContent className="space-y-1.5 text-sm">
        <Row label="Invested" value={formatINR(inv.principal)} />
        <Row label="Current" value={formatINR(inv.current)} />
        {inv.sip ? <Row label="SIP / month" value={formatINR(inv.sip)} /> : null}
        <div className="flex items-center justify-between pt-1">
          <span className="text-muted-foreground">Gain</span>
          <span className={gain >= 0 ? "font-semibold text-emerald-500" : "font-semibold text-rose-500"}>
            {formatINR(gain)} ({pct}%)
          </span>
        </div>
        {canDelete && (
          <div className="flex justify-end pt-1">
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
          </div>
        )}
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

function DetailsDialog({ inv, onClose }: { inv: Investment | null; onClose: () => void }) {
  if (!inv) return null;
  const hist = investmentHistory(inv);
  const gain = inv.current - inv.principal;
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
          <Detail label="Current value" value={formatINR(inv.current)} />
          <Detail
            label="Gain"
            value={`${formatINR(gain)} (${inv.principal ? ((gain / inv.principal) * 100).toFixed(1) : 0}%)`}
          />
          {inv.rate != null && <Detail label="Interest rate" value={`${inv.rate}%`} />}
          {inv.sip != null && <Detail label="SIP / month" value={formatINR(inv.sip)} />}
          {inv.openingDate && <Detail label="Opening date" value={formatDate(inv.openingDate)} />}
          {inv.commencementDate && (
            <Detail label="Commencement" value={formatDate(inv.commencementDate)} />
          )}
          {inv.maturityDate && <Detail label="Maturity" value={formatDate(inv.maturityDate)} />}
        </div>

        {inv.notes && <p className="text-sm text-muted-foreground">{inv.notes}</p>}

        <div>
          <p className="mb-2 text-sm font-medium">Value vs invested (12 months)</p>
          <ChartContainer config={histConfig} className="h-[200px] w-full">
            <AreaChart data={hist} margin={{ left: 4, right: 4, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Area dataKey="contributed" type="natural" stroke="var(--color-contributed)" fill="var(--color-contributed)" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
              <Area dataKey="value" type="natural" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.2} strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        </div>
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

export default function Investments() {
  const { activeMember } = useFamily();
  const isAll = activeMember.id === "all";
  const { items: allItems, add, remove } = useInvestments(isAll ? "all" : activeMember.id);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const items = kindFilter === "all" ? allItems : allItems.filter((i) => i.kind === kindFilter);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [details, setDetails] = useState<Investment | null>(null);
  const [toDelete, setToDelete] = useState<Investment | null>(null);

  const invested = items.reduce((s, i) => s + i.principal, 0);
  const current = items.reduce((s, i) => s + i.current, 0);
  const gain = current - invested;

  function set<K extends keyof FormState>(k: K) {
    return (v: string) => setForm((f) => ({ ...f, [k]: v }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    add({
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
    });
    setForm(EMPTY);
    setAddOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Investments</h1>
          <p className="text-muted-foreground">
            FD, RD, PF, PPF, Post Office (NSC/KVP/SSY) &amp; Mutual Funds
            {activeMember.relation !== "Self" && !isAll ? ` · ${activeMember.name}` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            items={[
              { value: "all", label: "All types" },
              ...KINDS.map((k) => ({ value: k, label: KIND_META[k].label })),
            ]}
            value={kindFilter}
            onValueChange={(v) => setKindFilter(v ?? "all")}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
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
          {isAll ? (
            <span className="text-sm text-muted-foreground">Select a member to add</span>
          ) : (
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="size-4" /> Add investment
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat title="Invested" value={formatINR(invested)} icon={<Wallet className="size-4" />} iconColor="#8b5cf6" />
        <Stat title="Current value" value={formatINR(current)} icon={<PiggyBank className="size-4" />} iconColor="#10b981" />
        <Stat title="Gains" value={formatINR(gain)} accent icon={<TrendingUp className="size-4" />} iconColor="#3b82f6" />
      </div>

      <Separator />

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No investments yet. Click <b>Add investment</b> to add an FD, PPF, mutual fund, etc.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((inv) => (
            <InvestmentCard
              key={inv.id}
              inv={inv}
              onOpen={() => setDetails(inv)}
              onDelete={() => setToDelete(inv)}
              canDelete={!isAll}
            />
          ))}
        </div>
      )}

      <DetailsDialog inv={details} onClose={() => setDetails(null)} />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete investment?"
        description={toDelete ? `“${toDelete.name}” (${KIND_META[toDelete.kind].label}) will be removed.` : undefined}
        onConfirm={() => toDelete && remove(toDelete.id)}
      />

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add investment</DialogTitle>
            <DialogDescription>FD, RD, PF, PPF, Post Office schemes, or a mutual fund.</DialogDescription>
          </DialogHeader>
          <form id="inv-form" className="grid grid-cols-2 gap-3" onSubmit={submit}>
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
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="inv-form">
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  title,
  value,
  accent,
  icon,
  iconColor = "var(--primary)",
}: {
  title: string;
  value: string;
  accent?: boolean;
  icon?: React.ReactNode;
  iconColor?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{title}</CardDescription>
        {icon && (
          <div
            className="flex size-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: `color-mix(in oklab, ${iconColor} 16%, transparent)`, color: iconColor }}
          >
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold tracking-tight ${accent ? "text-emerald-500" : ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
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
