import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const PAGES: { label: string; to: string; keywords: string }[] = [
  { label: "Dashboard", to: "/dashboard", keywords: "home overview pulse" },
  { label: "Analytics", to: "/analytics", keywords: "spending categories merchants trends" },
  { label: "Transactions", to: "/transactions", keywords: "list search filter review rules" },
  { label: "Review uncategorised transactions", to: "/transactions?review=1", keywords: "uncategorized unlinked duplicates" },
  { label: "Accounts & Cards", to: "/accounts", keywords: "bank card credit best card rewards" },
  { label: "Import statements", to: "/import", keywords: "upload pdf csv statement" },
  { label: "Investments", to: "/investments", keywords: "rd fd mutual fund sip" },
  { label: "Loans", to: "/loans", keywords: "emi home loan outstanding" },
  { label: "Goals", to: "/goals", keywords: "savings targets forecast what-if" },
  { label: "Calendar", to: "/calendar", keywords: "reminders bills due" },
  { label: "Assistant", to: "/assistant", keywords: "jarvis chat ask" },
  { label: "Settings", to: "/settings", keywords: "thresholds budgets reserve devices" },
  { label: "Profile", to: "/profile", keywords: "password family members" },
];

const ASKS = [
  "How much can I spend this month?",
  "Can I afford ₹1 lakh next month?",
  "What bills are due this week?",
  "Why did I spend more this month?",
  "Which card should I use for groceries?",
  "Find unnecessary expenses",
];

/**
 * Ctrl+K / Cmd+K command bar: jump to a page, or send anything else to Jarvis. Mounted once in the
 * shell; `open`/`onOpenChange` are controlled so the header button can open it too.
 */
export default function CommandBar({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
    }
  }, [open]);

  const needle = q.trim().toLowerCase();
  const pages = useMemo(
    () => (needle ? PAGES.filter((p) => `${p.label} ${p.keywords}`.toLowerCase().includes(needle)) : PAGES.slice(0, 6)),
    [needle],
  );
  const asks = needle ? [q.trim()] : ASKS;
  const items: { kind: "page" | "ask"; label: string; to?: string }[] = [
    ...pages.map((p) => ({ kind: "page" as const, label: p.label, to: p.to })),
    ...asks.map((a) => ({ kind: "ask" as const, label: a })),
  ];

  const run = (it: (typeof items)[number]) => {
    onOpenChange(false);
    if (it.kind === "page" && it.to) navigate(it.to);
    else navigate(`/assistant?q=${encodeURIComponent(it.label)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[18%] translate-y-0 gap-0 p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Ask Jarvis or jump to a page</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Sparkles className="size-4 shrink-0 text-primary jarvis-pulse" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(items.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter" && items[cursor]) {
                e.preventDefault();
                run(items[cursor]);
              }
            }}
            placeholder="Ask Jarvis anything, or type a page name…"
            className="h-12 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <kbd className="hidden rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {items.map((it, i) => (
            <Fragment key={`${it.kind}-${it.label}`}>
              {(i === 0 || items[i - 1].kind !== it.kind) && (
                <p className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase first:pt-1">
                  {it.kind === "page" ? "Go to" : "Ask Jarvis"}
                </p>
              )}
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => run(it)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === cursor ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:bg-accent"}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {it.kind === "ask" && <Sparkles className="size-3.5 shrink-0 text-primary" />}
                  <span className="truncate">{it.kind === "ask" ? `Ask Jarvis: “${it.label}”` : it.label}</span>
                </span>
                <ArrowRight className="size-3.5 shrink-0 opacity-60" />
              </button>
            </Fragment>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
