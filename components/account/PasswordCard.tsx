"use client";

// Password rotation card mounted on /app/account for signed-in non-guest users.
// Server-rendered parent decides whether to render this at all; we don't fetch
// session client-side (matches the rest of the app's server-first auth pattern).

import { useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  validateChangePassword,
  type ChangePasswordFormState,
} from "@/lib/auth-validation";

export function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const state: ChangePasswordFormState = {
    currentPassword,
    newPassword,
    confirmNewPassword,
  };
  const validation = useMemo(() => validateChangePassword(state), [
    currentPassword,
    newPassword,
    confirmNewPassword,
  ]);

  // Inline confirm error only AFTER user typed in the confirm field, so they
  // don't see "Passwords don't match" while still typing the new password.
  const confirmInlineError =
    confirmNewPassword.length > 0 && confirmNewPassword !== newPassword
      ? "Passwords don't match."
      : undefined;

  async function handleSubmit() {
    if (busy || !validation.ok) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      // Better Auth's React client exposes path-to-object methods from the
      // server's endpoint table. /change-password → authClient.changePassword.
      const res = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (res.error) throw new Error(res.error.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setMsg("Password updated. Other sessions signed out.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <header className="mb-3">
        <h2 className="text-h3 text-ink">
          Password
        </h2>
        <p className="text-[13px] text-mute leading-relaxed">
          Rotate the password on this account. Other sessions will sign out.
        </p>
      </header>

      <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
        <Input
          type="password"
          autoComplete="current-password"
          label="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Input
          type="password"
          autoComplete="new-password"
          label="New password"
          hint="At least 8 characters."
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Input
          type="password"
          autoComplete="new-password"
          label="Confirm new password"
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          error={confirmInlineError}
        />

        {/* Action button: secondary (muted) until criteria met, primary
            (terracotta fill) when actionable. Matches user preference for
            distinct enabled/disabled states. */}
        <div className="pt-1">
          <Button
            type="button"
            variant={validation.ok ? "primary" : "secondary"}
            disabled={busy || !validation.ok}
            aria-busy={busy}
            onClick={handleSubmit}
          >
            {busy ? "Updating…" : "Update password"}
          </Button>
        </div>

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
    </Card>
  );
}
