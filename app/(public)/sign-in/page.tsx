"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { signIn, signUp } from "@/lib/auth-client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  canSendMagicLink,
  nameFromEmail,
  validateSignInForm,
  type SignInMode,
} from "@/lib/auth-validation";

/**
 * Sign in / Create account.
 *
 * Three explicit paths, no hidden fallback:
 *   1. Magic link (primary CTA, available in both modes)
 *   2. Sign in with password (existing-user path → signIn.email)
 *   3. Create account with password (new-user path → signUp.email)
 *
 * Mode selection via a two-tab segmented control above the form.
 * autoSignIn:true on the server means signUp.email also creates the session;
 * databaseHooks.user.create.after auto-provisions the Personal tenant.
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

  const [mode, setMode] = useState<SignInMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Submit gating — re-evaluated cheaply on every render.
  const formValidation = useMemo(
    () => validateSignInForm({ email, password, confirmPassword, mode }),
    [email, password, confirmPassword, mode]
  );
  const magicLinkReady = canSendMagicLink(email);

  function clearStatus() {
    setErr(null);
    setMsg(null);
  }

  function switchMode(next: SignInMode) {
    if (next === mode) return;
    setMode(next);
    setConfirmPassword("");
    clearStatus();
  }

  async function handleMagicLink() {
    if (busy || !magicLinkReady) return;
    setBusy(true);
    clearStatus();
    try {
      const res = await signIn.magicLink({ email, callbackURL: "/app" });
      if (res.error) throw new Error(res.error.message);
      setMsg("Check your email. Your sign-in link expires in 60 min.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordSubmit() {
    if (busy || !formValidation.ok) return;
    setBusy(true);
    clearStatus();
    try {
      if (mode === "signin") {
        const res = await signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message);
      } else {
        // autoSignIn: true on the server means the new user is also signed in.
        const res = await signUp.email({
          email,
          password,
          name: nameFromEmail(email),
        });
        if (res.error) throw new Error(res.error.message);
      }
      router.push("/app");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const passwordCtaLabel = mode === "signin" ? "Sign in" : "Create account";

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
          className="mt-6 rounded-md border border-line bg-paper px-3 py-2 text-[13px] text-ink"
        >
          {reasonHint}
        </p>
      )}

      {/* Mode segmented control — two tabs, ink-only.
          Selected uses bottom-border affordance per UI guideline nav-states. */}
      <div
        role="tablist"
        aria-label="Authentication mode"
        className={reasonHint ? "mt-5" : "mt-8"}
      >
        <div className="flex border-b border-line">
          {[
            { key: "signin" as const, label: "Sign in" },
            { key: "signup" as const, label: "Create account" },
          ].map((t) => {
            const selected = mode === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => switchMode(t.key)}
                className={
                  "flex-1 min-h-[40px] px-3 text-[14px] leading-none " +
                  "transition-[color,border-color] duration-150 " +
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20 " +
                  (selected
                    ? "font-semibold text-ink border-b-2 border-ink -mb-px"
                    : "font-medium text-mute hover:text-ink border-b-2 border-transparent")
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <form className="mt-5" onSubmit={(e) => e.preventDefault()}>
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
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            label="Password"
            hint={mode === "signup" ? "At least 8 characters." : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {mode === "signup" && (
            <Input
              type="password"
              autoComplete="new-password"
              label="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={
                confirmPassword.length > 0 && confirmPassword !== password
                  ? "Passwords don't match."
                  : undefined
              }
            />
          )}
        </div>

        <div className="mt-6 space-y-2">
          {/* Primary password CTA — switches label by mode.
              Variant is primary only when fully valid. */}
          <Button
            type="button"
            variant={formValidation.ok ? "primary" : "secondary"}
            full
            disabled={busy || !formValidation.ok}
            aria-busy={busy}
            onClick={handlePasswordSubmit}
          >
            {busy ? "Working…" : passwordCtaLabel}
          </Button>

          {/* Magic link — equally available in both modes, secondary by default
              so it doesn't outweigh the chosen tab's primary action. */}
          <Button
            type="button"
            variant="secondary"
            full
            disabled={busy || !magicLinkReady}
            aria-busy={busy}
            onClick={handleMagicLink}
          >
            Send magic link instead
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
