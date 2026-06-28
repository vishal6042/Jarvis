import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { authExists, login, register } from "@/api";
import { useFamily } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup";

export default function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { reload } = useFamily();

  // Fresh install (no account yet) → start on the signup form.
  useEffect(() => {
    authExists()
      .then((exists) => setMode(exists ? "signin" : "signup"))
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (mode === "signup" && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        await register({
          username: username.trim(),
          password,
          fullName: fullName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          baseCurrency: "INR",
          city: city.trim() || undefined,
        });
        // Created — now sign in with the new credentials.
        setMode("signin");
        setPassword("");
        setConfirm("");
        setInfo("Account created — please sign in.");
      } else {
        await login(username, password);
        reload();
        navigate("/dashboard");
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (mode === "signup") {
        setError(status === 409 ? err?.response?.data?.message || "Account already exists." : "Sign up failed.");
      } else {
        setError(status === 401 ? "Invalid credentials" : "Login failed");
      }
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/10 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow">
            <Zap className="size-6" />
          </div>
          <CardTitle className="text-2xl">Jarvis</CardTitle>
          <CardDescription>
            {isSignup ? "Create your account to get started" : "Sign in to your finance dashboard"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            {isSignup && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus={!isSignup}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {isSignup && (
              <div className="grid gap-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            {info && <p className="text-sm text-emerald-500">{info}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (isSignup ? "Creating…" : "Signing in…") : isSignup ? "Sign up" : "Sign in"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {isSignup ? "Already have an account? " : "Don't have an account? "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => {
                  setError("");
                  setInfo("");
                  setMode(isSignup ? "signin" : "signup");
                }}
              >
                {isSignup ? "Sign in" : "Sign up"}
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
