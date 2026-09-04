import { useMemo, useState, type FormEvent, useEffect } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import CardArt from "@/components/CardArt";
import {
  occurrencesInMonth,
  REMINDER_META,
  upcomingReminders,
  type Reminder,
  type ReminderType,
} from "@/lib/sample";
import { useFamily, useInvestments, useLoans, useReminders } from "@/lib/store";
import { cardSummaries, type CardSummary } from "@/api";
import { useFinanceSummary } from "@/lib/finance";
import { useReserve } from "@/lib/prefs";
import { buildForecast } from "@/lib/forecast";
import { FIN_EVENT_META, financialEvents, upcomingOutflows, type FinEvent } from "@/lib/calendarEvents";
import TimelineCard from "@/components/TimelineCard";
import { ArrowDownRight, ArrowUpRight, CalendarRange } from "lucide-react";
import { listTransactions } from "@/api";
import type { Transaction } from "@/types";
import { PAY_STATE_META, reminderStatus } from "@/lib/reminderStatus";
import { formatINR, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPES = Object.keys(REMINDER_META) as ReminderType[];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

type FormState = {
  id?: string;
  title: string;
  date: string;
  type: ReminderType;
  amount: string;
  notes: string;
  repeat: boolean;
};
const todayStr = () => {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
};
const EMPTY = (): FormState => ({ title: "", date: todayStr(), type: "BILL", amount: "", notes: "", repeat: false });

export default function Calendar() {
  const { items, add, update, remove } = useReminders();
  const { activeId } = useFamily();
  const { items: investments } = useInvestments(activeId);
  const { items: loans } = useLoans(activeId);
  const f = useFinanceSummary();
  const [reserve] = useReserve();
  const [cards, setCards] = useState<CardSummary[]>([]);
  useEffect(() => {
    cardSummaries().then(setCards).catch(() => setCards([]));
  }, []);
  const [txns, setTxns] = useState<Transaction[]>([]);
  useEffect(() => {
    listTransactions(0, 500).then(setTxns).catch(() => setTxns([]));
  }, []);
  const [view, setView] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const byDate = useMemo(
    () => occurrencesInMonth(items, view.year, view.month),
    [items, view.year, view.month]
  );
  // Derived financial events (card dues, statements, salary, RD/SIP, EMIs) for the visible month.
  const finByDate = useMemo(() => {
    const map: Record<string, FinEvent[]> = {};
    for (const e of financialEvents({ year: view.year, month: view.month, cards, txns, investments, loans, reminders: items })) {
      (map[e.on] ??= []).push(e);
    }
    return map;
  }, [view.year, view.month, cards, txns, investments, loans, items]);
  const outflow = useMemo(
    () => upcomingOutflows(14, { cards, txns, investments, loans, reminders: items }),
    [cards, txns, investments, loans, items],
  );
  const forecast = useMemo(
    () => buildForecast({ balance: f.savings, txns, reminders: items, cards, reserve }),
    [f.savings, txns, items, cards, reserve],
  );

  // Upcoming list filter: "next30" (default) or a specific YYYY-M.
  const [upFilter, setUpFilter] = useState("next30");
  const monthOptions = useMemo(() => {
    const opts = [{ value: "next30", label: "Next 30 days" }];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push({
        value: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      });
    }
    return opts;
  }, []);
  const upcoming = useMemo(() => {
    if (upFilter === "next30") return upcomingReminders(items, 50, 30);
    const [y, m] = upFilter.split("-").map(Number);
    return Object.entries(occurrencesInMonth(items, y, m))
      .flatMap(([date, rs]) => rs.map((r) => ({ ...r, occursOn: date })))
      .sort((a, b) => +new Date(a.occursOn) - +new Date(b.occursOn));
  }, [items, upFilter]);

  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
  const today = todayStr();

  function shift(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function openAdd(date?: string) {
    setForm({ ...EMPTY(), date: date ?? todayStr() });
    setOpen(true);
  }
  function openEdit(r: Reminder) {
    setForm({
      id: r.id,
      title: r.title,
      date: r.date,
      type: r.type,
      amount: r.amount?.toString() ?? "",
      notes: r.notes ?? "",
      repeat: r.repeat === "monthly",
    });
    setOpen(true);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title.trim(),
      date: form.date,
      type: form.type,
      amount: form.amount.trim() === "" ? undefined : Number(form.amount),
      notes: form.notes || undefined,
      repeat: form.repeat ? ("monthly" as const) : ("none" as const),
    };
    if (form.id) update(form.id, payload);
    else add(payload);
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">Reminders, card dues, EMIs, RD/SIP instalments and your expected salary, in one place.</p>
        </div>
        <Button onClick={() => openAdd()} className="gap-2">
          <Plus className="size-4" /> Add reminder
        </Button>
      </div>

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card className="relative isolate overflow-hidden">
            <CardArt color="#f43f5e" subtle />
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarRange className="size-4 text-primary" /> Next 14 days
              </CardTitle>
              <CardDescription>
                {formatDate(outflow.from)} – {formatDate(outflow.to)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-card/60 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ArrowDownRight className="size-3.5 text-[color:var(--danger)]" /> Going out
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{formatINR(outflow.total)}</p>
                  <p className="text-xs text-muted-foreground">
                    {outflow.items.filter((e) => e.direction === "out").length} payments
                    {outflow.unknownCount > 0 ? ` · ${outflow.unknownCount} without an amount` : ""}
                  </p>
                </div>
                <div className="rounded-xl border bg-card/60 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ArrowUpRight className="size-3.5 text-[color:var(--ok)]" /> Coming in
                  </div>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{formatINR(outflow.income)}</p>
                  <p className="text-xs text-muted-foreground">{outflow.income > 0 ? "Expected salary" : "No income expected"}</p>
                </div>
              </div>
              {outflow.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing due in the next two weeks.</p>
              ) : (
                <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {outflow.items.map((e) => (
                    <div key={e.id} className="flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-sm">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{e.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(e.on)}
                          {e.detail ? ` · ${e.detail}` : ""}
                        </div>
                      </div>
                      {e.amount != null && (
                        <span className={`shrink-0 font-semibold tabular-nums ${e.direction === "in" ? "text-[color:var(--ok)]" : ""}`}>
                          {e.direction === "in" ? "+" : ""}
                          {formatINR(e.amount)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(FIN_EVENT_META) as (keyof typeof FIN_EVENT_META)[]).map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: `${FIN_EVENT_META[k].color}22`, color: FIN_EVENT_META[k].color }}
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: FIN_EVENT_META[k].color }} />
                    {FIN_EVENT_META[k].label}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
          <TimelineCard f={forecast} />
        </div>

        {/* Month grid */}
        <Card className="relative isolate overflow-hidden">
          <CardArt color="var(--primary)" subtle />
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{monthLabel}</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => shift(-1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => shift(1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {WEEKDAYS.map((w, i) => (
                <div key={i} className={`py-1 font-medium ${i === 0 ? "text-rose-500" : ""}`}>
                  {w}
                </div>
              ))}
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`b${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const ds = iso(view.year, view.month, day);
                const dayRems = byDate[ds] ?? [];
                const dayFin = finByDate[ds] ?? [];
                const chips = [
                  ...dayRems.map((r) => ({ id: r.id, title: r.title, color: REMINDER_META[r.type].color })),
                  ...dayFin.map((e) => ({ id: e.id, title: e.title, color: e.color })),
                ];
                const isToday = ds === today;
                const col = (firstWeekday + i) % 7;
                const isSunday = col === 0;
                const totalRows = Math.ceil((firstWeekday + daysInMonth) / 7);
                const inLastRow = Math.floor((firstWeekday + i) / 7) >= totalRows - 1;
                // Anchor the hover popover to the cell edge near the grid border so it never clips.
                const popHoriz = col === 0 ? "left-0" : col === 6 ? "right-0" : "left-1/2 -translate-x-1/2";
                const popVert = inLastRow ? "bottom-full -translate-y-1" : "top-full translate-y-1";
                return (
                  <div key={ds} className="group relative">
                    <button
                      onClick={() => openAdd(ds)}
                      className={`flex min-h-20 w-full flex-col rounded-lg border p-1 text-left transition-colors hover:border-primary ${
                        isToday
                          ? "border-primary bg-primary/5"
                          : isSunday
                            ? "border-rose-500/20 bg-rose-500/10"
                            : "border-border/40"
                      }`}
                    >
                      <span
                        className={`text-xs ${
                          isToday ? "font-bold text-primary" : isSunday ? "text-rose-500" : "text-muted-foreground"
                        }`}
                      >
                        {day}
                      </span>
                      <div className="mt-1 flex w-full flex-col gap-0.5 overflow-hidden">
                        {chips.slice(0, 2).map((c) => (
                          <span
                            key={c.id}
                            className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-[10px] leading-tight"
                            style={{ backgroundColor: `${c.color}22`, color: c.color }}
                          >
                            <span className="h-2.5 w-0.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                            <span className="truncate">{c.title}</span>
                          </span>
                        ))}
                        {chips.length > 2 && (
                          <span className="px-1 text-[10px] text-muted-foreground">+{chips.length - 2} more</span>
                        )}
                      </div>
                    </button>
                    {chips.length > 0 && (
                      <div className={`pointer-events-none absolute z-50 hidden w-64 rounded-lg border bg-popover p-2.5 text-popover-foreground shadow-md group-hover:block ${popHoriz} ${popVert}`}>
                        <div className="mb-2 text-xs font-medium text-muted-foreground">{formatDate(ds)}</div>
                        <div className="space-y-2">
                          {dayRems.map((r) => (
                            <div key={r.id} className="rounded-md border p-2">
                              <div className="flex items-center gap-2">
                                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: REMINDER_META[r.type].color }} />
                                <span className="min-w-0 flex-1 truncate text-xs font-medium">{r.title}</span>
                                <span
                                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                  style={{ backgroundColor: `${REMINDER_META[r.type].color}22`, color: REMINDER_META[r.type].color }}
                                >
                                  {REMINDER_META[r.type].label}
                                </span>
                                {r.amount != null && (
                                  <span className="shrink-0 text-xs font-semibold tabular-nums">{formatINR(r.amount)}</span>
                                )}
                              </div>
                              {r.notes && <div className="mt-1 pl-4 text-[10px] text-muted-foreground">{r.notes}</div>}
                            </div>
                          ))}
                          {dayFin.map((e) => (
                            <div key={e.id} className="rounded-md border p-2">
                              <div className="flex items-center gap-2">
                                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                                <span className="min-w-0 flex-1 truncate text-xs font-medium">{e.title}</span>
                                <span
                                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                  style={{ backgroundColor: `${e.color}22`, color: e.color }}
                                >
                                  {FIN_EVENT_META[e.kind].label}
                                </span>
                                {e.amount != null && (
                                  <span className="shrink-0 text-xs font-semibold tabular-nums">
                                    {e.direction === "in" ? "+" : ""}
                                    {formatINR(e.amount)}
                                  </span>
                                )}
                              </div>
                              {e.detail && <div className="mt-1 pl-4 text-[10px] text-muted-foreground">{e.detail}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming list */}
        <Card className="relative isolate overflow-hidden">
          <CardArt color="#8b5cf6" subtle />
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
            <div>
              <CardTitle>Upcoming</CardTitle>
              <CardDescription>{upcoming.length} reminders ahead.</CardDescription>
            </div>
            <Select items={monthOptions} value={upFilter} onValueChange={(v) => setUpFilter(v ?? "next30")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Next 30 days" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((it) => (
                  <SelectItem key={it.value} value={it.value}>
                    {it.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled. Click a day to add one.</p>
            ) : (
              upcoming.map((r) => (
                <div key={`${r.id}-${r.occursOn}`} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: REMINDER_META[r.type].color }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{r.title}</span>
                      {r.repeat === "monthly" && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          <Repeat className="size-2.5" /> Monthly
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {formatDate(r.occursOn)}
                      {(() => {
                        const st = reminderStatus(r.occursOn, r.amount, txns);
                        if (st.state === "upcoming") return null;
                        const m = PAY_STATE_META[st.state];
                        return (
                          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${m.color}22`, color: m.color }}>
                            {m.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="ml-auto border-transparent"
                    style={{ backgroundColor: `${REMINDER_META[r.type].color}22`, color: REMINDER_META[r.type].color }}
                  >
                    {REMINDER_META[r.type].label}
                  </Badge>
                  {r.amount != null && <span className="text-sm font-semibold">{formatINR(r.amount)}</span>}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(r.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit reminder" : "Add reminder"}</DialogTitle>
            <DialogDescription>Schedule a payment, bill, EMI, investment or SIP.</DialogDescription>
          </DialogHeader>
          <form id="rem-form" className="grid gap-3" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Date</Label>
                <DatePicker value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <Select
                  items={TYPES.map((t) => ({ value: t, label: REMINDER_META[t].label }))}
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: (v ?? "BILL") as ReminderType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        <span className="flex items-center gap-2">
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: REMINDER_META[t].color }} />
                          {REMINDER_META[t].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Amount (₹, optional)</Label>
              <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="numeric" />
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5">
              <input
                type="checkbox"
                checked={form.repeat}
                onChange={(e) => setForm({ ...form, repeat: e.target.checked })}
                className="size-4 accent-primary"
              />
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Repeat className="size-4 text-muted-foreground" /> Repeat monthly
              </span>
              {form.repeat && (
                <span className="ml-auto text-xs text-muted-foreground">
                  recurs on day {Number(form.date.slice(8, 10))}
                </span>
              )}
            </label>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="rem-form">
              {form.id ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
