import { useEffect, useState } from "react";
import { Activity, ArrowRight, HeartPulse, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function SignInScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name.trim() },
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) setNotice("Your staff account is ready.");
        else setNotice("Check your email to confirm your staff account before signing in.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-[440px] border border-border bg-card p-6 shadow-2xl sm:p-9">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-md bg-primary text-primary-foreground"><HeartPulse className="h-5 w-5" /></span>
          <div>
            <p className="font-display text-xl font-bold">Vitals Ledger</p>
            <p className="eyebrow mt-1">Clinic staff access</p>
          </div>
        </div>
        <div className="mb-7 flex items-start gap-3 border-b border-border pb-6">
          <span className="mt-0.5 text-primary"><Activity className="h-5 w-5" /></span>
          <div>
            <h1 className="font-display text-3xl">{mode === "signin" ? "Sign in to the clinic" : "Create staff account"}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Use your staff account to access shared patient records.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label htmlFor="staff-name" className="label">Display name</label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input id="staff-name" className="field pl-10" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
              </div>
            </div>
          )}
          <div>
            <label htmlFor="staff-email" className="label">Email address</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input id="staff-email" className="field pl-10" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
          </div>
          <div>
            <label htmlFor="staff-password" className="label">Password</label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input id="staff-password" className="field pl-10" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
            </div>
          </div>
          {notice && <p role="status" className="border border-primary/40 bg-primary/10 p-3 text-sm text-foreground">{notice}</p>}
          {error && <p role="alert" className="border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy} className="h-11 w-full rounded-md">
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create staff account"}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New to this clinic?" : "Already have an account?"}{" "}
          <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setNotice(null); }}>
            {mode === "signin" ? "Create staff account" : "Sign in instead"}
          </button>
        </p>
        <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">New accounts start with front-desk access. A clinic administrator assigns any higher clinical role.</p>
      </section>
    </main>
  );
}

export function StaffLoading({ label = "Checking staff access…" }: { label?: string }) {
  return <main className="grid min-h-screen place-items-center bg-background px-4 text-sm text-muted-foreground"><div className="flex items-center gap-3"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" />{label}</div></main>;
}

type AuthState = { checking: boolean; userId: string | null; email: string | null };

export function useStaffIdentity(): AuthState {
  const [identity, setIdentity] = useState<AuthState>({ checking: true, userId: null, email: null });

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error: getUserError }) => {
      if (!active) return;
      setIdentity({
        checking: false,
        userId: getUserError ? null : data.user?.id ?? null,
        email: getUserError ? null : data.user?.email ?? null,
      });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") setIdentity({ checking: false, userId: null, email: null });
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        setIdentity({ checking: false, userId: session?.user.id ?? null, email: session?.user.email ?? null });
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return identity;
}