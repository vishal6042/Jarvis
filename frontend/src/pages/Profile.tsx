import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { changePassword, getProfile, updateProfile } from "@/api";
import { useFamily, type FamilyMember } from "@/lib/store";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";

const EMPTY = { fullName: "", email: "", phone: "", baseCurrency: "INR", city: "" };

export default function Profile() {
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">Signed in as {username || "…"}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>Used across your dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <SecuritySection />

      <FamilySection />
    </div>
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
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="size-4" />
        </div>
        <div>
          <CardTitle>Password</CardTitle>
          <CardDescription>Change the password you use to sign in.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}

function FamilySection() {
  const { members, addMember, updateMember, removeMember, setActiveId } = useFamily();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FamilyMember | null>(null);
  const [form, setForm] = useState({ name: "", relation: "", email: "" });
  const [toDelete, setToDelete] = useState<FamilyMember | null>(null);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", relation: "", email: "" });
    setOpen(true);
  }
  function openEdit(m: FamilyMember) {
    setEditing(m);
    setForm({ name: m.name, relation: m.relation, email: m.email ?? "" });
    setOpen(true);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (editing) {
      updateMember(editing.id, { name: form.name, relation: form.relation, email: form.email });
    } else {
      addMember({ name: form.name.trim(), relation: form.relation.trim() || "Family", email: form.email });
    }
    setOpen(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Family members</CardTitle>
          <CardDescription>Add family to monitor their finances too.</CardDescription>
        </div>
        <Button onClick={openAdd} size="sm" className="gap-2">
          <Plus className="size-4" /> Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {m.name}
                  {m.relation === "Self" && <Badge variant="secondary">You</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {m.relation}
                  {m.email ? ` · ${m.email}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
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
      </CardContent>

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
    </Card>
  );
}
