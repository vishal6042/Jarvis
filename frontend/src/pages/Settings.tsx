import { useEffect, useState } from "react";
import { Check, ShieldCheck, Smartphone, SlidersHorizontal, Trash2 } from "lucide-react";
import { useReserve } from "@/lib/prefs";
import CardArt from "@/components/CardArt";
import { analyticsByCategory, forgetDevice, listDevices, type ConnectedDevice } from "@/api";
import { CATEGORIES } from "@/lib/sample";
import { useThresholds } from "@/lib/store";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function Settings() {
  const { items, saveAll } = useThresholds();
  const [draft, setDraft] = useState<Record<string, number>>(items);
  const [spent, setSpent] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);

  // Thresholds load from the backend after mount — sync the draft when they arrive.
  useEffect(() => {
    setDraft(items);
  }, [items]);

  // This month's real spend per category, to show alongside each threshold.
  useEffect(() => {
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth(), 1);
    analyticsByCategory(from.toISOString(), to.toISOString())
      .then((rows) =>
        setSpent(Object.fromEntries((rows ?? []).map((r) => [r.category, Number(r.total)])))
      )
      .catch(() => setSpent({}));
  }, []);

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

  const dirty = CATEGORIES.some((name) => (draft[name] ?? 0) !== (items[name] ?? 0));

  function update(category: string, value: number) {
    setSaved(false);
    setDraft((d) => ({ ...d, [category]: value }));
  }
  function save() {
    saveAll(draft);
    setSaved(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Spend thresholds and alert preferences.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && !dirty && (
            <span className="flex items-center gap-1 text-sm text-emerald-500">
              <Check className="size-4" /> Saved
            </span>
          )}
          <Button onClick={save} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </div>

      <Card className="relative isolate overflow-hidden">
        <CardArt color="#10b981" subtle />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-500" /> Emergency reserve
          </CardTitle>
          <CardDescription>
            Cash you never want to dip below. "Safe to spend" and the cash-flow warning on the dashboard are computed
            after this reserve and your known upcoming bills.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex max-w-md items-center gap-2">
            <span className="text-sm text-muted-foreground">₹</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={reserveDraft}
              onChange={(e) => setReserveDraft(e.target.value)}
              onBlur={() => setReserve(Number(reserveDraft) || 0)}
            />
            <Button variant="outline" onClick={() => setReserve(Number(reserveDraft) || 0)} disabled={Number(reserveDraft) === reserve}>
              Save
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Currently {formatINR(reserve)}. Stored in this browser.</p>
        </CardContent>
      </Card>

      <Card className="relative isolate overflow-hidden">
        <CardArt color="#3b82f6" subtle />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-5 text-primary" /> Connected devices
          </CardTitle>
          <CardDescription>
            Phones running the Jarvis Sync app. Each one forwards bank SMS to this server and reports its status
            whenever it syncs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No phone connected yet. Install the Jarvis Sync app, sign in with this server's URL, and it will appear
              here after its first sync.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {devices.map((d) => {
                const online = Date.now() - new Date(d.lastSeenAt).getTime() < 30 * 60_000;
                return (
                  <div key={d.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          <span
                            className={`size-2.5 rounded-full ${online ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
                            title={online ? "Seen in the last 30 minutes" : "Not seen recently"}
                          />
                          {d.name || d.model || "Android phone"}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[d.manufacturer, d.model].filter(Boolean).join(" ")}
                          {d.osVersion ? ` · Android ${d.osVersion}` : ""}
                          {d.appVersion ? ` · app v${d.appVersion}` : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          d.forwardingEnabled ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"
                        }`}
                      >
                        {d.forwardingEnabled ? "Forwarding on" : "Forwarding paused"}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">Last sync</dt>
                      <dd className="text-right">{relative(d.lastSyncAt)}</dd>
                      <dt className="text-muted-foreground">Last seen</dt>
                      <dd className="text-right">{relative(d.lastSeenAt)}</dd>
                      <dt className="text-muted-foreground">Forwarded</dt>
                      <dd className="text-right">{d.forwardedTotal} SMS</dd>
                      <dt className="text-muted-foreground">Queued on phone</dt>
                      <dd className={`text-right ${d.pendingCount > 0 ? "text-amber-500" : ""}`}>{d.pendingCount}</dd>
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
        </CardContent>
      </Card>

      <Card className="relative isolate overflow-hidden">
        <CardArt color="#8b5cf6" subtle />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-5 text-primary" /> Category spend thresholds
          </CardTitle>
          <CardDescription>
            You'll get a notification when a category's monthly spend crosses its threshold. Set ₹0 to disable. These
            sync to your backend, which sends the alerts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {CATEGORIES.map((name, i) => {
              const color = CAT_COLORS[i % CAT_COLORS.length];
              const limit = draft[name] ?? 0;
              const used = spent[name] ?? 0;
              const over = limit > 0 && used > limit;
              return (
                <div key={name} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                      {name}
                    </Label>
                    <span className={`text-xs ${over ? "text-rose-500" : "text-muted-foreground"}`}>
                      spent {formatINR(used)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">₹</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={limit || ""}
                      placeholder="No limit"
                      onChange={(e) => update(name, e.target.value === "" ? 0 : Number(e.target.value))}
                    />
                    <span className="whitespace-nowrap text-xs text-muted-foreground">/ month</span>
                  </div>
                  {over && (
                    <p className="mt-2 text-xs text-rose-500">Currently over budget by {formatINR(used - limit)}.</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
