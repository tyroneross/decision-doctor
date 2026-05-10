"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "magic" | "password" | "signup";

export function SignInClient({ initialMode = "magic" }: { initialMode?: Mode } = {}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "loading" | "success" | "error"; msg?: string }>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "loading" });
    try {
      if (mode === "magic") {
        const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/app" });
        if (error) throw new Error(error.message);
        setStatus({
          kind: "success",
          msg: "Check your email for the magic link. (In dev, check the server console too.)",
        });
      } else if (mode === "password") {
        const { error } = await authClient.signIn.email({ email, password, callbackURL: "/app" });
        if (error) throw new Error(error.message);
        window.location.href = "/app";
      } else {
        const { error } = await authClient.signUp.email({ email, password, name: name || email.split("@")[0] || "User", callbackURL: "/app" });
        if (error) throw new Error(error.message);
        window.location.href = "/app";
      }
    } catch (err) {
      setStatus({ kind: "error", msg: (err as Error).message });
    }
  }

  return (
    <div className="mt-6">
      <div className="flex gap-1 text-xs mb-4 border-b border-slate-200">
        <Tab active={mode === "magic"} onClick={() => setMode("magic")}>Magic link</Tab>
        <Tab active={mode === "password"} onClick={() => setMode("password")}>Password</Tab>
        <Tab active={mode === "signup"} onClick={() => setMode("signup")}>Sign up</Tab>
      </div>
      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <Field label="Name (optional)">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border-slate-300 focus:border-ink focus:ring-ink min-h-[44px]"
              autoComplete="name"
            />
          </Field>
        )}
        <Field label="Email">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border-slate-300 focus:border-ink focus:ring-ink min-h-[44px]"
            autoComplete="email"
          />
        </Field>
        {mode !== "magic" && (
          <Field label="Password">
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border-slate-300 focus:border-ink focus:ring-ink min-h-[44px]"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            <div className="mt-1 text-xs text-ink-muted">8 characters minimum.</div>
          </Field>
        )}
        <button
          type="submit"
          disabled={status.kind === "loading" || !email || (mode !== "magic" && password.length < 8)}
          className="w-full inline-flex items-center justify-center px-4 py-3 rounded-xl bg-ink text-white font-medium min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status.kind === "loading"
            ? "Working..."
            : mode === "magic"
              ? "Send magic link"
              : mode === "password"
                ? "Sign in"
                : "Create account"}
        </button>
        {status.kind === "success" && (
          <div className="text-sm text-confidence-high">{status.msg}</div>
        )}
        {status.kind === "error" && (
          <div className="text-sm text-confidence-low">{status.msg}</div>
        )}
      </form>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-3 text-sm border-b-2 -mb-px min-h-[44px] inline-flex items-center ${
        active
          ? "border-ink text-ink font-medium"
          : "border-transparent text-ink-subtle hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
