import { useState, type FormEvent } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { Banknote, CalendarClock, Landmark, Layers, Plus, Trash2 } from "lucide-react";
import { loanHistory, LOAN_META, type Loan, type LoanKind } from "@/lib/sample";
import { readLoans, useFamily, useLoans } from "@/lib/store";
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

const KINDS = Object.keys(LOAN_META) as LoanKind[];
const histConfig = {
  balance: { label: "Outstanding", color: "var(--chart-2)" },
} satisfies ChartConfig;

type FormState = {
  kind: LoanKind;
  lender: string;
  sanctioned: string;
  outstanding: string;
  emi: string;
  rate: string;
  tenureMonths: string;
  startDate: string;
  endDate: string;
  notes: string;
};
const EMPTY: FormState = {
  kind: "HOME",
  lender: "",
  sanctioned: "",
  outstanding: "",
  emi: "",
  rate: "",
  tenureMonths: "",
  startDate: "",
  endDate: "",
  notes: "",
};

function num(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function tintBadge(color: string) {
  return { backgroundColor: `${color}22`, color };
}

function LoanCard({
  loan,
  onOpen,
  onDelete,
  canDelete,
}: {
  loan: Loan;
  onOpen: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const color = LOAN_META[loan.kind].color;
  const paidPct =
    loan.sanctioned > 0
      ? Math.min(100, Math.round(((loan.sanctioned - loan.outstanding) / loan.sanctioned) * 100))
      : 0;
  return (
    <Card
      className="relative flex h-full cursor-pointer flex-col overflow-hidden transition-shadow hover:shadow-md"
      onClick={onOpen}
    >
      <span className="absolute top-0 right-0 h-full w-1.5" style={{ backgroundColor: color }} aria-hidden />
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-start gap-2">
          <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <div>
            <CardTitle className="text-base">{loan.lender}</CardTitle>
            <CardDescription>{LOAN_META[loan.kind].label}</CardDescription>
          </div>
        </div>
        <Badge variant="secondary" className="border-transparent" style={tintBadge(color)}>
          {loan.kind}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-1.5 text-sm">
        <Row label="Loan amount" value={formatINR(loan.sanctioned)} />
        <Row label="Outstanding" value={formatINR(loan.outstanding)} />
        <Row label="EMI / month" value={formatINR(loan.emi)} />
        <Row label="Interest" value={`${loan.rate}%`} />
        <div className="pt-1">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Repaid</span>
            <span>{paidPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${paidPct}%`, backgroundColor: color }} />
          </div>
        </div>
        {canDelete && (
          <div className="mt-auto flex justify-end pt-2">
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

function DetailsDialog({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  if (!loan) return null;
  const hist = loanHistory(loan);
  const color = LOAN_META[loan.kind].color;
  return (
    <Dialog open={!!loan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ backgroundColor: color }} />
            {loan.lender}
            <Badge variant="secondary" className="border-transparent" style={tintBadge(color)}>
              {loan.kind}
            </Badge>
          </DialogTitle>
          <DialogDescription>{LOAN_META[loan.kind].label}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Detail label="Sanctioned" value={formatINR(loan.sanctioned)} />
          <Detail label="Outstanding" value={formatINR(loan.outstanding)} />
          <Detail label="EMI / month" value={formatINR(loan.emi)} />
          <Detail label="Interest rate" value={`${loan.rate}%`} />
          <Detail label="Tenure" value={`${loan.tenureMonths} months`} />
          {loan.startDate && <Detail label="Start date" value={formatDate(loan.startDate)} />}
          {loan.endDate && <Detail label="End date" value={formatDate(loan.endDate)} />}
        </div>

        {loan.notes && <p className="text-sm text-muted-foreground">{loan.notes}</p>}

        <div>
          <p className="mb-2 text-sm font-medium">Outstanding balance (12 months)</p>
          <ChartContainer config={histConfig} className="h-[200px] w-full">
            <AreaChart data={hist} margin={{ left: 4, right: 4, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Area dataKey="balance" type="natural" stroke="var(--color-balance)" fill="var(--color-balance)" fillOpacity={0.2} strokeWidth={2} isAnimationActive={false} />
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

export default function Loans() {
  const { activeMember, members } = useFamily();
  const isAll = activeMember.id === "all";
  const { items: ownLoans, add, remove } = useLoans(isAll ? "self" : activeMember.id);
  const all = isAll ? members.flatMap((m) => readLoans(m.id)) : ownLoans;

  const [kindFilter, setKindFilter] = useState<string>("all");
  const items = kindFilter === "all" ? all : all.filter((l) => l.kind === kindFilter);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [details, setDetails] = useState<Loan | null>(null);
  const [toDelete, setToDelete] = useState<Loan | null>(null);

  const sanctioned = items.reduce((s, l) => s + l.sanctioned, 0);
  const outstanding = items.reduce((s, l) => s + l.outstanding, 0);
  const emiTotal = items.reduce((s, l) => s + l.emi, 0);

  function set<K extends keyof FormState>(k: K) {
    return (v: string) => setForm((f) => ({ ...f, [k]: v }));
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    add({
      kind: form.kind,
      lender: form.lender.trim(),
      sanctioned: num(form.sanctioned) ?? 0,
      outstanding: num(form.outstanding) ?? num(form.sanctioned) ?? 0,
      emi: num(form.emi) ?? 0,
      rate: num(form.rate) ?? 0,
      tenureMonths: num(form.tenureMonths) ?? 0,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      notes: form.notes || undefined,
    });
    setForm(EMPTY);
    setAddOpen(false);
  }

  const filterItems = [
    { value: "all", label: "All types" },
    ...KINDS.map((k) => ({ value: k, label: LOAN_META[k].label })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Loans</h1>
          <p className="text-muted-foreground">
            Home, car, personal, education and more
            {activeMember.relation !== "Self" && !isAll ? ` · ${activeMember.name}` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select items={filterItems} value={kindFilter} onValueChange={(v) => setKindFilter(v ?? "all")}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              {filterItems.map((it) => (
                <SelectItem key={it.value} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAll ? (
            <span className="text-sm text-muted-foreground">Select a member to add</span>
          ) : (
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="size-4" /> Add loan
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Total loans" value={String(items.length)} icon={<Layers className="size-4" />} iconColor="#3b82f6" />
        <Stat title="Sanctioned" value={formatINR(sanctioned)} icon={<Landmark className="size-4" />} iconColor="#8b5cf6" />
        <Stat title="Outstanding" value={formatINR(outstanding)} accent icon={<Banknote className="size-4" />} iconColor="#f59e0b" />
        <Stat title="EMI / month" value={formatINR(emiTotal)} icon={<CalendarClock className="size-4" />} iconColor="#f43f5e" />
      </div>

      <Separator />

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No loans{kindFilter !== "all" ? " of this type" : ""}. Click <b>Add loan</b> to add one.
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              onOpen={() => setDetails(loan)}
              onDelete={() => setToDelete(loan)}
              canDelete={!isAll}
            />
          ))}
        </div>
      )}

      <DetailsDialog loan={details} onClose={() => setDetails(null)} />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete loan?"
        description={toDelete ? `“${toDelete.lender}” ${LOAN_META[toDelete.kind].label.toLowerCase()} will be removed.` : undefined}
        onConfirm={() => toDelete && remove(toDelete.id)}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add loan</DialogTitle>
            <DialogDescription>Track a home, car, personal or other loan.</DialogDescription>
          </DialogHeader>
          <form id="loan-form" className="grid grid-cols-2 gap-3" onSubmit={submit}>
            <Field label="Type">
              <Select
                items={KINDS.map((k) => ({ value: k, label: LOAN_META[k].label }))}
                value={form.kind}
                onValueChange={(v) => set("kind")((v ?? "HOME") as LoanKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: LOAN_META[k].color }} />
                        {LOAN_META[k].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Lender">
              <Input value={form.lender} onChange={(e) => set("lender")(e.target.value)} required />
            </Field>
            <Field label="Sanctioned (₹)">
              <Input value={form.sanctioned} onChange={(e) => set("sanctioned")(e.target.value)} inputMode="numeric" required />
            </Field>
            <Field label="Outstanding (₹)">
              <Input value={form.outstanding} onChange={(e) => set("outstanding")(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="EMI / month (₹)">
              <Input value={form.emi} onChange={(e) => set("emi")(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Interest rate (%)">
              <Input value={form.rate} onChange={(e) => set("rate")(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Tenure (months)">
              <Input value={form.tenureMonths} onChange={(e) => set("tenureMonths")(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Start date">
              <DatePicker value={form.startDate} onChange={set("startDate")} />
            </Field>
            <Field label="End date">
              <DatePicker value={form.endDate} onChange={set("endDate")} />
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
            <Button type="submit" form="loan-form">
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
        <div className={`text-2xl font-bold tracking-tight ${accent ? "text-rose-500" : ""}`}>
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
