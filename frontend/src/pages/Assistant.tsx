import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { answerQuery, ASSISTANT_SUGGESTIONS, type FinanceContext } from "@/lib/assistant";
import { useFinanceSummary } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    const reply = answerQuery(q, ctx);
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: reply }]);
    setInput("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Quick answers from your data. (Local for now — connects to the AI agent later.)
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border bg-card/40 p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="size-4" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                m.role === "user"
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-muted"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {messages.length <= 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ASSISTANT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-3 flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your finances…"
          autoFocus
        />
        <Button type="submit" size="icon" disabled={!input.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
