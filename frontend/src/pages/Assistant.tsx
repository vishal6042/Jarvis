import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { answerQuery, ASSISTANT_SUGGESTIONS, type FinanceContext } from "@/lib/assistant";
import { useFinanceSummary } from "@/lib/finance";
import { aiChat } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Markdown from "@/components/Markdown";
import CardArt from "@/components/CardArt";

interface Msg {
  role: "user" | "assistant";
  text: string;
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

  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Hi! I'm your finance assistant. Ask me about your savings, spending, income, loans or investments.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      // Real backend agent (ai-orchestrator → Ollama, calling expense analytics tools).
      const answer = await aiChat(q);
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

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-5xl flex-col">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-chart-1 text-primary-foreground shadow-lg shadow-primary/30 ring-1 ring-white/15">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Powered by your local AI agent — falls back to a quick on-device answer if it's offline.
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
