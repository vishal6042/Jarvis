import { useState, type ReactNode } from "react";
import { Check, Copy, Link2, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { applyRules, createRule, saveMerchantAliases, setTransactionCategory, updateTransaction } from "@/api";
import type { CreateTransactionRequest, Transaction } from "@/types";
import { formatINR, merchantLabel } from "@/lib/format";
import StatusChip from "@/components/page/StatusChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/transactions/dialogs";
import { CONFIDENT, type CategoryFix, type NameFix, type QueueItems } from "@/components/transactions/queue";
import type { SuggestProgress } from "@/components/transactions/suggestions";
import { isUncategorised, shortDate } from "@/components/transactions/shared";

const CHOOSE = "__choose";
/** Quick answers for money sent to a person; the category is created if it does not exist yet. */
const PERSON_CATEGORIES = ["Family support", "Rent", "Loan repaid"];

const when = (rows: Transaction[]) => (rows.length === 1 ? shortDate(rows[0]) : `${rows.length} payments`);
const total = (rows: Transaction[]) => rows.reduce((s, t) => s + t.amount, 0);

/**
 * The review queue: everything on the page that wants a person's eye, grouped by what is wrong —
 * a category the model disagrees with, a merchant it can name better, money to a person filed as
 * "Transfers", rows with no category or account, and probable duplicates. The model's part runs
 * only when asked ("Get suggestions"), because it is slow; nothing changes until a button is
 * pressed, and every change goes through the same APIs the rest of the page uses.
 */
export default function ReviewQueue({
  items,
  categories,
  admin,
  running,
  progress,
  error,
  note,
  hasSuggestions,
  onGetSuggestions,
  onCancelSuggestions,
  onClose,
  onOpen,
  onEdit,
  onDelete,
  onPatched,
  onReload,
  onDismiss,
  onCleanup,
}: {
  items: QueueItems;
  categories: { value: string; label: string }[];
  admin: boolean;
  running: boolean;
  progress: SuggestProgress | null;
  error: string | null;
  note: string | null;
  hasSuggestions: boolean;
  onGetSuggestions: () => void;
  onCancelSuggestions: () => void;
  onClose?: () => void;
  onOpen: (t: Transaction) => void;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
  onPatched: (rows: Transaction[]) => void;
  onReload: () => void;
  onDismiss: (keys: string[]) => void;
  onCleanup: () => void;
}) {
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<string | null>(null);
  const confidentCount = items.confident.categories.length + items.confident.names.length;

  /** Run one change with its button disabled; a failure is reported, not thrown. */
  async function act(key: string, fn: () => Promise<void>) {
    setBusy((b) => new Set(b).add(key));
    setFailed(null);
    try {
      await fn();
    } catch {
      setFailed("That change did not save. Nothing else was touched.");
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(key);
        return n;
      });
    }
  }

  const setCategory = async (ids: number[], category: string) => {
    const saved = await Promise.all(ids.map((id) => setTransactionCategory(id, category)));
    onPatched(saved);
  };

  const acceptCategory = (fix: CategoryFix, category: string, always: boolean) =>
    act(fix.key, async () => {
      await setCategory(
        fix.rows.map((r) => r.id),
        category,
      );
      if (always && fix.raw) {
        // The same rule the Rules dialog makes: future alerts, and existing uncategorised rows.
        await createRule(fix.raw, category);
        await applyRules(true);
        onReload();
      }
    });

  const saveName = (fix: NameFix, name: string) =>
    act(fix.key, async () => {
      // Carry the rows' own category into the alias when they agree on a real one, so future
      // alerts from this merchant land in the category already chosen for it.
      const cats = new Set(fix.rows.map((r) => r.category ?? ""));
      const only = cats.size === 1 ? [...cats][0] : "";
      await saveMerchantAliases([
        { raw: fix.raw, canonical: name.trim(), category: only && only !== "Uncategorized" ? only : null, source: name === fix.name ? "ai" : "user" },
      ]);
      onReload();
    });

  const markOwnAccount = (t: Transaction) =>
    act(`person:${t.id}`, async () => {
      // The update replaces the row, so it carries every field as it is plus the transfer flag.
      const req: CreateTransactionRequest & { transfer: boolean } = {
        amount: t.amount,
        direction: t.direction,
        merchant: t.merchant ?? undefined,
        category: t.category ?? undefined,
        occurredAt: t.occurredAt,
        accountId: t.accountId ?? undefined,
        note: t.note ?? undefined,
        transfer: true,
      };
      onPatched([await updateTransaction(t.id, req)]);
    });

  async function acceptAll() {
    await act("all", async () => {
      for (const c of items.confident.categories) await setCategory(c.ids, c.category);
      if (items.confident.names.length > 0) {
        await saveMerchantAliases(items.confident.names.map((n) => ({ raw: n.raw, canonical: n.name, category: null, source: "ai" })));
        onReload();
      }
    });
  }

  const empty = items.count === 0;

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-col gap-2 border-b p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-[17px] font-semibold">Review queue</h2>
          {items.count > 0 && <StatusChip tone="watch">{items.count}</StatusChip>}
          <div className="flex-1" />
          {onClose && (
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close the review queue">
              <X className="size-4" />
            </Button>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground">
          {hasSuggestions
            ? "Jarvis has read these merchants. Accept what looks right; a rule teaches it for next time."
            : "Rows without a category or account, money to people filed as Transfers, and likely duplicates. Jarvis can also check the categories in view."}
        </p>
        {running && progress ? (
          <div className="space-y-2 rounded-xl bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-[13px]">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span className="flex-1">
                Reading {progress.done} of {progress.total} merchants…
              </span>
              <Button variant="ghost" size="sm" onClick={onCancelSuggestions}>
                Stop
              </Button>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-primary/15">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">The model runs on your PC; the first batch is slow while it wakes up.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant={confidentCount > 0 ? "outline" : "default"} className="h-10 flex-1 gap-2" onClick={onGetSuggestions}>
              <Sparkles className="size-4" /> {hasSuggestions ? "Check again" : "Get suggestions"}
            </Button>
            {confidentCount > 0 && (
              <Button
                className="h-10 flex-1 gap-2"
                onClick={acceptAll}
                disabled={busy.has("all")}
                title={`Accepts every suggestion Jarvis is at least ${Math.round(CONFIDENT * 100)}% sure of`}
              >
                <Check className="size-4" /> Accept all confident ({confidentCount})
              </Button>
            )}
          </div>
        )}
        {note && !running && <p className="text-xs text-muted-foreground">{note}</p>}
        {error && <p className="text-xs text-[color:var(--danger)]">{error}</p>}
        {failed && <p className="text-xs text-[color:var(--danger)]">{failed}</p>}
      </div>

      {empty && (
        <p className="p-5 text-sm text-muted-foreground">
          Nothing needs a look in this period{hasSuggestions ? ", and Jarvis agrees with the categories in view." : "."}
        </p>
      )}

      {items.wrong.length > 0 && (
        <Group title="Probably the wrong category">
          {items.wrong.map((fix) => (
            <WrongCategory
              key={fix.key}
              fix={fix}
              categories={categories}
              busy={busy.has(fix.key)}
              onAccept={(cat, always) => acceptCategory(fix, cat, always)}
              onKeep={() => onDismiss([fix.key])}
              onOpen={() => onOpen(fix.rows[0])}
            />
          ))}
        </Group>
      )}

      {admin && items.names.length > 0 && (
        <Group title="Name it properly" action={<GroupLink onClick={onCleanup}>All merchants</GroupLink>}>
          {items.names.map((fix) => (
            <NameIt key={fix.key} fix={fix} busy={busy.has(fix.key)} onUse={(name) => saveName(fix, name)} onKeep={() => onDismiss([fix.key])} />
          ))}
        </Group>
      )}

      {items.people.length > 0 && (
        <Group title="Paid to a person">
          {items.people.map((t) => {
            const key = `person:${t.id}`;
            return (
              <Item key={t.id} title={`${merchantLabel(t)} · ${formatINR(t.amount)}`} aside={shortDate(t)} onOpen={() => onOpen(t)}>
                <p className="text-[13px] text-muted-foreground">Filed as “Transfers”, which reads like your own money moving. What was it?</p>
                <div className="flex flex-wrap gap-2">
                  {PERSON_CATEGORIES.map((c) => (
                    <Button key={c} variant="outline" size="sm" className="h-8" disabled={busy.has(key)} onClick={() => act(key, () => setCategory([t.id], c))}>
                      {c}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" className="h-8" disabled={busy.has(key)} onClick={() => markOwnAccount(t)} title="Marks it as a transfer, so it leaves your spend">
                    My own account
                  </Button>
                </div>
              </Item>
            );
          })}
        </Group>
      )}

      {items.loose.length > 0 && (
        <Group title="No category or account">
          {items.loose.map(({ txn: t, suggested, reason, confidence }) => {
            const key = `loose:${t.id}`;
            const uncategorised = isUncategorised(t);
            return (
              <Item key={t.id} title={`${merchantLabel(t)} · ${formatINR(t.amount)}`} aside={shortDate(t)} onOpen={() => onOpen(t)}>
                {suggested && (
                  <p className="text-[13px]">
                    <Sparkles className="mr-1 inline size-3.5 text-primary" />
                    Looks like <strong>{suggested}</strong>
                    {reason ? `. ${reason}` : ""}
                    {confidence < 0.6 && <span className="text-muted-foreground"> · unsure</span>}
                  </p>
                )}
                {!uncategorised && t.accountId == null && (
                  <p className="text-[13px] text-muted-foreground">Not linked to an account, so it is left out of that account's activity.</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {uncategorised && suggested && (
                    <Button size="sm" variant="secondary" className="h-8" disabled={busy.has(key)} onClick={() => act(key, () => setCategory([t.id], suggested))}>
                      Accept
                    </Button>
                  )}
                  {uncategorised && (
                    <FilterSelect
                      value={CHOOSE}
                      onChange={(v) => v !== CHOOSE && act(key, () => setCategory([t.id], v))}
                      items={[{ value: CHOOSE, label: suggested ? "Something else…" : "Pick a category…" }, ...categories]}
                      width="h-8 w-[170px]"
                      label="Category"
                    />
                  )}
                  {t.accountId == null && (
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => onEdit(t)}>
                      <Link2 className="size-3.5" /> Link account
                    </Button>
                  )}
                </div>
              </Item>
            );
          })}
        </Group>
      )}

      {items.dups.length > 0 && (
        <Group title="Probable duplicates">
          <p className="px-5 pb-2 text-xs text-muted-foreground">
            Same day, amount and direction — usually a statement row and an SMS row for one purchase. Delete the one you don't want.
          </p>
          {items.dups.map((pair) => (
            <div key={pair.map((t) => t.id).join("-")} className="mx-5 mb-3 rounded-xl border p-2">
              {pair.map((t) => (
                <div key={t.id} className="flex items-center gap-2 py-1 text-sm">
                  <Copy className="size-3.5 shrink-0 text-muted-foreground" />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(t)}>
                    <div className="truncate font-medium">{merchantLabel(t)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {shortDate(t)} · {t.category ?? "Uncategorized"} · {t.accountName ?? "no account"} · {t.source}
                    </div>
                  </button>
                  <span className="font-mono text-[13px] tabular-nums">{formatINR(t.amount)}</span>
                  <Button variant="ghost" size="icon-sm" className="text-rose-500" onClick={() => onDelete(t)} aria-label="Delete this copy">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ))}
        </Group>
      )}
    </div>
  );
}

/** A labelled section of the queue. */
function Group({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b py-1 last:border-b-0">
      <div className="flex items-baseline px-5 pt-3 pb-1">
        <h3 className="flex-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function GroupLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-medium text-primary hover:underline">
      {children}
    </button>
  );
}

/** One thing to decide: what it is, when, a line of explanation and the buttons. */
function Item({ title, aside, onOpen, children }: { title: string; aside?: string; onOpen?: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/50 px-5 py-3 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline">
          {title}
        </button>
        {aside && <span className="shrink-0 text-xs text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/** "Food → Entertainment. PVR is a cinema chain." with Accept, Keep and "always for …". */
function WrongCategory({
  fix,
  categories,
  busy,
  onAccept,
  onKeep,
  onOpen,
}: {
  fix: CategoryFix;
  categories: { value: string; label: string }[];
  busy: boolean;
  onAccept: (category: string, always: boolean) => void;
  onKeep: () => void;
  onOpen: () => void;
}) {
  const [always, setAlways] = useState(false);
  return (
    <Item title={`${fix.label} · ${formatINR(total(fix.rows))}`} aside={when(fix.rows)} onOpen={onOpen}>
      <p className="text-[13px]">
        {fix.from} → <strong>{fix.to}</strong>
        {fix.reason ? `. ${fix.reason}` : ""}
        {fix.confidence < 0.6 && <span className="text-muted-foreground"> · unsure</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" className="h-8" disabled={busy} onClick={() => onAccept(fix.to, always)}>
          Accept
        </Button>
        <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={onKeep}>
          Keep {fix.from}
        </Button>
        <FilterSelect
          value={CHOOSE}
          onChange={(v) => v !== CHOOSE && onAccept(v, always)}
          items={[{ value: CHOOSE, label: "Choose…" }, ...categories]}
          width="h-8 w-[130px]"
          label="Choose a category"
        />
        {fix.raw && (
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" className="size-4 accent-primary" checked={always} onChange={(e) => setAlways(e.target.checked)} />
            always for {fix.label}
          </label>
        )}
      </div>
    </Item>
  );
}

/** "Show as Innovativ Retail?" with the model's name, or one typed by hand. */
function NameIt({ fix, busy, onUse, onKeep }: { fix: NameFix; busy: boolean; onUse: (name: string) => void; onKeep: () => void }) {
  const [typing, setTyping] = useState(false);
  const [own, setOwn] = useState(fix.name);
  const account = fix.rows[0]?.accountName;
  return (
    <Item title={`${fix.current} · ${fix.rows.length} payment${fix.rows.length === 1 ? "" : "s"}`} aside={account ?? undefined}>
      <p className="text-[13px]">
        Show as <strong>{fix.name}</strong>
        {fix.reason ? `? ${fix.reason}` : "?"}
      </p>
      {typing ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (own.trim()) onUse(own);
          }}
        >
          <Input value={own} onChange={(e) => setOwn(e.target.value)} className="h-8 min-w-0 flex-1" aria-label="Merchant name" autoFocus />
          <Button type="submit" size="sm" className="h-8" disabled={busy || !own.trim()}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setTyping(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" className="h-8" disabled={busy} onClick={() => onUse(fix.name)}>
            Use this name
          </Button>
          <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => setTyping(true)}>
            Type my own
          </Button>
          <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={onKeep}>
            Leave it
          </Button>
        </div>
      )}
    </Item>
  );
}
