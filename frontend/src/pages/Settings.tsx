import { useEffect, useMemo, useState } from "react";
import { Check, Info, ShieldCheck, Smartphone, SlidersHorizontal, Trash2, Users, Wand2 } from "lucide-react";
import { useReserve } from "@/lib/prefs";
import HouseholdAccounts from "@/components/HouseholdAccounts";
import PageHeader from "@/components/page/PageHeader";
import Panel from "@/components/page/Panel";
import StatusChip from "@/components/page/StatusChip";
import { budgetHistory, LOOKBACK } from "@/components/pages/budgetSuggestions";
import { useSession } from "@/lib/session";
import { apiBase, forgetDevice, listAccounts, listDevices, listTransactions, type ConnectedDevice } from "@/api";
import type { Transaction } from "@/types";
import { CATEGORIES } from "@/lib/sample";
import { useThresholds } from "@/lib/store";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** "just now", "5 min ago", "3 h ago", "2 d ago" — or "never". */
function relative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

const CAT_COLORS = ["#10b981", "#8b5cf6", "#3b82f6", "#f59e0b", "#ec4899", "#14b8a6", "#ef4444", "#a855f7"];

type SectionId = "budgets" | "reserve" | "devices" | "household" | "about";
const SECTIONS: { id: SectionId; label: string; icon: typeof Info; adminOnly?: boolean }[] = [
  { id: "budgets", label: "Budgets", icon: SlidersHorizontal },
  { id: "reserve", label: "Emergency reserve", icon: ShieldCheck },
  { id: "devices", label: "Connected devices", icon: Smartphone },
  { id: "household", label: "Household sign-ins", icon: Users, adminOnly: true },
  { id: "about", label: "About", icon: Info },
];

/**
 * The section in view, for the menu's highlight: the last section whose top has scrolled past the
 * sticky app header. Window scroll, because the app shell scrolls the page rather than a pane.
 */
function useSectionInView(ids: SectionId[]): SectionId {
  const [active, setActive] = useState<SectionId>(ids[0]);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let current = ids[0];
        for (const id of ids) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= 120) current = id;
        }
        // At the very bottom the last short section may never reach the top; it is the one in view.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = ids[ids.length - 1];
        setActive(current);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [ids]);
  return active;
}

/**
 * Settings as sections with a menu: budgets (with suggestions from your own spending), the
 * emergency reserve, the phones forwarding SMS, household sign-ins for the administrator, and
 * which build this is. Every section keeps its own save, as before: budgets save together to
 * the backend, the reserve saves on its own in this browser.
 */
export default function Settings() {
  const { me } = useSession();
  // Thresholds are a household budget, so only the administrator can move them.
  const admin = me?.admin ?? false;
  const { items, saveAll } = useThresholds();
  const [draft, setDraft] = useState<Record<string, number>>(items);
  const [saved, setSaved] = useState(false);

  // Thresholds load from the backend after mount — sync the draft when they arrive.
  useEffect(() => {
    setDraft(items);
  }, [items]);

  // The ledger and which accounts are cards, for spend by the same rule Analytics uses: this
  // month so far next to each budget, and the last complete months for the suggestions.
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [cardIds, setCardIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    let alive = true;
    listTransactions(0, 5000)
      .then((t) => alive && setTxns(t))
      .catch(() => alive && setTxns([]));
    listAccounts()
      .then((a) => alive && setCardIds(new Set(a.filter((x) => x.type !== "SAVINGS").map((x) => x.id))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const history = useMemo(() => (txns ? budgetHistory(txns, cardIds) : null), [txns, cardIds]);

  // Phones running the Jarvis Sync app (they heartbeat on every sync / dashboard refresh).
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const loadDevices = () => listDevices().then(setDevices).catch(() => setDevices([]));
  useEffect(() => {
    loadDevices();
    const t = setInterval(loadDevices, 60_000);
    return () => clearInterval(t);
  }, []);

  const [reserve, setReserve] = useReserve();
  const [reserveDraft, setReserveDraft] = useState<string>(String(reserve));
  useEffect(() => setReserveDraft(String(reserve)), [reserve]);

  // The fixed list, plus any category already given a budget; then, apart, the ones with spend
  // and no budget yet, so they can be given one.
  const budgeted = useMemo(() => {
    const extra = Object.keys(items).filter((k) => (items[k] ?? 0) > 0 && !CATEGORIES.includes(k));
    return [...CATEGORIES, ...extra.sort()];
  }, [items]);
  const unbudgeted = useMemo(
    () =>
      history
        ? [...history.spent]
            .filter((c) => !budgeted.includes(c))
            .sort((a, b) => (history.thisMonth.get(b) ?? 0) - (history.thisMonth.get(a) ?? 0) || a.localeCompare(b))
        : [],
    [history, budgeted],
  );
  const shown = [...budgeted, ...unbudgeted];

  const dirty = Object.keys({ ...items, ...draft }).some((name) => (draft[name] ?? 0) !== (items[name] ?? 0));
  const pending = shown.filter((c) => {
    const s = history?.suggestions.get(c);
    return s != null && s.amount !== (draft[c] ?? 0);
  });

  function update(category: string, value: number) {
    setSaved(false);
    setDraft((d) => ({ ...d, [category]: value }));
  }
  function applyAll() {
    if (!history) return;
    setSaved(false);
    setDraft((d) => {
      const next = { ...d };
      for (const c of pending) next[c] = history.suggestions.get(c)!.amount;
      return next;
    });
  }
  function save() {
    saveAll(draft);
    setSaved(true);
  }

  const budgetCount = Object.values(items).filter((v) => v > 0).length;
  const sectionIds = useMemo(() => SECTIONS.filter((s) => !s.adminOnly || admin).map((s) => s.id), [admin]);
  const active = useSectionInView(sectionIds);
  const go = (id: SectionId) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  function row(name: string, i: number, isNew: boolean) {
    const color = CAT_COLORS[i % CAT_COLORS.length];
    const limit = draft[name] ?? 0;
    const used = history?.thisMonth.get(name) ?? 0;
    const over = limit > 0 && used > limit;
    const suggestion = history?.suggestions.get(name);
    return (
      <div key={name} className="flex min-w-0 flex-col gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="truncate">{name}</span>
            {isNew && limit === 0 && <StatusChip tone="neutral">no budget yet</StatusChip>}
          </Label>
          <span className={`text-xs tabular-nums ${over ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
            {history ? `spent ${formatINR(used)} this month` : "…"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">₹</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={limit || ""}
            placeholder="No limit"
            aria-label={`${name} monthly budget`}
            onChange={(e) => update(name, e.target.value === "" ? 0 : Number(e.target.value))}
          />
          <span className="text-xs whitespace-nowrap text-muted-foreground">/ month</span>
        </div>
        {suggestion && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <StatusChip tone="ai">
              <Wand2 className="size-3" /> Suggested {formatINR(suggestion.amount)}
            </StatusChip>
            <span className="text-muted-foreground">median of the last {suggestion.months} months</span>
            {suggestion.amount !== limit && (
              <button
                type="button"
                className="ml-auto font-semibold text-primary hover:underline disabled:opacity-50 disabled:hover:no-underline"
                disabled={!admin}
                onClick={() => update(name, suggestion.amount)}
              >
                Use suggestion
              </button>
            )}
          </div>
        )}
        {over && <p className="text-xs text-rose-600 dark:text-rose-400">Currently over budget by {formatINR(used - limit)}.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle={[
          `${budgetCount} categor${budgetCount === 1 ? "y" : "ies"} budgeted`,
          `${formatINR(reserve, { compact: true })} reserve`,
          `${devices.length} phone${devices.length === 1 ? "" : "s"} connected`,
        ].join(" · ")}
      />

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex flex-wrap gap-1 rounded-xl bg-muted p-1 lg:flex-col lg:bg-transparent lg:p-0">
            {SECTIONS.filter((s) => sectionIds.includes(s.id)).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={active === s.id ? "true" : undefined}
                  className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm transition-colors ${
                    active === s.id
                      ? "bg-card font-semibold shadow-sm lg:bg-primary/10 lg:text-primary lg:shadow-none"
                      : "text-muted-foreground hover:text-foreground lg:hover:bg-muted"
                  }`}
                >
                  <s.icon className="hidden size-4 shrink-0 lg:block" />
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          <Panel
            id="budgets"
            className="scroll-mt-20"
            title="Budgets"
            note="a notification when a category's monthly spend crosses its budget; ₹0 turns it off"
            action={
              <div className="flex items-center gap-3">
                {saved && !dirty && (
                  <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                    <Check className="size-4" /> Saved
                  </span>
                )}
                <Button onClick={save} disabled={!dirty || !admin}>
                  Save budgets
                </Button>
              </div>
            }
          >
            {!admin && <p className="text-sm text-muted-foreground">Budgets are set for the whole household, so only the administrator can change them.</p>}

            {history && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-primary/[0.06] px-4 py-3 text-sm">
                <Wand2 className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  {history.suggestions.size > 0
                    ? `Suggestions are the median of your last ${LOOKBACK} complete months in each category, rounded up to the next ₹500.`
                    : history.monthsWithData >= 2
                      ? `No category has spending in two of the last ${LOOKBACK} complete months yet, so there is nothing to suggest.`
                      : `Suggestions need at least two complete months of spending; ${
                          history.monthsWithData === 0 ? "there are none yet" : "there is one so far"
                        }.`}
                </span>
                {pending.length > 0 && (
                  <Button variant="outline" size="sm" onClick={applyAll} disabled={!admin}>
                    Apply all suggestions ({pending.length})
                  </Button>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">{budgeted.map((name, i) => row(name, i, false))}</div>

            {unbudgeted.length > 0 && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Spent on, but no budget yet</h3>
                  <p className="text-[13px] text-muted-foreground">Categories with spending in the last {LOOKBACK} months that nothing is watching.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">{unbudgeted.map((name, i) => row(name, budgeted.length + i, true))}</div>
              </div>
            )}
          </Panel>

          <Panel
            id="reserve"
            className="scroll-mt-20"
            title="Emergency reserve"
            note="cash you never want to dip below"
          >
            <p className="text-sm text-muted-foreground">
              "Safe to spend" and the cash-flow warning on the dashboard are computed after this reserve and your known upcoming bills.
            </p>
            <div className="flex max-w-md items-center gap-2">
              <span className="text-sm text-muted-foreground">₹</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={reserveDraft}
                aria-label="Emergency reserve"
                onChange={(e) => setReserveDraft(e.target.value)}
                onBlur={() => setReserve(Number(reserveDraft) || 0)}
              />
              <Button variant="outline" onClick={() => setReserve(Number(reserveDraft) || 0)} disabled={Number(reserveDraft) === reserve}>
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Currently {formatINR(reserve)}. Stored in this browser.</p>
          </Panel>

          <Panel
            id="devices"
            className="scroll-mt-20"
            title="Connected devices"
            note="phones running the Jarvis Sync app, forwarding bank SMS here"
          >
            {devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No phone connected yet. Install the Jarvis Sync app, sign in with this server's URL, and it will appear here after its first sync.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {devices.map((d) => {
                  const online = Date.now() - new Date(d.lastSeenAt).getTime() < 30 * 60_000;
                  return (
                    <div key={d.id} className="min-w-0 rounded-xl border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            <span
                              className={`size-2.5 shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
                              title={online ? "Seen in the last 30 minutes" : "Not seen recently"}
                            />
                            <span className="truncate">{d.name || d.model || "Android phone"}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {[d.manufacturer, d.model].filter(Boolean).join(" ")}
                            {d.osVersion ? ` · Android ${d.osVersion}` : ""}
                            {d.appVersion ? ` · app v${d.appVersion}` : ""}
                          </p>
                        </div>
                        <StatusChip tone={d.forwardingEnabled ? "good" : "watch"}>{d.forwardingEnabled ? "Forwarding on" : "Forwarding paused"}</StatusChip>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <dt className="text-muted-foreground">Last sync</dt>
                        <dd className="text-right">{relative(d.lastSyncAt)}</dd>
                        <dt className="text-muted-foreground">Last seen</dt>
                        <dd className="text-right">{relative(d.lastSeenAt)}</dd>
                        <dt className="text-muted-foreground">Forwarded</dt>
                        <dd className="text-right">{d.forwardedTotal} SMS</dd>
                        <dt className="text-muted-foreground">Queued on phone</dt>
                        <dd className={`text-right ${d.pendingCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{d.pendingCount}</dd>
                      </dl>
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-muted-foreground hover:text-rose-500"
                          onClick={() => forgetDevice(d.id).then(loadDevices)}
                        >
                          <Trash2 className="size-3.5" /> Forget
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {admin && (
            <div id="household" className="scroll-mt-20">
              <HouseholdAccounts />
            </div>
          )}

          <Panel id="about" className="scroll-mt-20" title="About" note="which build of the web app you are looking at">
            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">Version</dt>
              <dd className="font-medium tabular-nums">{__APP_VERSION__}</dd>
              {/* Two builds of one release are the case where a version number stops helping. */}
              <dt className="text-muted-foreground">Built</dt>
              <dd className="font-medium">{formatBuildTime(__BUILT_AT__)}</dd>
              <dt className="text-muted-foreground">Backend</dt>
              <dd className="font-medium break-all">{apiBase()}</dd>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** The build stamp as a local date and time; the raw ISO string helps nobody reading a page. */
function formatBuildTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
