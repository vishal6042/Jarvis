import { useEffect, useState, type FormEvent } from "react";
import { CreditCard, Landmark, Plus, Trash2, Wallet } from "lucide-react";
import { createAccount, deleteAccount, listAccounts, updateAccount } from "@/api";
import type { Account, AccountRequest, AccountType } from "@/types";
import { formatINR } from "@/lib/format";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ACCOUNT_TYPE_COLOR: Record<AccountType, string> = {
  SAVINGS: "#10b981", // emerald
  CREDIT_CARD: "#8b5cf6", // violet
  DEBIT_CARD: "#3b82f6", // blue
};

type FormState = {
  bank: string;
  type: AccountType;
  last4: string;
  displayName: string;
  currency: string;
  network: string;
  cardHolderName: string;
  creditLimit: string;
  billingCycleDay: string;
  paymentDueDay: string;
  expiryMonth: string;
  expiryYear: string;
  ifsc: string;
  branch: string;
};

const EMPTY: FormState = {
  bank: "",
  type: "CREDIT_CARD",
  last4: "",
  displayName: "",
  currency: "INR",
  network: "",
  cardHolderName: "",
  creditLimit: "",
  billingCycleDay: "",
  paymentDueDay: "",
  expiryMonth: "",
  expiryYear: "",
  ifsc: "",
  branch: "",
};

function toForm(a: Account): FormState {
  return {
    bank: a.bank,
    type: a.type,
    last4: a.last4,
    displayName: a.displayName,
    currency: a.currency,
    network: a.network ?? "",
    cardHolderName: a.cardHolderName ?? "",
    creditLimit: a.creditLimit?.toString() ?? "",
    billingCycleDay: a.billingCycleDay?.toString() ?? "",
    paymentDueDay: a.paymentDueDay?.toString() ?? "",
    expiryMonth: a.expiryMonth?.toString() ?? "",
    expiryYear: a.expiryYear?.toString() ?? "",
    ifsc: a.ifsc ?? "",
    branch: a.branch ?? "",
  };
}

function num(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function toRequest(f: FormState): AccountRequest {
  const isCard = f.type !== "SAVINGS";
  return {
    bank: f.bank.trim(),
    type: f.type,
    last4: f.last4.trim(),
    displayName: f.displayName.trim(),
    currency: f.currency || "INR",
    network: isCard ? f.network || null : null,
    cardHolderName: isCard ? f.cardHolderName || null : null,
    creditLimit: isCard ? num(f.creditLimit) ?? null : null,
    billingCycleDay: isCard ? num(f.billingCycleDay) ?? null : null,
    paymentDueDay: isCard ? num(f.paymentDueDay) ?? null : null,
    expiryMonth: isCard ? num(f.expiryMonth) ?? null : null,
    expiryYear: isCard ? num(f.expiryYear) ?? null : null,
    ifsc: !isCard ? f.ifsc || null : null,
    branch: !isCard ? f.branch || null : null,
  };
}

function AccountCard({
  account,
  onEdit,
  onDelete,
}: {
  account: Account;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isCard = account.type !== "SAVINGS";
  return (
    <Card
      onClick={onEdit}
      className="flex h-full cursor-pointer flex-col overflow-hidden transition-shadow hover:shadow-md hover:ring-1 hover:ring-primary/30"
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 items-center justify-center rounded-xl ${
              isCard ? "bg-primary/10 text-primary" : "bg-chart-1/15 text-chart-1"
            }`}
          >
            {isCard ? <CreditCard className="size-5" /> : <Landmark className="size-5" />}
          </div>
          <div>
            <CardTitle className="text-base">{account.displayName}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {account.bank} •• {account.last4}
            </p>
          </div>
        </div>
        <Badge
          variant="secondary"
          className="border-transparent"
          style={{
            backgroundColor: `${ACCOUNT_TYPE_COLOR[account.type]}22`,
            color: ACCOUNT_TYPE_COLOR[account.type],
          }}
        >
          {account.type.replace("_", " ")}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-2 text-sm">
        {isCard ? (
          <>
            <Row label="Network" value={account.network} />
            <Row label="Credit limit" value={account.creditLimit ? formatINR(account.creditLimit) : null} />
            <Row
              label="Billing / Due"
              value={
                account.billingCycleDay || account.paymentDueDay
                  ? `${account.billingCycleDay ?? "—"} / ${account.paymentDueDay ?? "—"}`
                  : null
              }
            />
            <Row
              label="Expiry"
              value={
                account.expiryMonth && account.expiryYear
                  ? `${String(account.expiryMonth).padStart(2, "0")}/${account.expiryYear}`
                  : null
              }
            />
          </>
        ) : (
          <>
            <Row label="IFSC" value={account.ifsc} />
            <Row label="Branch" value={account.branch} />
          </>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-xs text-muted-foreground">Click card to edit</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="gap-1 text-destructive"
          >
            <Trash2 className="size-3.5" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | AccountType>("all");
  const [toDelete, setToDelete] = useState<Account | null>(null);

  async function refresh() {
    setAccounts(await listAccounts());
  }
  useEffect(() => {
    refresh();
  }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }
  function openEdit(a: Account) {
    setEditing(a);
    setForm(toForm(a));
    setOpen(true);
  }
  function set<K extends keyof FormState>(k: K) {
    return (v: string) => setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const req = toRequest(form);
      if (editing) await updateAccount(editing.id, req);
      else await createAccount(req);
      setOpen(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    await deleteAccount(toDelete.id);
    await refresh();
  }

  const isCard = form.type !== "SAVINGS";
  const visible = filter === "all" ? accounts : accounts.filter((a) => a.type === filter);
  const countOf = (t: AccountType) => accounts.filter((a) => a.type === t).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts &amp; Cards</h1>
          <p className="text-muted-foreground">Your banks, savings, and cards.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | AccountType)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="SAVINGS">Savings</TabsTrigger>
              <TabsTrigger value="CREDIT_CARD">Credit</TabsTrigger>
              <TabsTrigger value="DEBIT_CARD">Debit</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard title="Savings accounts" count={countOf("SAVINGS")} icon={<Landmark className="size-4" />} color={ACCOUNT_TYPE_COLOR.SAVINGS} />
        <SummaryCard title="Credit cards" count={countOf("CREDIT_CARD")} icon={<CreditCard className="size-4" />} color={ACCOUNT_TYPE_COLOR.CREDIT_CARD} />
        <SummaryCard title="Debit cards" count={countOf("DEBIT_CARD")} icon={<Wallet className="size-4" />} color={ACCOUNT_TYPE_COLOR.DEBIT_CARD} />
      </div>

      <Separator />

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No accounts yet. Click <b>Add</b> to save your first bank account or card.
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No accounts of this type.
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              onEdit={() => openEdit(a)}
              onDelete={() => setToDelete(a)}
            />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit account" : "Add account"}</DialogTitle>
            <DialogDescription>Save a bank account or card.</DialogDescription>
          </DialogHeader>
          <form id="acct-form" className="grid gap-4" onSubmit={submit}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select
                  items={[
                    { value: "SAVINGS", label: "Savings" },
                    { value: "CREDIT_CARD", label: "Credit card" },
                    { value: "DEBIT_CARD", label: "Debit card" },
                  ]}
                  value={form.type}
                  onValueChange={(v) => set("type")(v ?? "SAVINGS")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SAVINGS">Savings</SelectItem>
                    <SelectItem value="CREDIT_CARD">Credit card</SelectItem>
                    <SelectItem value="DEBIT_CARD">Debit card</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Bank">
                <Input value={form.bank} onChange={(e) => set("bank")(e.target.value)} required />
              </Field>
              <Field label="Nickname">
                <Input
                  value={form.displayName}
                  onChange={(e) => set("displayName")(e.target.value)}
                  placeholder="e.g. HDFC Regalia"
                  required
                />
              </Field>
              <Field label="Last 4 digits">
                <Input
                  value={form.last4}
                  onChange={(e) => set("last4")(e.target.value)}
                  maxLength={4}
                  inputMode="numeric"
                  required
                />
              </Field>
            </div>

            {isCard ? (
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                <Field label="Network">
                  <Select
                    items={["VISA", "MASTERCARD", "RUPAY", "AMEX"].map((n) => ({
                      value: n,
                      label: n,
                    }))}
                    value={form.network}
                    onValueChange={(v) => set("network")(v ?? "")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {["VISA", "MASTERCARD", "RUPAY", "AMEX"].map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Card holder">
                  <Input
                    value={form.cardHolderName}
                    onChange={(e) => set("cardHolderName")(e.target.value)}
                  />
                </Field>
                <Field label="Credit limit">
                  <Input
                    value={form.creditLimit}
                    onChange={(e) => set("creditLimit")(e.target.value)}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Billing day">
                  <Input
                    value={form.billingCycleDay}
                    onChange={(e) => set("billingCycleDay")(e.target.value)}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Due day">
                  <Input
                    value={form.paymentDueDay}
                    onChange={(e) => set("paymentDueDay")(e.target.value)}
                    inputMode="numeric"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Exp. month">
                    <Input
                      value={form.expiryMonth}
                      onChange={(e) => set("expiryMonth")(e.target.value)}
                      placeholder="MM"
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Exp. year">
                    <Input
                      value={form.expiryYear}
                      onChange={(e) => set("expiryYear")(e.target.value)}
                      placeholder="YYYY"
                      inputMode="numeric"
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
                <Field label="IFSC">
                  <Input value={form.ifsc} onChange={(e) => set("ifsc")(e.target.value)} />
                </Field>
                <Field label="Branch">
                  <Input value={form.branch} onChange={(e) => set("branch")(e.target.value)} />
                </Field>
              </div>
            )}
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="acct-form" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete account?"
        description={toDelete ? `“${toDelete.displayName}” (${toDelete.bank} •• ${toDelete.last4}) will be removed.` : undefined}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function SummaryCard({ title, count, icon, color }: { title: string; count: number; icon: React.ReactNode; color: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{title}</CardDescription>
        <div
          className="flex size-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
        >
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{count}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
