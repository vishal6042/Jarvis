import { applyRules, createRule, createTransaction } from "@/api";
import { contributeGoalApi, createGoal, getGoals } from "@/lib/api/finance";
import type { Reminder, ReminderType } from "@/lib/sample";
import { formatINR, formatDate } from "@/lib/format";

/** What the planner (ai-orchestrator /api/ai/plan) extracts from an imperative message. */
export interface PlannedAction {
  type: "add_transaction" | "add_reminder" | "set_budget" | "categorise_merchant" | "add_goal" | "contribute_goal" | "none";
  amount?: number | null;
  direction?: "DEBIT" | "CREDIT" | null;
  merchant?: string | null;
  category?: string | null;
  date?: string | null;
  title?: string | null;
  reminderType?: string | null;
  repeatMonthly?: boolean | null;
  goalName?: string | null;
  summary?: string | null;
}

export const ACTION_LABEL: Record<PlannedAction["type"], string> = {
  add_transaction: "Add a transaction",
  add_reminder: "Add a reminder",
  set_budget: "Set a monthly budget",
  categorise_merchant: "Create a category rule",
  add_goal: "Create a savings goal",
  contribute_goal: "Add to a goal",
  none: "",
};

/** Cheap gate so plain questions do not pay for a planning round-trip. */
export function isImperative(text: string): boolean {
  const q = text.trim().toLowerCase();
  if (/^(add|create|set|remind|log|record|save|mark|categori[sz]e|treat|put|contribute|budget|make|note|track|start|move|schedule|book)\b/.test(q)) return true;
  return /\bremind me\b|\bas (a )?budget\b|\bnew (goal|reminder|budget|rule)\b/.test(q);
}

const REMINDER_TYPES: ReminderType[] = ["RENT", "BILL", "EMI", "INVESTMENT", "SIP", "OTHER"];
const today = () => new Date().toISOString().slice(0, 10);

/** Key facts to show before the user confirms. */
export function describeAction(a: PlannedAction): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const amt = a.amount != null && a.amount > 0 ? formatINR(a.amount) : null;
  switch (a.type) {
    case "add_transaction":
      rows.push({ label: "Amount", value: amt ?? "missing" });
      rows.push({ label: "Type", value: a.direction === "CREDIT" ? "Money in" : "Money out" });
      if (a.merchant) rows.push({ label: "Merchant", value: a.merchant });
      if (a.category) rows.push({ label: "Category", value: a.category });
      rows.push({ label: "Date", value: formatDate(a.date || today()) });
      break;
    case "add_reminder":
      rows.push({ label: "Title", value: a.title || a.merchant || "Reminder" });
      rows.push({ label: "Due", value: formatDate(a.date || today()) + (a.repeatMonthly ? " · every month" : "") });
      if (amt) rows.push({ label: "Amount", value: amt });
      rows.push({ label: "Type", value: (a.reminderType || "OTHER").toString() });
      break;
    case "set_budget":
      rows.push({ label: "Category", value: a.category || "missing" });
      rows.push({ label: "Monthly limit", value: amt ?? "missing" });
      break;
    case "categorise_merchant":
      rows.push({ label: "Merchant contains", value: a.merchant || "missing" });
      rows.push({ label: "Category", value: a.category || "missing" });
      rows.push({ label: "Applies to", value: "future alerts and existing uncategorised rows" });
      break;
    case "add_goal":
      rows.push({ label: "Goal", value: a.title || a.goalName || "missing" });
      rows.push({ label: "Target", value: amt ?? "missing" });
      if (a.date) rows.push({ label: "By", value: formatDate(a.date) });
      break;
    case "contribute_goal":
      rows.push({ label: "Goal", value: a.goalName || a.title || "missing" });
      rows.push({ label: "Amount", value: amt ?? "missing" });
      break;
    default:
      break;
  }
  return rows;
}

/** Why the action cannot run yet, or null when it is complete enough. */
export function validateAction(a: PlannedAction): string | null {
  const needAmount = ["add_transaction", "set_budget", "add_goal", "contribute_goal"].includes(a.type);
  if (needAmount && !(a.amount != null && a.amount > 0)) return "I could not find an amount. Tell me the amount and I will try again.";
  if (a.type === "set_budget" && !a.category) return "Which category should this budget apply to?";
  if (a.type === "categorise_merchant" && (!a.merchant || !a.category)) return "I need both a merchant and a category for a rule.";
  if (a.type === "add_goal" && !(a.title || a.goalName)) return "What should the goal be called?";
  if (a.type === "contribute_goal" && !(a.goalName || a.title)) return "Which goal should this go to?";
  return null;
}

export interface ActionDeps {
  addReminder: (r: Omit<Reminder, "id">) => unknown;
  thresholds: Record<string, number>;
  saveThresholds: (map: Record<string, number>) => Promise<unknown>;
  reload: () => unknown;
}

/** Perform a confirmed action against the real APIs. Returns a one-line result for the chat. */
export async function executeAction(a: PlannedAction, deps: ActionDeps): Promise<string> {
  const amount = a.amount ?? 0;
  switch (a.type) {
    case "add_transaction": {
      const t = await createTransaction({
        amount,
        direction: a.direction === "CREDIT" ? "CREDIT" : "DEBIT",
        merchant: a.merchant?.trim() || undefined,
        category: a.category?.trim() || undefined,
        occurredAt: new Date(`${a.date || today()}T12:00:00`).toISOString(),
      });
      return `Added ${formatINR(t.amount)} ${t.direction === "CREDIT" ? "income" : "expense"}${t.merchant ? ` at ${t.merchant}` : ""} on ${formatDate(t.occurredAt)}.`;
    }
    case "add_reminder": {
      const type = REMINDER_TYPES.includes((a.reminderType || "").toUpperCase() as ReminderType) ? ((a.reminderType as string).toUpperCase() as ReminderType) : "OTHER";
      await deps.addReminder({
        title: a.title || a.merchant || "Reminder",
        date: a.date || today(),
        type,
        amount: amount > 0 ? amount : undefined,
        repeat: a.repeatMonthly ? "monthly" : "none",
      });
      return `Reminder “${a.title || a.merchant || "Reminder"}” set for ${formatDate(a.date || today())}${a.repeatMonthly ? ", repeating monthly" : ""}.`;
    }
    case "set_budget": {
      const cat = a.category!.trim();
      await deps.saveThresholds({ ...deps.thresholds, [cat]: Math.round(amount) });
      return `Monthly budget for ${cat} set to ${formatINR(Math.round(amount))}.`;
    }
    case "categorise_merchant": {
      await createRule(a.merchant!.trim(), a.category!.trim());
      const changed = await applyRules(true);
      deps.reload();
      return `Rule saved: merchant contains “${a.merchant}” → ${a.category}. ${changed} existing transaction${changed === 1 ? "" : "s"} re-categorised.`;
    }
    case "add_goal": {
      const name = (a.title || a.goalName)!.trim();
      await createGoal({ name, targetAmount: Math.round(amount), savedAmount: 0, targetDate: a.date || null });
      return `Goal “${name}” created with a target of ${formatINR(Math.round(amount))}${a.date ? ` by ${formatDate(a.date)}` : ""}.`;
    }
    case "contribute_goal": {
      const wanted = (a.goalName || a.title)!.trim().toLowerCase();
      const goals = await getGoals();
      const goal = goals.find((g) => g.name.toLowerCase() === wanted) ?? goals.find((g) => g.name.toLowerCase().includes(wanted) || wanted.includes(g.name.toLowerCase()));
      if (!goal) throw new Error(`No goal matches “${a.goalName || a.title}”. Your goals: ${goals.map((g) => g.name).join(", ") || "none yet"}.`);
      await contributeGoalApi(goal.id, Math.round(amount));
      return `Added ${formatINR(Math.round(amount))} to “${goal.name}”.`;
    }
    default:
      throw new Error("Nothing to do.");
  }
}
