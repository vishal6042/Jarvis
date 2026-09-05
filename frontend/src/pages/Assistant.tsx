import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, Bot, Check, Send, Sparkles, Wand2, X } from "lucide-react";
import { ACTION_LABEL, describeAction, executeAction, isImperative, validateAction, type PlannedAction } from "@/lib/actions";
import { answerQuery, ASSISTANT_SUGGESTIONS, type FinanceContext } from "@/lib/assistant";
import { useFinanceSummary } from "@/lib/finance";
import { aiChat, aiPlan, cardSummaries, listTransactions, type CardSummary } from "@/api";
import type { Transaction } from "@/types";
import { useFamily, useReminders, useThresholds } from "@/lib/store";
import { useReserve } from "@/lib/prefs";
import { buildForecast } from "@/lib/forecast";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Markdown from "@/components/Markdown";
import CardArt from "@/components/CardArt";

type ActionStatus = "pending" | "done" | "cancelled" | "failed";

interface Msg {
  role: "user" | "assistant";
  text: string;
  /** A proposed action awaiting the user's explicit confirmation. */
  action?: PlannedAction;
  status?: ActionStatus;
  result?: string;
}

export default function Assistant() {
  const f = useFinanceSummary();
  const ctx: FinanceContext = {
    memberName: f.memberName,
    savings: f.savings,
    earning: f.earning,
    spend: f.spend,
    outstanding: f.outstanding,
    emiTotal: f.emiTotal,
    investments: f.investments,
    savingsRate: f.savingsRate,
  };

  // Live snapshot for the agent: the same forecast the dashboard shows, as plain text.
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const { items: reminders, add: addReminder } = useReminders();
  const { items: thresholds, saveAll: saveThresholds } = useThresholds();
  const { reload } = useFamily();
  const [reserve] = useReserve();
  useEffect(() => {
    listTransactions(0, 500).then(setTxns).catch(() => setTxns([]));
    cardSummaries().then(setCards).catch(() => setCards([]));
  }, []);
  const contextText = useMemo(() => {
    const fc = buildForecast({ balance: f.savings, txns, reminders, cards, reserve });
    const lines = [
      `Today: ${fc.today}`,
      `Savings balance (cash): ${formatINR(f.savings)}; investments: ${formatINR(f.investments)}; outstanding loans: ${formatINR(f.outstanding)}`,
      `Last month: earning ${formatINR(f.earning)}, spend ${formatINR(f.lastMonthSpend)}; savings rate ${f.savingsRate}%`,
      `This month so far: spend ${formatINR(f.spend)}`,
      `Emergency reserve the user keeps: ${formatINR(reserve)}`,
      `Safe to spend for the rest of this month (after known bills and the reserve): ${formatINR(fc.safeToSpend)}`,
      `Projected balance on ${fc.projectedOn}: ${formatINR(fc.projected)}; lowest point ${formatINR(fc.minBalance)} on ${fc.minOn}`,
      fc.salary.amount > 0
        ? `Typical salary: ${formatINR(fc.salary.amount)} around day ${fc.salary.dayOfMonth}; received this month: ${fc.salary.receivedThisMonth ? "yes" : "not yet"}`
        : "Salary pattern: unknown",
      "Upcoming (next 30 days):",
      ...fc.events
        .filter((e) => e.kind !== "start" && e.kind !== "end")
        .slice(0, 12)
        .map((e) => `  - ${e.on} ${e.label}: ${e.unknownAmount ? "amount not set" : (e.amount > 0 ? "+" : "-") + formatINR(Math.abs(e.amount))}`),
      ...(cards.length ? ["Cards:", ...cards.map((c) => `  - ${c.displayName}: unbilled ${formatINR(c.unbilled)}, bill due ${formatINR(c.billDue)}${c.dueOn ? " on " + c.dueOn : ""}`)] : []),
    ];
    return lines.join("\n");
  }, [f.savings, f.investments, f.outstanding, f.earning, f.lastMonthSpend, f.savingsRate, f.spend, txns, reminders, cards, reserve]);

  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Hi! I'm your finance assistant. Ask me about your savings, spending, income, loans or investments — or tell me to add a reminder, budget, goal or transaction and I'll confirm before doing it.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Deep link from the command bar: /assistant?q=… asks once, after the snapshot has loaded.
  const [params] = useSearchParams();
  const askedRef = useRef(false);
  useEffect(() => {
    const q0 = params.get("q");
    if (!q0 || askedRef.current || txns.length === 0) return;
    askedRef.current = true;
    ask(q0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, txns.length]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      // Imperative messages go to the planner first; the action is only run after explicit confirmation.
      if (isImperative(q)) {
        const plan = await aiPlan(q);
        if (plan.type !== "none") {
          const problem = validateAction(plan);
          setMessages((m) => [
            ...m,
            problem
              ? { role: "assistant", text: problem }
              : { role: "assistant", text: plan.summary || ACTION_LABEL[plan.type], action: plan, status: "pending" },
          ]);
          return;
        }
      }
      // Real backend agent (ai-orchestrator → Ollama, calling expense analytics tools).
      const answer = await aiChat(q, contextText);
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch {
      // Backend unavailable → quick local heuristic over the on-device data.
      setMessages((m) => [...m, { role: "assistant", text: answerQuery(q, ctx) }]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  const setStatus = (index: number, patch: Partial<Msg>) =>
    setMessages((m) => m.map((x, j) => (j === index ? { ...x, ...patch } : x)));

  async function runAction(index: number) {
    const msg = messages[index];
    if (!msg?.action || msg.status !== "pending" || busy) return;
    setBusy(true);
    try {
      const result = await executeAction(msg.action, { addReminder, thresholds, saveThresholds, reload });
      setStatus(index, { status: "done", result });
    } catch (e) {
      setStatus(index, { status: "failed", result: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-5xl flex-col">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-chart-1 text-primary-foreground shadow-lg shadow-primary/30 ring-1 ring-white/15">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Ask questions, or tell me what to do — every action is shown for confirmation first.
          </p>
        </div>
      </div>

      <div className="relative isolate min-h-0 flex-1 overflow-hidden rounded-2xl border card-sheen">
        <CardArt color="var(--primary)" subtle />
        <div className="h-full space-y-4 overflow-y-auto p-4 md:p-6">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/80 to-chart-1/80 text-primary-foreground shadow-sm">
                <Bot className="size-4" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                m.role === "user"
                  ? "rounded-br-sm bg-gradient-to-br from-primary to-chart-1 text-primary-foreground"
                  : "rounded-bl-sm bg-card ring-1 ring-primary/15"
              }`}
            >
              {m.role === "assistant" ? <Markdown text={m.text} /> : m.text}
              {m.action && (
                <ActionCard
                  action={m.action}
                  status={m.status ?? "pending"}
                  result={m.result}
                  busy={busy}
                  onConfirm={() => runAction(i)}
                  onCancel={() => setStatus(i, { status: "cancelled" })}
                />
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start gap-2">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/80 to-chart-1/80 text-primary-foreground shadow-sm">
              <Bot className="size-4" />
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-card px-4 py-2.5 text-sm text-muted-foreground ring-1 ring-primary/15">
              <span className="inline-flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
        </div>
      </div>

      {messages.length <= 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ASSISTANT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={busy}
              className="rounded-full bg-primary/8 px-3 py-1.5 text-xs text-foreground/80 ring-1 ring-primary/20 transition-colors hover:bg-primary/15 hover:text-foreground disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="mt-3 flex items-center gap-2 rounded-2xl border bg-card p-1.5 pl-3 shadow-sm ring-1 ring-primary/10 card-sheen"
      >
        <Sparkles className="size-4 shrink-0 text-primary/70" />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your finances…"
          autoFocus
          disabled={busy}
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || busy}
          className="rounded-xl bg-gradient-to-br from-primary to-chart-1 shadow-md shadow-primary/30"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

/** A proposed action: facts to check, then Confirm / Cancel. Nothing runs until Confirm. */
function ActionCard({
  action,
  status,
  result,
  busy,
  onConfirm,
  onCancel,
}: {
  action: PlannedAction;
  status: ActionStatus;
  result?: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const rows = describeAction(action);
  const tone =
    status === "done" ? "var(--ok)" : status === "failed" ? "var(--danger)" : status === "cancelled" ? "var(--muted-foreground)" : "var(--primary)";
  return (
    <div className="mt-2 overflow-hidden rounded-xl border" style={{ borderColor: `color-mix(in oklab, ${tone} 45%, transparent)` }}>
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold" style={{ backgroundColor: `color-mix(in oklab, ${tone} 12%, transparent)`, color: tone }}>
        {status === "done" ? <Check className="size-3.5" /> : status === "failed" ? <AlertCircle className="size-3.5" /> : status === "cancelled" ? <X className="size-3.5" /> : <Wand2 className="size-3.5" />}
        {status === "pending" ? ACTION_LABEL[action.type] : status === "done" ? "Done" : status === "failed" ? "Could not do that" : "Cancelled"}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 py-2 text-xs">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium">{r.value}</span>
          </div>
        ))}
      </div>
      {result && <p className="px-3 pb-2 text-xs text-muted-foreground">{result}</p>}
      {status === "pending" && (
        <div className="flex justify-end gap-2 border-t px-3 py-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" className="gap-1" onClick={onConfirm} disabled={busy}>
            <Check className="size-3.5" /> Confirm
          </Button>
        </div>
      )}
    </div>
  );
}
