import { History, Plus, Trash2 } from "lucide-react";
import type { ChatSummary } from "@/api";
import { isoDay } from "@/lib/forecast";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/*
 * Past conversations, newest first, split into today's and the rest. Clicking one reopens it and
 * the chat carries on in it, so a question asked tomorrow lands in the same thread as the one it
 * follows from.
 */

const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Today's chats and the rest, by the person's own calendar day. */
function grouped(chats: ChatSummary[]): { label: string; items: ChatSummary[] }[] {
  const today = isoDay(new Date());
  const isToday = (c: ChatSummary) => isoDay(new Date(c.updatedAt)) === today;
  return [
    { label: "Today", items: chats.filter(isToday) },
    { label: "Earlier", items: chats.filter((c) => !isToday(c)) },
  ].filter((g) => g.items.length > 0);
}

/** The left column on a wide screen: New chat, the grouped list, and where the AI runs. */
export default function ChatHistory({
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
    <aside className="hidden w-64 shrink-0 flex-col gap-2 rounded-2xl border bg-card p-3 md:flex">
      <Button onClick={onNew} className="h-10 gap-1.5 rounded-xl font-semibold">
        <Plus className="size-4" /> New chat
      </Button>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {chats.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Conversations are saved here once you ask something.</p>
        ) : (
          grouped(chats).map((g) => (
            <div key={g.label} className="space-y-0.5 pt-2">
              <div className="px-2 pb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{g.label}</div>
              {g.items.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg pr-1 transition-colors",
                    c.id === openId ? "bg-primary/10 font-medium" : "hover:bg-muted",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    disabled={busy}
                    title={`${c.messages} ${c.messages === 1 ? "message" : "messages"} · ${shortDay(c.updatedAt)}`}
                    className="flex min-w-0 flex-1 items-baseline gap-2 px-2.5 py-2 text-left text-sm disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    {g.label === "Earlier" && <span className="shrink-0 text-[11px] text-muted-foreground">{shortDay(c.updatedAt)}</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    title="Delete conversation"
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">Runs on your PC · Qwen 3.5 · nothing leaves home</p>
    </aside>
  );
}

/** The same list on a narrow screen, where there is no room for the column: a menu in the header. */
export function ChatHistoryMenu({ chats, onOpen }: { chats: ChatSummary[]; onOpen: (id: number) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" title="Past conversations" />}>
        <History className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {chats.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">No saved conversations yet.</div>
        ) : (
          grouped(chats.slice(0, 15)).map((g) => (
            <DropdownMenuGroup key={g.label}>
              <DropdownMenuLabel className="text-[11px] tracking-[0.06em] uppercase">{g.label}</DropdownMenuLabel>
              {g.items.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => onOpen(c.id)}>
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {g.label === "Earlier" && <span className="shrink-0 text-[10px] text-muted-foreground">{shortDay(c.updatedAt)}</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))
        )}
        <div className="px-2 pt-1 pb-1.5 text-[10px] text-muted-foreground">Runs on your PC · nothing leaves home</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
