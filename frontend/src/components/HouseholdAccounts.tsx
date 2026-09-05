import { useEffect, useState } from "react";
import { KeyRound, Loader2, Trash2, UserPlus, Users } from "lucide-react";
import CardArt from "@/components/CardArt";
import { createUser, deleteUser, listUsers, updateUser } from "@/api";
import { useFamily } from "@/lib/store";
import { useSession } from "@/lib/session";
import type { HouseholdUser } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Turn whatever the server refused with into something worth reading. */
function reason(e: unknown, fallback: string): string {
  const r = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return r && r.trim() ? r : fallback;
}

/**
 * Who can sign in, and whose money each of them sees. Only the administrator gets this: everyone
 * else is confined to one member and has nothing to manage here.
 */
export default function HouseholdAccounts() {
  const { me } = useSession();
  const { members } = useFamily();
  const people = members.filter((m) => m.id !== "all");

  const [users, setUsers] = useState<HouseholdUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [memberId, setMemberId] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const [resetting, setResetting] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const load = () =>
    listUsers()
      .then(setUsers)
      .catch((e) => setError(reason(e, "Could not load the accounts.")))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  if (!me?.admin) return null;

  const nameOf = (id: number | null) =>
    id == null
      ? "the whole household"
      : people.find((p) => p.id === String(id))?.name ?? `member ${id}`;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const created = await createUser({
        username: username.trim(),
        password,
        memberId: Number(memberId),
        admin: false,
      });
      setUsername("");
      setPassword("");
      setMemberId("");
      setNote(`${created.username} can now sign in, and will see ${nameOf(created.memberId)}.`);
      await load();
    } catch (err) {
      setError(reason(err, "Could not create that account."));
    } finally {
      setBusy(false);
    }
  }

  async function resetPasswordFor(id: number) {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      await updateUser(id, { password: newPassword });
      setResetting(null);
      setNewPassword("");
      setNote("Password changed. Tell them the new one.");
    } catch (err) {
      setError(reason(err, "Could not change that password."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: HouseholdUser) {
    const ok = confirm(
      `Remove ${u.username}? They will no longer be able to sign in. Their money stays.`
    );
    if (!ok) return;
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      await deleteUser(u.id);
      await load();
    } catch (err) {
      setError(reason(err, "Could not remove that account."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="relative isolate overflow-hidden">
      <CardArt color="#3b82f6" subtle />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-5 text-blue-500" /> Household accounts
        </CardTitle>
        <CardDescription>
          You are the administrator, so you see everything. Anyone you add here is tied to one person
          and sees only their accounts, deposits and transactions — on the web and on the phone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">
                    {u.username}
                    {u.admin && (
                      <span className="ml-2 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-500">
                        administrator
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">Sees {nameOf(u.memberId)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setResetting(resetting === u.id ? null : u.id);
                      setNewPassword("");
                    }}
                  >
                    <KeyRound className="mr-1 size-4" /> Password
                  </Button>
                  {u.username !== me.username && (
                    <Button variant="outline" size="sm" onClick={() => remove(u)} disabled={busy}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                {resetting === u.id && (
                  <div className="flex w-full items-center gap-2">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder={`New password for ${u.username}`}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={busy || newPassword.length < 4}
                      onClick={() => resetPasswordFor(u.id)}
                    >
                      Set
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="hh-username">Username</Label>
            <Input
              id="hh-username"
              value={username}
              autoComplete="off"
              onChange={(e) => setUsername(e.target.value)}
              placeholder="neha"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hh-password">Password</Label>
            <Input
              id="hh-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 4 characters"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hh-member">Sees</Label>
            <Select
              items={people.map((p) => ({ value: p.id, label: p.name }))}
              value={memberId}
              onValueChange={(v) => setMemberId(v ?? "")}
            >
              <SelectTrigger id="hh-member" className="w-full">
                <SelectValue placeholder="Choose a person…" />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-3">
            <Button
              type="submit"
              disabled={busy || !username.trim() || password.length < 4 || !memberId}
            >
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 size-4" />
              )}
              Add account
            </Button>
          </div>
        </form>

        {note && <p className="text-sm text-emerald-500">{note}</p>}
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Passwords are stored hashed, so nobody — you included — can read one back. If someone
          forgets theirs, set a new one here.
        </p>
      </CardContent>
    </Card>
  );
}
