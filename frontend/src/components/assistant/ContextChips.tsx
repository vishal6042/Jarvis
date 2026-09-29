import { ChevronDown, Plus, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/*
 * What a question is about, above the composer: the period and whose money. The model otherwise
 * guesses both from the wording, and "how much on food?" means this month, for the person looking,
 * far more often than not. Either chip can be taken off to ask without it.
 */

export type ChatPeriod = "this-month" | "last-month" | "this-year";

export const PERIOD_LABEL: Record<ChatPeriod, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
};

/** "(About this month, for Priya) " — the short scope put in front of the question sent to the model. */
export function scopePrefix(period: ChatPeriod | null, member: string | null): string {
  const parts = [period ? `About ${PERIOD_LABEL[period].toLowerCase()}` : null, member ? `for ${member}` : null].filter(Boolean);
  return parts.length ? `(${parts.join(", ")}) ` : "";
}

const chip = "inline-flex h-7 items-center gap-1 rounded-full bg-primary/10 pl-2.5 text-xs font-semibold text-primary";
const off = "inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary";

/** The two removable scope chips; a removed one comes back as a dashed "+" chip. */
export default function ContextChips({
  period,
  onPeriod,
  memberName,
  memberOn,
  onMember,
}: {
  period: ChatPeriod | null;
  onPeriod: (p: ChatPeriod | null) => void;
  memberName: string;
  memberOn: boolean;
  onMember: (on: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {period ? (
        <span className={chip}>
          <DropdownMenu>
            <DropdownMenuTrigger render={<button type="button" className="inline-flex items-center gap-0.5" title="Change the period" />}>
              {PERIOD_LABEL[period]} <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {(Object.keys(PERIOD_LABEL) as ChatPeriod[]).map((p) => (
                <DropdownMenuItem key={p} onClick={() => onPeriod(p)}>
                  {PERIOD_LABEL[p]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" onClick={() => onPeriod(null)} title="Ask without a period" className="rounded-full p-1 hover:bg-primary/15">
            <X className="size-3" />
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => onPeriod("this-month")} className={off}>
          <Plus className="size-3" /> Period
        </button>
      )}
      {memberOn ? (
        <span className={chip}>
          {memberName}
          <button type="button" onClick={() => onMember(false)} title="Ask without naming a member" className="rounded-full p-1 hover:bg-primary/15">
            <X className="size-3" />
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => onMember(true)} className={off}>
          <Plus className="size-3" /> {memberName}
        </button>
      )}
    </div>
  );
}
