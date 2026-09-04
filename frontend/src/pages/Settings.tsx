import { useEffect, useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { analyticsByCategory } from "@/api";
import { CATEGORIES } from "@/lib/sample";
import { useThresholds } from "@/lib/store";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

      <Card>
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
