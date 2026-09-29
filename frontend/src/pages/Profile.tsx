import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { changePassword, deleteAllData, getProfile, updateProfile } from "@/api";
import { useFamily, type FamilyMember } from "@/lib/store";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageHeader from "@/components/page/PageHeader";
import Panel from "@/components/page/Panel";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const EMPTY = { fullName: "", email: "", phone: "", baseCurrency: "INR", city: "" };

/** Who is signed in: their details, their password, the household roster (administrator only) and the data wipe. */
export default function Profile() {
  const admin = useSession().me?.admin ?? false;
  const people = useFamily().members.filter((m) => m.id !== "all").length;
  const [form, setForm] = useState(EMPTY);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");

  useEffect(() => {
    getProfile()
      .then((p) => {
        setUsername(p.username);
        setForm({
          fullName: p.fullName ?? "",
          email: p.email ?? "",
          phone: p.phone ?? "",
          baseCurrency: p.baseCurrency ?? "INR",
          city: p.city ?? "",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  function set(k: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      await updateProfile(form);
      setStatus("saved");
      setTimeout(() => setStatus(""), 2000);
    } catch {
      setStatus("error");
    }
  }

  const subtitle = [
    `Signed in as ${username || "…"}`,
    admin ? "household administrator" : null,
    admin ? `${people} family member${people === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Profile" subtitle={subtitle} />

      {/* 2×2 on wide screens: Personal | Password, Family | Danger — rows stretch to equal height */}
      <div className="grid gap-6 lg:grid-cols-2">
      <div className="contents">
      <Panel title="Personal details" note="used across your dashboard">
          {loading ? (
            <div className="grid gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={save}>
              <div className="grid gap-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" value={form.fullName} onChange={set("fullName")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={set("email")} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={set("phone")} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="currency">Base currency</Label>
                  <Input id="currency" value={form.baseCurrency} onChange={set("baseCurrency")} maxLength={3} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={form.city} onChange={set("city")} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={status === "saving"}>
                  {status === "saving" ? "Saving…" : "Save profile"}
                </Button>
                {status === "saved" && <span className="text-sm text-emerald-500">Saved ✓</span>}
                {status === "error" && <span className="text-sm text-destructive">Save failed</span>}
              </div>
            </form>
          )}
      </Panel>
      </div>{/* left column */}
      <div className="contents">

      <SecuritySection />

      <FamilySection />

      <DangerZone />
      </div>{/* right column */}
      </div>
    </div>
  );
}

function DangerZone() {
  const { reload } = useFamily();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function wipe() {
    setBusy(true);
    setError("");
    try {
      await deleteAllData();
      reload();
      // Full refresh so every page re-fetches the now-empty data.
      window.location.assign("/dashboard");
    } catch {
      setError("Couldn't delete the data. Please try again — the backend may be down.");
      setBusy(false);
    }
  }

  return (
    <Panel
      className="border-destructive/40"
      title={<span className="text-destructive">Delete all data</span>}
      note="wipes your finances but keeps your profile & login"
    >
        <p className="text-sm text-muted-foreground">
          Permanently removes every account, transaction, investment, loan, reminder, spending
          threshold, and imported statement. Your profile and login are kept. This cannot be undone.
        </p>
        <Button variant="destructive" className="w-fit" onClick={() => setOpen(true)} disabled={busy}>
          {busy ? "Deleting…" : "Delete all data"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete all your data?"
        description="This permanently removes every account, transaction, investment, loan, reminder, and spending threshold. Your profile stays. This cannot be undone."
        confirmLabel="Delete everything"
        onConfirm={wipe}
      />
    </Panel>
  );
}

function SecuritySection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setDone(false);
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    if (next.length < 4) {
      setError("New password must be at least 4 characters.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (err: any) {
      setError(err?.response?.status === 401 ? "Current password is incorrect." : "Couldn't change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Password" note="the one you use to sign in">
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </Button>
            {done && <span className="text-sm text-emerald-500">Password updated ✓</span>}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </form>
    </Panel>
  );
}

/**
 * Managing the household roster -- adding people, editing them, switching the app to monitor
 * someone else's money -- belongs to the administrator. A confined sign-in now only receives its
 * own member from the server anyway; this stops the controls being offered at all.
 */
function FamilySection() {
  const admin = useSession().me?.admin ?? false;
  const { members, addMember, updateMember, removeMember, setActiveId } = useFamily();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FamilyMember | null>(null);
  const [form, setForm] = useState({ name: "", relation: "", email: "", earns: true });
  const [toDelete, setToDelete] = useState<FamilyMember | null>(null);

  if (!admin) return null;

  function openAdd() {
    setEditing(null);
    setForm({ name: "", relation: "", email: "", earns: true });
    setOpen(true);
  }
  function openEdit(m: FamilyMember) {
    setEditing(m);
    setForm({ name: m.name, relation: m.relation, email: m.email ?? "", earns: m.earns });
    setOpen(true);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (editing) {
      updateMember(editing.id, { name: form.name, relation: form.relation, email: form.email, earns: form.earns });
    } else {
      addMember({ name: form.name.trim(), relation: form.relation.trim() || "Family", email: form.email, earns: form.earns });
    }
    setOpen(false);
  }

  return (
    <Panel
      title="Family members"
      note="add family to monitor their finances too"
      action={
        <Button onClick={openAdd} size="sm" className="gap-2">
          <Plus className="size-4" /> Add
        </Button>
      }
    >
      <div className="space-y-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-2 rounded-lg border p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  {m.name}
                  {m.relation === "Self" && <Badge variant="secondary">You</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {m.relation}
                  {m.email ? ` · ${m.email}` : ""}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setActiveId(m.id)}>
                Monitor
              </Button>
              {m.relation !== "Self" && (
                <>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => setToDelete(m)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit member" : "Add family member"}</DialogTitle>
            <DialogDescription>Their finances appear when you switch to them.</DialogDescription>
          </DialogHeader>
          <form id="fam-form" className="grid gap-3" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Relation</Label>
              <Input
                value={form.relation}
                onChange={(e) => setForm({ ...form, relation: e.target.value })}
                placeholder="Spouse, Parent, Child…"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <span>
                <span className="text-sm font-medium">Earns an income</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Turn off for someone who runs the household rather than earning — a homemaker, a
                  child. Their dashboard drops the earning figures, and their financial score is
                  judged on savings and spending instead of on income.
                </span>
              </span>
              <Switch
                checked={form.earns}
                onCheckedChange={(v) => setForm({ ...form, earns: v })}
              />
            </label>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="fam-form">
              {editing ? "Save" : "Add member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Remove family member?"
        description={toDelete ? `${toDelete.name}${toDelete.relation ? ` (${toDelete.relation})` : ""} and their data will be removed.` : undefined}
        confirmLabel="Remove"
        onConfirm={() => toDelete && removeMember(toDelete.id)}
      />
    </Panel>
  );
}
