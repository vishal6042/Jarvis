import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface PlanStep {
  id: string;
  label: ReactNode;
  detail?: ReactNode;
  run: () => Promise<void>;
}

export interface StepsRequest {
  title: string;
  description?: string;
  steps: PlanStep[];
}

type StepStatus = "idle" | "running" | "done" | "failed";

/**
 * The confirmation every data-changing suggestion on the Goals page goes through. Jarvis proposes;
 * the user sees each change as its own line, can untick any of them, and nothing is written until
 * they confirm. Steps then run one after another, so a later step never runs on top of a failed one.
 */
export default function StepsDialog({
  request,
  onClose,
  onDone,
}: {
  request: StepsRequest | null;
  onClose: () => void;
  /** Called once the confirmed steps have all run, so the page can reload what they changed. */
  onDone: () => void;
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, StepStatus>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setChosen(new Set(request?.steps.map((s) => s.id) ?? []));
    setStatus({});
    setBusy(false);
  }, [request]);

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function confirm() {
    if (!request) return;
    setBusy(true);
    for (const step of request.steps) {
      if (!chosen.has(step.id) || status[step.id] === "done") continue;
      setStatus((s) => ({ ...s, [step.id]: "running" }));
      try {
        await step.run();
        setStatus((s) => ({ ...s, [step.id]: "done" }));
      } catch {
        setStatus((s) => ({ ...s, [step.id]: "failed" }));
        setBusy(false);
        onDone();
        return;
      }
    }
    setBusy(false);
    onDone();
    onClose();
  }

  const count = request?.steps.filter((s) => chosen.has(s.id) && status[s.id] !== "done").length ?? 0;
  const failed = request?.steps.some((s) => status[s.id] === "failed") ?? false;

  return (
    <Dialog open={request != null} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          {request?.description && <DialogDescription>{request.description}</DialogDescription>}
        </DialogHeader>
        <ul className="space-y-2">
          {request?.steps.map((s) => {
            const st = status[s.id] ?? "idle";
            return (
              <li key={s.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm has-[:disabled]:cursor-default">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    checked={chosen.has(s.id)}
                    disabled={busy || st === "done"}
                    onChange={() => toggle(s.id)}
                  />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block font-medium">{s.label}</span>
                    {s.detail && <span className="block text-[13px] text-muted-foreground">{s.detail}</span>}
                    {st === "failed" && (
                      <span className="block text-[13px] text-rose-600 dark:text-rose-400">That did not go through. Try again.</span>
                    )}
                  </span>
                  {st === "running" && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
                  {st === "done" && <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                  {st === "failed" && <X className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />}
                </label>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {failed ? "Close" : "Cancel"}
          </Button>
          <Button onClick={confirm} disabled={busy || count === 0}>
            {busy ? "Working…" : count === 1 ? "Confirm 1 step" : `Confirm ${count} steps`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
