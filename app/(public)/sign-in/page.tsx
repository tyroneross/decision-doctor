"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/**
 * D0 — Single-screen sign-in / sign-up.
 *
 * One screen, one button: "Send magic link · or sign in".
 *
 * Submit branches:
 *   - password.length > 0 → signIn.email(email, password)
 *   - password empty       → signIn.magicLink(email, callbackURL: /app)
 *
 * Account creation: email + password is enough (Better Auth's email/password
 * flow auto-creates if not found, when configured server-side; magic-link
 * path provisions on first verification regardless).
 *
 * Redirects on success to /app — the F1 search-first home (shipped in
 * C5). The decisions list is one bottom-nav tap away.
 */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = !busy && /.+@.+\..+/.test(email);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (password.length > 0) {
        // Try sign-in first; fall through to sign-up on USER_NOT_FOUND.
        // Better Auth's `autoSignIn: true` (lib/auth.ts) means the
        // signUp.email call also signs the new account in.
        const res = await signIn.email({ email, password });
        if (res.error) {
          const code = res.error.code ?? "";
          const msg = res.error.message ?? "";
          if (code === "USER_NOT_FOUND" || /not.*found|no.*user/i.test(msg)) {
            const sup = await signUp.email({
              email,
              password,
              name: email.split("@")[0] ?? "",
            });
            if (sup.error) throw new Error(sup.error.message);
          } else {
            throw new Error(msg);
          }
        }
        router.push("/app");
      } else {
        const res = await signIn.magicLink({
          email,
          callbackURL: "/app",
        });
        if (res.error) throw new Error(res.error.message);
        setMsg("Check your email — your sign-in link expires in 60 min.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <header className="space-y-1">
        <h1 className="text-[32px] font-bold leading-tight text-text">
          decision doctor
        </h1>
        <p className="text-[12px] font-medium text-mute">
          sign in to your practice
        </p>
      </header>

      <form className="mt-8 space-y-4" onSubmit={submit}>
        <Input
          type="email"
          required
          autoComplete="email"
          autoFocus
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Input
          type="password"
          autoComplete="current-password"
          label="Password (optional)"
          placeholder="leave blank for magic link"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button
          type="submit"
          variant="primary"
          full
          disabled={!canSubmit}
          aria-busy={busy}
        >
          {busy ? "Working…" : "Send magic link · or sign in"}
        </Button>

        {msg && (
          <p role="status" className="text-[13px] status-ok">
            {msg}
          </p>
        )}
        {err && (
          <p role="alert" className="text-[13px] status-error">
            {err}
          </p>
        )}
      </form>

      <p className="mt-8 text-[13px] font-normal text-mute leading-relaxed">
        Magic links expire in 60 min. Sessions are 7-day rolling. SSO is
        post-MVP.
      </p>

      <div className="mt-6 border-t border-line pt-6">
        <button
          type="button"
          onClick={async () => {
            setBusy(true);
            try {
              await fetch("/api/auth/guest", { method: "POST" });
              router.push("/app");
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
          disabled={busy}
          className="inline-flex min-h-[32px] items-center px-1 -mx-1 text-[13px] font-medium text-ink underline-offset-2 hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 rounded-[6px]"
        >
          Browse as guest &rarr;
        </button>
        <p className="mt-1 text-[12px] text-mute">
          Explore the interface without signing in. Your work won&rsquo;t be
          saved.
        </p>
      </div>
    </main>
  );
}
