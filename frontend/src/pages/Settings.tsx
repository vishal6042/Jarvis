import { useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { categoryBreakdown } from "@/lib/sample";
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
  const [saved, setSaved] = useState(false);

  const dirty = categoryBreakdown.some((c) => (draft[c.name] ?? 0) !== (items[c.name] ?? 0));

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
            {categoryBreakdown.map((c, i) => {
              const color = CAT_COLORS[i % CAT_COLORS.length];
              const limit = draft[c.name] ?? 0;
              const over = limit > 0 && c.value > limit;
              return (
                <div key={c.name} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 text-sm font-medium">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                      {c.name}
                    </Label>
                    <span className={`text-xs ${over ? "text-rose-500" : "text-muted-foreground"}`}>
                      spent {formatINR(c.value)}
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
                      onChange={(e) => update(c.name, e.target.value === "" ? 0 : Number(e.target.value))}
                    />
                    <span className="whitespace-nowrap text-xs text-muted-foreground">/ month</span>
                  </div>
                  {over && (
                    <p className="mt-2 text-xs text-rose-500">Currently over budget by {formatINR(c.value - limit)}.</p>
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
