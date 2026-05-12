"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { signIn, signUp } from "@/lib/auth-client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/**
 * D0 — Single-screen sign-in / sign-up.
 *
 * Two explicit paths:
 *   - Magic link (primary CTA): signIn.magicLink(email, callbackURL: /app)
 *   - Password sign-in (secondary until active): signIn.email(email, password)
 *     with USER_NOT_FOUND fallback to signUp.email (autoSignIn: true)
 *
 * Redirects on success to /app.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInPageInner />
    </Suspense>
  );
}

function SignInPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const reasonHint =
    reason === "save-artifact"
      ? "Sign in to save the artifact you just generated."
      : null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const emailValid = /.+@.+\..+/.test(email);

  async function handleMagicLink() {
    if (busy || !emailValid) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await signIn.magicLink({
        email,
        callbackURL: "/app",
      });
      if (res.error) throw new Error(res.error.message);
      setMsg("Check your email. Your sign-in link expires in 60 min.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordSignIn() {
    if (busy || !emailValid || password.length === 0) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      // Try sign-in first; fall through to sign-up on USER_NOT_FOUND.
      // Better Auth's `autoSignIn: true` (lib/auth.ts) means the
      // signUp.email call also signs the new account in.
      const res = await signIn.email({ email, password });
      if (res.error) {
        const code = res.error.code ?? "";
        const message = res.error.message ?? "";
        if (code === "USER_NOT_FOUND" || /not.*found|no.*user/i.test(message)) {
          const sup = await signUp.email({
            email,
            password,
            name: email.split("@")[0] ?? "",
          });
          if (sup.error) throw new Error(sup.error.message);
        } else {
          throw new Error(message);
        }
      }
      router.push("/app");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <header className="space-y-1">
        <Image
          src="/aida-logo.png"
          alt="Aida"
          width={420}
          height={280}
          priority
          className="max-w-[220px] sm:max-w-[260px] h-auto"
        />
        <p className="text-[12px] font-medium text-mute pt-1">
          sign in to your practice
        </p>
      </header>

      {reasonHint && (
        <p
          role="status"
          className="mt-6 rounded-md border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink"
        >
          {reasonHint}
        </p>
      )}

      <form className={reasonHint ? "mt-4" : "mt-8"} onSubmit={(e) => e.preventDefault()}>
        {/* Credentials group */}
        <div className="space-y-3">
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
            placeholder="only needed for password sign-in"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {/* Two explicit action buttons */}
        <div className="mt-6 space-y-2">
          {/* Button A: Magic link — always primary-styled */}
          <Button
            type="button"
            variant="primary"
            full
            disabled={busy || !emailValid}
            aria-busy={busy}
            onClick={handleMagicLink}
            className="disabled:opacity-60"
          >
            {busy ? "Working…" : "Send magic link"}
          </Button>

          {/* Button B: Password sign-in — secondary until both fields valid */}
          <Button
            type="button"
            variant={emailValid && password.length > 0 ? "primary" : "secondary"}
            full
            disabled={busy || !emailValid || password.length === 0}
            aria-busy={busy}
            onClick={handlePasswordSignIn}
          >
            Sign in
          </Button>
        </div>

        {msg && (
          <p role="status" className="mt-4 text-[13px] status-ok">
            {msg}
          </p>
        )}
        {err && (
          <p role="alert" className="mt-4 text-[13px] status-error">
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
