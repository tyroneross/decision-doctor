"use client";

import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

type Mode = "magic" | "password" | "create";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (mode === "magic") {
        const res = await signIn.magicLink({ email, callbackURL: "/app/decisions" });
        if (res.error) throw new Error(res.error.message);
        setMsg("Check your email for a sign-in link. Link expires in 10 minutes.");
      } else if (mode === "password") {
        const res = await signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message);
        router.push("/app/decisions");
      } else {
        const res = await signUp.email({ email, password, name });
        if (res.error) throw new Error(res.error.message);
        router.push("/app/decisions");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !busy &&
    email.includes("@") &&
    (mode === "magic" || password.length >= 8) &&
    (mode !== "create" || name.trim().length > 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-ink-900">Decision Doctor</h1>
        <p className="text-sm text-ink-500">
          Transparent decisions for solo healthcare practitioners.
        </p>
      </div>

      <div className="mt-8 flex gap-1 text-sm" role="tablist">
        {(
          [
            ["magic", "Magic link"],
            ["password", "Sign in"],
            ["create", "Create account"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={mode === key}
            onClick={() => {
              setMode(key);
              setErr(null);
              setMsg(null);
            }}
            className={
              // min-h-11 = 44px = mobile touch-target floor (PRD §8 / WCAG 2.2).
              // Active tab: brand underline; idle: ink-500 with hover-to-ink.
              "min-h-11 rounded px-3 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 " +
              (mode === key
                ? "border-b-2 border-brand-600 text-ink-900 font-medium"
                : "text-ink-500 hover:text-ink-900")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) submit();
        }}
      >
        {mode === "create" && (
          <label className="block text-sm">
            <span className="text-ink-700">Name</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full min-h-11 rounded border-ink-300 px-3 focus:border-accent-600 focus:ring-accent-600"
            />
          </label>
        )}

        <label className="block text-sm">
          <span className="text-ink-700">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full min-h-11 rounded border-ink-300 px-3 focus:border-accent-600 focus:ring-accent-600"
          />
        </label>

        {mode !== "magic" && (
          <label className="block text-sm">
            <span className="text-ink-700">Password (8+ chars)</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full min-h-11 rounded border-ink-300 px-3 focus:border-accent-600 focus:ring-accent-600"
            />
          </label>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className={
            // min-h-11 = 44px touch-target floor (PRD §8 / WCAG 2.5.8).
            // Enabled bg-brand-600 on white = 5.4:1 (AA-large);
            // disabled text-ink-700 on bg-ink-100 = 7.2:1.
            "w-full min-h-11 rounded-md py-3 text-sm font-medium shadow-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 " +
            (canSubmit
              ? "bg-brand-600 text-white hover:bg-brand-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]"
              : "bg-ink-100 text-ink-700 cursor-not-allowed")
          }
        >
          {busy
            ? "Working..."
            : mode === "magic"
              ? "Send magic link"
              : mode === "password"
                ? "Sign in"
                : "Create account"}
        </button>

        {msg && <p className="text-sm status-ok">{msg}</p>}
        {err && <p className="text-sm status-error">{err}</p>}

        {/* Guest mode for previewing UI */}
        <div className="relative mt-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-ink-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-ink-500">Or preview without account</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            document.cookie = "dd_guest=true; path=/; max-age=3600";
            router.push("/app/decisions");
          }}
          className="mt-4 w-full min-h-11 rounded-md border border-ink-300 py-3 text-sm font-medium text-ink-700 transition-all duration-200 hover:bg-ink-50 hover:border-ink-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          Continue as Guest
        </button>
      </form>

      <p className="mt-6 text-xs text-ink-500">
        We never store names of clients, patients, or PHI. Decisions are
        described in your own words but kept short and Zod-validated server-side.
      </p>
    </main>
  );
}
