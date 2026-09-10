import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, Check, History, MessageSquarePlus, Send, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { ACTION_LABEL, describeAction, executeAction, isImperative, validateAction, type PlannedAction } from "@/lib/actions";
import { answerQuery, ASSISTANT_SUGGESTIONS, type FinanceContext } from "@/lib/assistant";
import { useFinanceSummary } from "@/lib/finance";
import {
  aiChat,
  aiPlan,
  appendChatTurn,
  cardSummaries,
  deleteChat,
  getChat,
  listChats,
  listTransactions,
  settleChatTurn,
  startChat,
  type CardSummary,
  type ChatSummary,
  type ChatTurn,
} from "@/api";
import type { Transaction } from "@/types";
import { useFamily, useInvestments, useLoans, useReminderPayments, useReminders, useThresholds } from "@/lib/store";
import { getGoals, type ApiGoal } from "@/lib/api/finance";
import { amortise } from "@/lib/amortisation";
import { portfolioReturn } from "@/lib/portfolio";
import { useReserve } from "@/lib/prefs";
import { buildForecast } from "@/lib/forecast";
import { formatDate, formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Markdown from "@/components/Markdown";
import CardArt from "@/components/CardArt";
import JarvisLogo from "@/components/JarvisLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ActionStatus = "pending" | "done" | "cancelled" | "failed";

interface Msg {
  /** Client-side identity, so a turn can be found again after an await without an index. */
  key: number;
  role: "user" | "assistant";
  text: string;
  /** A proposed action awaiting the user's explicit confirmation. */
  action?: PlannedAction;
  status?: ActionStatus;
  result?: string;
  /** Set once the turn has been saved, and needed to record what became of its action. */
  savedId?: number;
}

const GREETING =
  "Hi! I'm your finance assistant. Ask me about your savings, spending, income, loans or investments — or tell me to add a reminder, budget, goal or transaction and I'll confirm before doing it.";

/** A stored turn, back into the shape the page renders. */
function fromTurn(turn: ChatTurn, key: number): Msg {
  let action: PlannedAction | undefined;
  if (turn.actionJson) {
    try {
      action = JSON.parse(turn.actionJson) as PlannedAction;
    } catch {
      // A turn whose action can't be read is still worth showing as what was said.
      action = undefined;
    }
  }
  return {
    key,
    role: turn.role === "user" ? "user" : "assistant",
    text: turn.body,
    action,
    status: (turn.status as ActionStatus) ?? undefined,
    result: turn.result ?? undefined,
    savedId: turn.id,
  };
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
  const { paidKeys } = useReminderPayments();
  const { activeId, activeMember } = useFamily();
  const { items: investments } = useInvestments(activeId);
  const { items: loans } = useLoans(activeId);
  const [goals, setGoals] = useState<ApiGoal[]>([]);
  useEffect(() => {
    getGoals().then(setGoals).catch(() => setGoals([]));
  }, []);
  const { items: thresholds, saveAll: saveThresholds } = useThresholds();
  const { reload } = useFamily();
  const [reserve] = useReserve();
  useEffect(() => {
    listTransactions(0, 500).then(setTxns).catch(() => setTxns([]));
    cardSummaries().then(setCards).catch(() => setCards([]));
  }, []);
  const contextText = useMemo(() => {
    const fc = buildForecast({ balance: f.savings, txns, reminders, cards, reserve, paidKeys, earns: activeMember.earns });
    const pf = portfolioReturn(investments);
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
      ...(investments.length
        ? [
            `Investments: ${formatINR(pf.current)} now from ${formatINR(pf.invested)} invested${pf.annualised != null ? `, ${pf.annualised.toFixed(1)}% a year` : ""}; ${formatINR(pf.monthlyCommitment)}/month committed`,
            ...investments.map((i) => `  - ${i.name} (${i.kind}): ${formatINR(i.current)}${i.maturityDate ? `, matures ${i.maturityDate}` : ""}`),
          ]
        : []),
      ...(loans.length
        ? [
            "Loans:",
            ...loans.map((l) => {
              const a = amortise(l.outstanding, l.rate, l.emi);
              const free = a ? `debt-free ${a.debtFreeOn.toISOString().slice(0, 7)} at the current EMI` : "EMI does not cover the interest";
              return `  - ${l.lender}: ${formatINR(l.outstanding)} outstanding at ${l.rate}%, EMI ${formatINR(l.emi)}; ${free}`;
            }),
          ]
        : []),
      ...(goals.length
        ? ["Goals:", ...goals.map((g) => `  - ${g.name}: ${formatINR(g.savedAmount)} of ${formatINR(g.targetAmount)}${g.targetDate ? ` by ${g.targetDate}` : ""}`)]
        : []),
    ];
    return lines.join("\n");
  }, [f.savings, f.investments, f.outstanding, f.earning, f.lastMonthSpend, f.savingsRate, f.spend, txns, reminders, cards, reserve, paidKeys, investments, loans, goals, activeMember.earns]);

  const [messages, setMessages] = useState<Msg[]>([{ key: 0, role: "assistant", text: GREETING }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Saved conversations. The chat works whether or not history is reachable: every call below is
  // best-effort, and a failure costs the transcript, never the answer.
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [opening, setOpening] = useState(false);
  // The id is also held in a ref: one turn writes two messages, and both have to land in the same
  // chat even though the second starts before React has re-rendered with the first one's state.
  const sessionRef = useRef<number | null>(null);
  const keySeq = useRef(1);

  const refreshChats = useCallback(() => {
    listChats()
      .then(setChats)
      .catch(() => {});
  }, []);
  useEffect(refreshChats, [refreshChats]);

  /** The chat this turn belongs to, started on the first thing actually said. */
  async function currentSession(): Promise<number | null> {
    if (sessionRef.current != null) return sessionRef.current;
    try {
      const started = await startChat();
      sessionRef.current = started.id;
      setOpenId(started.id);
      setChats((c) => [started, ...c]);
      return started.id;
    } catch {
      return null;
    }
  }

  /** Show a turn straight away; save it behind the user's back. Returns its client key. */
  function say(msg: Omit<Msg, "key">): number {
    const key = ++keySeq.current;
    setMessages((m) => [...m, { ...msg, key }]);
    void remember(key, msg);
    return key;
  }

  async function remember(key: number, msg: Omit<Msg, "key">) {
    const session = await currentSession();
    if (session == null) return;
    try {
      const saved = await appendChatTurn(session, {
        role: msg.role,
        body: msg.text,
        actionJson: msg.action ? JSON.stringify(msg.action) : undefined,
        status: msg.status,
        result: msg.result,
      });
      setMessages((m) => m.map((x) => (x.key === key ? { ...x, savedId: saved.id } : x)));
      // The first question names the chat, so the list is only right after a round trip.
      if (msg.role === "user") refreshChats();
    } catch {
      // Unsaved, but said: leave the conversation alone.
    }
  }

  function newChat() {
    sessionRef.current = null;
    setOpenId(null);
    setMessages([{ key: ++keySeq.current, role: "assistant", text: GREETING }]);
    setInput("");
  }

  async function openChat(id: number) {
    if (busy || opening) return;
    setOpening(true);
    try {
      const transcript = await getChat(id);
      sessionRef.current = transcript.id;
      setOpenId(transcript.id);
      setMessages(
        transcript.messages.length === 0
          ? [{ key: ++keySeq.current, role: "assistant", text: GREETING }]
          : transcript.messages.map((t) => fromTurn(t, ++keySeq.current)),
      );
    } catch {
      toast.error("Couldn't open that conversation.");
    } finally {
      setOpening(false);
    }
  }

  async function removeChat(id: number) {
    try {
      await deleteChat(id);
      setChats((c) => c.filter((x) => x.id !== id));
      if (sessionRef.current === id) newChat();
    } catch {
      toast.error("Couldn't delete that conversation.");
    }
  }

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
    say({ role: "user", text: q });
    setInput("");
    setBusy(true);
    try {
      // Imperative messages go to the planner first; the action is only run after explicit confirmation.
      if (isImperative(q)) {
        const plan = await aiPlan(q);
        if (plan.type !== "none") {
          const problem = validateAction(plan);
          if (problem) {
            say({ role: "assistant", text: problem });
          } else {
            say({
              role: "assistant",
              text: plan.summary || ACTION_LABEL[plan.type],
              action: plan,
              status: "pending",
            });
          }
          return;
        }
      }
      // Real backend agent (ai-orchestrator → Ollama, calling expense analytics tools).
      const answer = await aiChat(q, contextText);
      say({ role: "assistant", text: answer });
    } catch {
      // Backend unavailable → quick local heuristic over the on-device data.
      say({ role: "assistant", text: answerQuery(q, ctx) });
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

  /**
   * Mark what became of a proposed action, on screen and against the saved turn, so reopening the
   * chat tomorrow shows the same outcome rather than a Confirm button for something already done.
   */
  async function settle(index: number, status: ActionStatus, result?: string) {
    setStatus(index, { status, result });
    const savedId = messages[index]?.savedId;
    const session = sessionRef.current;
    if (savedId == null || session == null) return;
    try {
      await settleChatTurn(session, savedId, status, result);
    } catch {
      // The action itself has already happened; recording it is best-effort.
    }
  }

  async function runAction(index: number) {
    const msg = messages[index];
    if (!msg?.action || msg.status !== "pending" || busy) return;
    setBusy(true);
    try {
      const result = await executeAction(msg.action, { addReminder, thresholds, saveThresholds, reload });
      await settle(index, "done", result);
    } catch (e) {
      await settle(index, "failed", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-6xl gap-4">
      <ChatHistory
        chats={chats}
        openId={openId}
        busy={busy || opening}
        onOpen={openChat}
        onNew={newChat}
        onDelete={removeChat}
      />

      <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-4 flex items-center gap-3">
        <JarvisLogo size={44} className="rounded-[22%] shadow-lg shadow-primary/25 ring-1 ring-white/15" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Ask questions, or tell me what to do — every action is shown for confirmation first.
          </p>
        </div>
        {/* The sidebar is the way in on a wide screen; on a narrow one, the same list in a menu. */}
        <div className="ml-auto flex shrink-0 items-center gap-1 md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" title="Past conversations" />}>
              <History className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {chats.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No saved conversations yet.
                </div>
              ) : (
                chats.slice(0, 12).map((c) => (
                  <DropdownMenuItem key={c.id} onClick={() => openChat(c.id)} className="flex-col items-start gap-0">
                    <span className="w-full truncate text-sm">{c.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(c.updatedAt)} · {c.messages} messages
                    </span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={newChat} title="New chat">
            <MessageSquarePlus className="size-5" />
          </Button>
        </div>
      </div>

      <div className="relative isolate min-h-0 flex-1 overflow-hidden rounded-2xl border card-sheen">
        <CardArt color="var(--primary)" subtle />
        <div className="h-full space-y-4 overflow-y-auto p-4 md:p-6">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <JarvisLogo size={32} className="mt-0.5 shrink-0 rounded-[22%] shadow-sm" />
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
            <JarvisLogo size={32} className="mt-0.5 shrink-0 rounded-[22%] shadow-sm" />
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
    </div>
  );
}

/**
 * Past conversations, newest first. Clicking one reopens it; the chat then carries on in it, so a
 * question asked tomorrow lands in the same thread as the one it follows from.
 */
function ChatHistory({
  chats,
  openId,
  busy,
  onOpen,
  onNew,
  onDelete,
}: {
  chats: ChatSummary[];
  openId: number | null;
  busy: boolean;
  onOpen: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-2 md:flex">
      <Button variant="outline" onClick={onNew} className="justify-start gap-2">
        <MessageSquarePlus className="size-4" /> New chat
      </Button>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto rounded-2xl border bg-card/50 p-1.5">
        {chats.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Conversations are saved here once you ask something.
          </p>
        ) : (
          chats.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors",
                c.id === openId
                  ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                  : "hover:bg-primary/5",
              )}
            >
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                disabled={busy}
                className="min-w-0 flex-1 text-left disabled:opacity-60"
              >
                <div className="truncate text-sm">{c.title}</div>
                <div className="text-[10px] text-muted-foreground">
                  {formatDate(c.updatedAt)} · {c.messages} {c.messages === 1 ? "message" : "messages"}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDelete(c.id)}
                title="Delete conversation"
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
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
