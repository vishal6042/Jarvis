import { AlertCircle, Check, Wand2, X } from "lucide-react";
import { ACTION_LABEL, describeAction, type PlannedAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export type ActionStatus = "pending" | "done" | "cancelled" | "failed";

/** A proposed action: facts to check, then Confirm / Cancel. Nothing runs until Confirm. */
export default function ActionCard({
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
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: `color-mix(in oklab, ${tone} 45%, transparent)` }}>
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold" style={{ backgroundColor: `color-mix(in oklab, ${tone} 12%, transparent)`, color: tone }}>
        {status === "done" ? <Check className="size-3.5" /> : status === "failed" ? <AlertCircle className="size-3.5" /> : status === "cancelled" ? <X className="size-3.5" /> : <Wand2 className="size-3.5" />}
        {status === "pending" ? ACTION_LABEL[action.type] : status === "done" ? "Done" : status === "failed" ? "Could not do that" : "Cancelled"}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 py-2 text-xs">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-medium break-words">{r.value}</span>
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
