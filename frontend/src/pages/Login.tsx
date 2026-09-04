import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import {
  authExists,
  getSecurityQuestion,
  login,
  register,
  resetPassword,
} from "@/api";
import { useFamily } from "@/lib/store";
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

type Mode = "signin" | "signup" | "forgot";

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What was the name of your first school?",
  "What is your mother's maiden name?",
  "What was your childhood nickname?",
  "What is your favourite book or film?",
];

export default function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [forgotQuestion, setForgotQuestion] = useState<string | null>(null);
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

  function goForgot() {
    setError("");
    setInfo("");
    setForgotQuestion(null);
    setMode("forgot");
    getSecurityQuestion()
      .then((q) => setForgotQuestion(q))
      .catch(() => setForgotQuestion(null));
  }

  function switchMode(next: Mode) {
    setError("");
    setInfo("");
    setMode(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");

    if ((mode === "signup" || mode === "forgot") && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        await register({
          username: username.trim(),
          password,
          securityQuestion,
          securityAnswer: securityAnswer.trim(),
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
        setSecurityAnswer("");
        setInfo("Account created — please sign in.");
      } else if (mode === "forgot") {
        await resetPassword(securityAnswer.trim(), password);
        setMode("signin");
        setPassword("");
        setConfirm("");
        setSecurityAnswer("");
        setInfo("Password reset — please sign in with your new password.");
      } else {
        await login(username, password);
        reload();
        navigate("/dashboard");
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (mode === "signup") {
        setError(status === 409 ? err?.response?.data?.message || "Account already exists." : "Sign up failed.");
      } else if (mode === "forgot") {
        setError(status === 401 ? "That answer doesn't match. Please try again." : "Couldn't reset the password.");
      } else {
        setError(status === 401 ? "Invalid credentials" : "Login failed");
      }
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  const title = isSignup ? "Create your account to get started" : isForgot ? "Reset your password" : "Sign in to your finance dashboard";
  const submitLabel = busy
    ? isSignup
      ? "Creating…"
      : isForgot
        ? "Resetting…"
        : "Signing in…"
    : isSignup
      ? "Sign up"
      : isForgot
        ? "Reset password"
        : "Sign in";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-background p-4">
      <LoginBackdrop />
      <Card className="relative z-10 w-full max-w-sm border-white/20 bg-card/75 shadow-2xl backdrop-blur-xl">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Zap className="size-6" />
          </div>
          <CardTitle className="text-2xl">Jarvis</CardTitle>
          <CardDescription>{title}</CardDescription>
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

            {/* Username + password for signin/signup. Forgot uses the security question instead. */}
            {!isForgot && (
              <>
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
              </>
            )}

            {isSignup && (
              <>
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
                <div className="grid gap-2">
                  <Label htmlFor="securityQuestion">Security question</Label>
                  <Select
                    value={securityQuestion}
                    onValueChange={(v) => setSecurityQuestion(v as string)}
                  >
                    <SelectTrigger id="securityQuestion" className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SECURITY_QUESTIONS.map((q) => (
                        <SelectItem key={q} value={q}>
                          {q}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Used to reset your password if you forget it.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="securityAnswer">Your answer</Label>
                  <Input
                    id="securityAnswer"
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            {isForgot && (
              <>
                <div className="grid gap-2">
                  <Label>Security question</Label>
                  <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {forgotQuestion ?? "Loading…"}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="forgotAnswer">Your answer</Label>
                  <Input
                    id="forgotAnswer"
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            {info && <p className="text-sm text-emerald-500">{info}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {submitLabel}
            </Button>

            {mode === "signin" && (
              <button
                type="button"
                className="text-center text-sm text-muted-foreground hover:text-foreground hover:underline"
                onClick={goForgot}
              >
                Forgot your password?
              </button>
            )}

            <p className="text-center text-sm text-muted-foreground">
              {isForgot ? (
                <>
                  Remembered it?{" "}
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => switchMode("signin")}>
                    Back to sign in
                  </button>
                </>
              ) : (
                <>
                  {isSignup ? "Already have an account? " : "Don't have an account? "}
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => switchMode(isSignup ? "signin" : "signup")}
                  >
                    {isSignup ? "Sign in" : "Sign up"}
                  </button>
                </>
              )}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/** Full-bleed login background: the finance illustration at public/login-bg.jpg, with a soft
 *  vignette scrim toward the theme background so the glass card stays legible on any screen. */
function LoginBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* the artwork, covering the viewport */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/login-bg.png')" }}
      />
      {/* vignette + tint toward the background colour for card contrast (light & dark) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_10%,var(--background)_95%)] opacity-70" />
      <div className="absolute inset-0 bg-background/10 dark:bg-background/45" />
    </div>
  );
}
