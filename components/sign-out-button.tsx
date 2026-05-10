"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="text-ink-subtle hover:text-ink"
      onClick={async () => {
        await authClient.signOut();
        window.location.href = "/";
      }}
    >
      Sign out
    </button>
  );
}
