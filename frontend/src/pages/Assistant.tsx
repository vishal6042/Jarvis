import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageSquarePlus, Paperclip, Send, Sparkles } from "lucide-react";
import { ACTION_LABEL, executeAction, isImperative, validateAction, type PlannedAction } from "@/lib/actions";
import { answerQuery, ASSISTANT_SUGGESTIONS, type FinanceContext } from "@/lib/assistant";
import { useFinanceSummary } from "@/lib/finance";
import { statementsOf } from "@/lib/cards";
import {
  aiChat,
  aiPlan,
  appendChatTurn,
  cardSummaries,
  createTransaction,
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
import type { ChatSnapshot, Transaction, Visual } from "@/types";
import { aiReceipt, type AiReceipt } from "@/lib/api/aiAssist";
import AssistantVisuals from "@/components/AssistantVisuals";
import { useFamily, useInvestments, useLoans, useReminderPayments, useReminders, useThresholds } from "@/lib/store";
import { getGoals, type ApiGoal } from "@/lib/api/finance";
import { amortise } from "@/lib/amortisation";
import { portfolioReturn } from "@/lib/portfolio";
import { useReserve } from "@/lib/prefs";
import { buildForecast, isoDay } from "@/lib/forecast";
import { upcomingOutflows } from "@/lib/calendarEvents";
import { currentMonthBreakdown } from "@/lib/breakdown";
import { buildInsights } from "@/lib/insights";
import { useStatementsVersion } from "@/lib/statements";
import { CATEGORIES } from "@/lib/sample";
import { formatINR } from "@/lib/format";
import PageHeader from "@/components/page/PageHeader";
import DailyBrief from "@/components/assistant/DailyBrief";
import ChatHistory, { ChatHistoryMenu } from "@/components/assistant/ChatHistory";
import ActionCard, { type ActionStatus } from "@/components/assistant/ActionCard";
import FollowUps, { followUpsFor } from "@/components/assistant/FollowUps";
import ContextChips, { PERIOD_LABEL, scopePrefix, type ChatPeriod } from "@/components/assistant/ContextChips";
import ReceiptCard, { draftFrom, NO_ACCOUNT, ReadingReceipt, type ReceiptDraft, type ReceiptState } from "@/components/assistant/ReceiptCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Markdown from "@/components/Markdown";
import { toast } from "sonner";

/** A screenshot read into a transaction, waiting on (or past) the person's decision. */
interface ReceiptTurn {
  draft: ReceiptDraft;
  confidence: number;
  /** The model picked the category, so the card marks it as a guess. */
  guessedCategory: boolean;
  state: ReceiptState;
}

interface Msg {
  /** Client-side identity, so a turn can be found again after an await without an index. */
  key: number;
  role: "user" | "assistant";
  text: string;
  /** A proposed action awaiting the user's explicit confirmation. */
  action?: PlannedAction;
  /** The figures behind the answer, drawn as cards and charts under it. */
  visuals?: Visual[];
  status?: ActionStatus;
  result?: string;
  /** Set once the turn has been saved, and needed to record what became of its action. */
  savedId?: number;
  /** The attached image, as a data URL. On screen only: history keeps the words, never the bytes. */
  image?: string;
  /** What a screenshot was read as, for the confirmation card. */
  receipt?: ReceiptTurn;
  /** The scope the question was sent with ("This month · Priya"), shown over the question. */
  scope?: string;
}

const GREETING =
  "Hi! I'm your finance assistant. Ask me about your savings, spending, income, loans or investments — or tell me to add a reminder, budget, goal or transaction and I'll confirm before doing it.";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const ADDED_NOTE = "Added. If the bank's SMS for it arrives later, it will confirm this entry instead of adding another.";

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
  let visuals: Visual[] | undefined;
  if (turn.visualsJson) {
    try {
      visuals = JSON.parse(turn.visualsJson) as Visual[];
    } catch {
      // Same again: the sentence underneath still carries the answer.
      visuals = undefined;
    }
  }
  return {
    key,
    role: turn.role === "user" ? "user" : "assistant",
    text: turn.body,
    action,
    visuals,
    status: (turn.status as ActionStatus) ?? undefined,
    result: turn.result ?? undefined,
    savedId: turn.id,
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** How a read screenshot is kept in history: one plain sentence in place of the card. */
function receiptSentence(d: ReceiptDraft): string {
  const amount = Number(d.amount);
  const what = Number.isFinite(amount) && amount > 0 ? formatINR(amount) : "an unread amount";
  const who = d.merchant.trim() || "an unnamed payee";
  return `Read from a screenshot: ${what} ${d.direction === "CREDIT" ? "from" : "to"} ${who} on ${d.occurredOn}${d.category ? ` (${d.category})` : ""}.`;
}

/**
 * The assistant: a conversation over the person's own money, running on the local model. Questions
 * go out with the same forecast the dashboard shows, so the answers use its figures; instructions
 * are turned into an action to confirm; a payment screenshot becomes a transaction to check. A
 * fresh chat opens on the daily brief, so the first thing on the page is already useful.
 */
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

  // The same data the dashboard loads, so the brief and the model's snapshot agree with it. The
  // ledger is refetched when a card bill is marked paid, and after a screenshot is added here.
  const statementsVersion = useStatementsVersion();
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [txnsLoaded, setTxnsLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    listTransactions(0, 5000)
      .then((t) => alive && setTxns(t))
      .catch(() => alive && setTxns([]))
      .finally(() => alive && setTxnsLoaded(true));
    return () => {
      alive = false;
    };
  }, [statementsVersion, ledgerVersion]);
  const [cards, setCards] = useState<CardSummary[]>([]);
  useEffect(() => {
    cardSummaries().then(setCards).catch(() => setCards([]));
  }, [statementsVersion]);
  const { items: reminders, add: addReminder } = useReminders();
  const { paidKeys } = useReminderPayments();
  const { activeId, activeMember, reload } = useFamily();
  const earns = activeMember.earns;
  const { items: investments } = useInvestments(activeId);
  const { items: loans } = useLoans(activeId);
  const [goals, setGoals] = useState<ApiGoal[]>([]);
  useEffect(() => {
    getGoals().then(setGoals).catch(() => setGoals([]));
  }, []);
  const { items: thresholds, saveAll: saveThresholds } = useThresholds();
  const [reserve] = useReserve();

  const forecast = useMemo(
    () => buildForecast({ balance: f.savings, txns, reminders, cards, reserve, paidKeys, earns }),
    [f.savings, txns, reminders, cards, reserve, paidKeys, earns],
  );
  // Every non-savings account is a card for the spend rule (refunds on it net off), as in Analytics.
  const cardIds = useMemo(() => new Set(f.accounts.filter((a) => a.type !== "SAVINGS").map((a) => a.id)), [f.accounts]);
  const breakdown = useMemo(() => currentMonthBreakdown(txns, new Date(), cardIds), [txns, cardIds]);
  const reviewCount = useMemo(
    () => txns.filter((t) => !t.transfer && !t.settlement && (!t.category || t.category === "Uncategorized" || t.accountId == null)).length,
    [txns],
  );
  const insights = useMemo(
    () => buildInsights({ cards, reminders, txns, thresholds, breakdown, forecast, reviewCount, savingsRate: f.savingsRate, paidKeys }),
    [cards, reminders, txns, thresholds, breakdown, forecast, reviewCount, f.savingsRate, paidKeys],
  );
  const week = useMemo(
    () => upcomingOutflows(7, { cards, txns, investments, loans, reminders, paidKeys, earns }),
    [cards, txns, investments, loans, reminders, paidKeys, earns],
  );
  // The categories a screenshot can be filed under: the budgetable ones plus any the ledger uses.
  const categories = useMemo(() => {
    const seen = txns.map((t) => t.category).filter((c): c is string => !!c && c !== "Uncategorized");
    return Array.from(new Set([...CATEGORIES, ...seen])).sort();
  }, [txns]);

  /**
   * The same forecast the prose snapshot describes, structured — so the safe-to-spend tools answer
   * with these figures instead of the model retyping the paragraph, and the chat can draw them.
   */
  const snapshot = useMemo<ChatSnapshot>(
    () => ({
      safeToSpend: forecast.safeToSpend,
      reserve,
      savings: f.savings,
      spentThisMonth: f.spend,
      projected: forecast.projected,
      projectedOn: forecast.projectedOn,
      minBalance: forecast.minBalance,
      minOn: forecast.minOn,
      upcoming: forecast.events
        .filter((e) => e.kind !== "start" && e.kind !== "end")
        .slice(0, 12)
        .map((e) => ({ on: e.on, label: e.label, amount: e.amount, estimate: !!e.unknownAmount })),
    }),
    [forecast, reserve, f.savings, f.spend],
  );

  const contextText = useMemo(() => {
    const fc = forecast;
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
      ...(cards.length ? ["Cards (one line per statement):", ...statementsOf(cards).map((c) => `  - ${c.displayName}: unbilled ${formatINR(c.unbilled)}, bill due ${formatINR(c.billDue)}${c.dueOn ? " on " + c.dueOn : ""}`)] : []),
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
  }, [forecast, f.savings, f.investments, f.outstanding, f.earning, f.lastMonthSpend, f.savingsRate, f.spend, cards, reserve, investments, loans, goals]);

  const [messages, setMessages] = useState<Msg[]>([{ key: 0, role: "assistant", text: GREETING }]);
  // The latest messages, for code that runs after an await and must not read a stale render.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // What questions are scoped to. The member is whoever the app is showing; the chip only decides
  // whether the question says so.
  const [period, setPeriod] = useState<ChatPeriod | null>("this-month");
  const [memberOn, setMemberOn] = useState(true);
  const memberChip = activeMember.id === "all" ? "All members" : activeMember.name;
  const memberScope = activeMember.id === "all" ? "the whole household" : activeMember.name;

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

  /**
   * Show a turn straight away; save it behind the user's back. Returns its client key.
   * @param saveAs the words to keep in history when they differ from what is on screen (an image
   *   turn keeps a sentence about the image, never the image).
   */
  function say(msg: Omit<Msg, "key">, saveAs?: string): number {
    const key = ++keySeq.current;
    setMessages((m) => [...m, { ...msg, key }]);
    void remember(key, msg, saveAs);
    return key;
  }

  async function remember(key: number, msg: Omit<Msg, "key">, saveAs?: string) {
    const session = await currentSession();
    if (session == null) return;
    try {
      const saved = await appendChatTurn(session, {
        role: msg.role,
        body: saveAs ?? msg.text,
        actionJson: msg.action ? JSON.stringify(msg.action) : undefined,
        visualsJson: msg.visuals?.length ? JSON.stringify(msg.visuals) : undefined,
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
  }, [messages, reading]);

  // Deep link from the command bar: /assistant?q=… asks once, after the snapshot has loaded.
  const [params] = useSearchParams();
  const askedRef = useRef(false);
  useEffect(() => {
    const q0 = params.get("q");
    if (!q0 || askedRef.current || !txnsLoaded) return;
    askedRef.current = true;
    ask(q0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, txnsLoaded]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const member = memberOn ? memberScope : null;
    const prefix = scopePrefix(period, member);
    const scope = [period ? PERIOD_LABEL[period] : null, memberOn ? memberChip : null].filter(Boolean).join(" · ");
    say({ role: "user", text: q, scope: scope || undefined });
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
      // Real backend agent (ai-orchestrator → Ollama, calling expense analytics tools). The scope
      // goes in front of the question, so "how much on food?" means the period and member shown.
      const reply = await aiChat(prefix + q, contextText, snapshot);
      say({ role: "assistant", text: reply.answer, visuals: reply.visuals });
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

  const patch = (key: number, p: Partial<Msg>) => setMessages((m) => m.map((x) => (x.key === key ? { ...x, ...p } : x)));

  /**
   * Mark what became of a proposed action, on screen and against the saved turn, so reopening the
   * chat tomorrow shows the same outcome rather than a Confirm button for something already done.
   */
  async function settle(key: number, status: ActionStatus, result?: string) {
    patch(key, { status, result });
    const savedId = messagesRef.current.find((x) => x.key === key)?.savedId;
    const session = sessionRef.current;
    if (savedId == null || session == null) return;
    try {
      await settleChatTurn(session, savedId, status, result);
    } catch {
      // The action itself has already happened; recording it is best-effort.
    }
  }

  async function runAction(key: number) {
    const msg = messagesRef.current.find((x) => x.key === key);
    if (!msg?.action || msg.status !== "pending" || busy) return;
    setBusy(true);
    try {
      const result = await executeAction(msg.action, { addReminder, thresholds, saveThresholds, reload });
      await settle(key, "done", result);
    } catch (e) {
      await settle(key, "failed", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Screenshots and receipts ----

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same file can be picked again
    if (!file || busy) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error("Attach a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("That image is over 8 MB.");
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await readAsDataUrl(file);
    } catch {
      toast.error("Couldn't open that image.");
      return;
    }
    const note = input.trim();
    setInput("");
    say({ role: "user", text: note, image: dataUrl }, note ? `${note} (with a screenshot)` : "Sent a screenshot to add");

    setBusy(true);
    setReading(true);
    let read: AiReceipt | null = null;
    try {
      read = await aiReceipt(dataUrl, file.type, categories);
    } catch {
      read = null;
    } finally {
      setReading(false);
      setBusy(false);
    }
    const draft = draftFrom(read, f.accounts, isoDay(new Date()));
    const receipt: ReceiptTurn = { draft, confidence: read?.confidence ?? 0, guessedCategory: !!read?.category, state: "pending" };
    if (read) {
      say({ role: "assistant", text: "", receipt, status: "pending" }, receiptSentence(draft));
    } else {
      // The card still helps: the person can type it in rather than start over on another page.
      say(
        { role: "assistant", text: "I couldn't read that image on the local model. You can fill it in here instead.", receipt, status: "pending" },
        "Couldn't read the screenshot on the local model.",
      );
    }
  }

  const editReceipt = (key: number, draft: ReceiptDraft) =>
    setMessages((m) => m.map((x) => (x.key === key && x.receipt ? { ...x, receipt: { ...x.receipt, draft } } : x)));
  const setReceiptState = (key: number, state: ReceiptState) =>
    setMessages((m) => m.map((x) => (x.key === key && x.receipt ? { ...x, receipt: { ...x.receipt, state } } : x)));

  /** Save the checked screenshot as a manual entry; the bank's alert later confirms rather than duplicates it. */
  async function addReceipt(key: number) {
    const r = messagesRef.current.find((x) => x.key === key)?.receipt;
    if (!r || r.state !== "pending") return;
    const d = r.draft;
    const amount = Number(d.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setReceiptState(key, "saving");
    try {
      await createTransaction({
        amount,
        direction: d.direction,
        merchant: d.merchant.trim() || undefined,
        category: d.category || undefined,
        occurredAt: new Date(`${d.occurredOn}T00:00:00`).toISOString(),
        accountId: d.accountId === NO_ACCOUNT ? undefined : Number(d.accountId),
        note: ["From a screenshot", d.method, d.reference ? `ref ${d.reference}` : null].filter(Boolean).join(" · "),
      });
      setReceiptState(key, "added");
      void settle(key, "done", receiptSentence(d).replace(/^Read from a screenshot/, "Added"));
      say({ role: "assistant", text: ADDED_NOTE });
      setLedgerVersion((v) => v + 1);
    } catch (e) {
      setReceiptState(key, "pending");
      toast.error(e instanceof Error ? `Couldn't add it: ${e.message}` : "Couldn't add it.");
    }
  }

  function discardReceipt(key: number) {
    setReceiptState(key, "discarded");
    void settle(key, "cancelled", "Discarded");
  }

  const fresh = messages.length <= 1;

  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] max-w-6xl gap-4">
      <ChatHistory chats={chats} openId={openId} busy={busy || opening} onOpen={openChat} onNew={newChat} onDelete={removeChat} />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <PageHeader title="Assistant" subtitle="Ask about your money, or tell Jarvis what to do — anything that changes data is shown to you first.">
          {/* The column is the way in on a wide screen; on a narrow one, the same list in a menu. */}
          <div className="flex items-center gap-1 md:hidden">
            <ChatHistoryMenu chats={chats} onOpen={openChat} />
            <Button variant="ghost" size="icon" onClick={newChat} title="New chat">
              <MessageSquarePlus className="size-5" />
            </Button>
          </div>
        </PageHeader>

        {/* The brief and the conversation scroll together, so on a phone the brief scrolls away
            instead of squeezing the chat; the composer stays put below. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {fresh && txnsLoaded && (
            <DailyBrief
              now={new Date()}
              forecast={forecast}
              week={week}
              txns={txns}
              cardIds={cardIds}
              insights={insights}
              thresholds={thresholds}
              breakdown={breakdown}
              earns={earns}
            />
          )}

          <div className="flex flex-1 shrink-0 flex-col gap-5 rounded-2xl border bg-card p-4 md:p-6">
            {messages.map((m, i) => {
              if (m.role === "user") return <UserTurn key={m.key} m={m} />;
              const prev = messages[i - 1];
              // Suggestions follow answers to questions — not greetings, confirmations or screenshots.
              const follow =
                prev?.role === "user" && !prev.image && !m.action && !m.receipt ? followUpsFor(prev.text, m.visuals) : null;
              return (
                <div key={m.key} className="flex max-w-full gap-3 md:max-w-[860px]">
                  <AiMark />
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    {m.text && (
                      <div className="text-[15px] leading-relaxed">
                        <Markdown text={m.text} />
                      </div>
                    )}
                    {m.visuals?.length ? <AssistantVisuals visuals={m.visuals} /> : null}
                    {m.action && (
                      <ActionCard
                        action={m.action}
                        status={m.status ?? "pending"}
                        result={m.result}
                        busy={busy}
                        onConfirm={() => runAction(m.key)}
                        onCancel={() => settle(m.key, "cancelled")}
                      />
                    )}
                    {m.receipt && (
                      <div className="max-w-[620px]">
                        <ReceiptCard
                          draft={m.receipt.draft}
                          onChange={(d) => editReceipt(m.key, d)}
                          confidence={m.receipt.confidence}
                          guessedCategory={m.receipt.guessedCategory}
                          state={m.receipt.state}
                          accounts={f.accounts}
                          categories={categories}
                          onAdd={() => addReceipt(m.key)}
                          onDiscard={() => discardReceipt(m.key)}
                        />
                      </div>
                    )}
                    {follow && <FollowUps set={follow} disabled={busy} onAsk={ask} />}
                  </div>
                </div>
              );
            })}

            {busy && (
              <div className="flex gap-3">
                <AiMark />
                {reading ? (
                  <ReadingReceipt />
                ) : (
                  <span className="inline-flex items-center gap-1 py-3">
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  </span>
                )}
              </div>
            )}

            {fresh && (
              <div className="flex flex-wrap gap-2 pl-12">
                {ASSISTANT_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    disabled={busy}
                    className="h-8 rounded-full border bg-card px-3 text-[13px] transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-2xl border bg-card p-2.5 shadow-sm sm:px-3.5 sm:py-3">
          <ContextChips period={period} onPeriod={setPeriod} memberName={memberChip} memberOn={memberOn} onMember={setMemberOn} />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label="Attach a screenshot or receipt"
              title="Attach a payment screenshot or receipt (PNG, JPG or WebP, up to 8 MB)"
              className="size-10 shrink-0 rounded-xl"
            >
              <Paperclip className="size-4" />
            </Button>
            <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(",")} className="hidden" onChange={onFile} />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything, or tell Jarvis what to do…"
              aria-label="Message"
              autoFocus
              disabled={busy}
              className="h-10 min-w-0 border-0 bg-transparent text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <Button type="submit" disabled={!input.trim() || busy} className="h-10 shrink-0 gap-1.5 rounded-xl px-3 font-semibold sm:px-4">
              <Send className="size-4" />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Jarvis's mark beside each answer: the app's one sign for the AI speaking. */
function AiMark() {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/12 text-primary">
      <Sparkles className="size-4" />
    </div>
  );
}

/** A question (and any attached image), on the right, with the scope it was asked in above it. */
function UserTurn({ m }: { m: Msg }) {
  return (
    <div className="flex flex-col items-end gap-1.5 self-end">
      {m.scope && <span className="text-[11px] text-muted-foreground">{m.scope}</span>}
      {m.image && <img src={m.image} alt="Attached screenshot" className="max-h-44 max-w-[180px] rounded-xl border object-cover" />}
      {m.text && (
        <div className="max-w-[min(520px,85vw)] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-[15px] break-words text-primary-foreground">
          {m.text}
        </div>
      )}
    </div>
  );
}
