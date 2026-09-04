import { useMemo, useState } from "react";
import { Sparkles, Settings2 } from "lucide-react";
import CardArt, { networkColor } from "@/components/CardArt";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";
import { CATEGORIES } from "@/lib/sample";
import { bestCard, defaultsFor, useRewards } from "@/lib/rewards";
import type { Account } from "@/types";

/** "Which card should I use?" — ranks your credit cards by estimated reward for a purchase. */
export default function BestCardCard({ accounts }: { accounts: Account[] }) {
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");
  const [amount, setAmount] = useState("5000");
  const [category, setCategory] = useState<string>("Shopping");
  const [editing, setEditing] = useState(false);
  const [rewards, setRewards] = useRewards();
  const value = Number(amount) || 0;
  const picks = useMemo(() => bestCard(value, category, cards, rewards), [value, category, cards, rewards]);
  if (cards.length === 0) return null;
  const top = picks[0];

  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="var(--primary)" subtle />
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Best card for a purchase
          </CardTitle>
          <CardDescription>Estimated from the reward rates you set per card and category — edit them to match your cards' terms.</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditing((v) => !v)}>
          <Settings2 className="size-3.5" /> {editing ? "Done" : "Edit rates"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Amount (₹)</span>
            <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="w-36" />
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Category</span>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-2.5 py-1 text-xs ring-1 transition-colors ${category === c ? "bg-primary text-primary-foreground ring-primary" : "bg-primary/8 ring-primary/20 hover:bg-primary/15"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {value > 0 && top && (
          <div className="rounded-xl border p-3" style={{ borderColor: `${networkColor(top.account.network, "#8b5cf6")}66` }}>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Recommended</div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-lg font-semibold">{top.account.displayName}</span>
              <span className="text-lg font-bold text-[var(--ok)]">≈ {formatINR(top.value)}</span>
            </div>
            <div className="text-xs text-muted-foreground">{top.pct}% back on {category} · {formatINR(value)}</div>
          </div>
        )}

        <div className="space-y-1.5">
          {picks.map((p, i) => (
            <div key={p.account.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: networkColor(p.account.network, "#8b5cf6") }} />
                {p.account.displayName}
                {i === 0 && value > 0 && <span className="rounded-full bg-[var(--ok)]/15 px-1.5 text-[10px] font-semibold text-[var(--ok)]">best</span>}
              </span>
              <span className="tabular-nums">
                <span className="text-muted-foreground">{p.pct}% · </span>
                <span className="font-semibold">{formatINR(p.value)}</span>
              </span>
            </div>
          ))}
        </div>

        {editing && (
          <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
            {cards.map((c) => {
              const cfg = rewards[String(c.id)] ?? defaultsFor(c);
              return (
                <div key={c.id} className="space-y-2 text-sm">
                  <div className="font-medium">{c.displayName}</div>
                  <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    Default %
                    <Input
                      value={String(cfg.defaultPct)}
                      onChange={(e) => setRewards(c.id, { ...cfg, defaultPct: Number(e.target.value) || 0 })}
                      inputMode="decimal"
                      className="h-7 w-20"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    {category} %
                    <Input
                      value={String(cfg.byCategory[category] ?? "")}
                      placeholder={String(cfg.defaultPct)}
                      onChange={(e) => {
                        const v = e.target.value;
                        const byCategory = { ...cfg.byCategory };
                        if (v === "") delete byCategory[category];
                        else byCategory[category] = Number(v) || 0;
                        setRewards(c.id, { ...cfg, byCategory });
                      }}
                      inputMode="decimal"
                      className="h-7 w-20"
                    />
                  </label>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground sm:col-span-2">Rates are stored in this browser. Pick a category above, then set that category's rate per card.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
