"use client";

import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="ease-soft min-h-11 rounded-full px-3 text-[13px] text-ink-500 hover:bg-cream-2 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
      onClick={async () => {
        await signOut();
        router.push("/sign-in");
      }}
    >
      Sign out
    </button>
  );
}
