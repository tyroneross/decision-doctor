"use client";

import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className={
        "block w-full text-left px-3 py-1.5 rounded-md text-[12px] " +
        "text-mute hover:text-ink hover:bg-line/40 transition-colors " +
        "focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ink/20"
      }
      onClick={async () => {
        await signOut();
        router.push("/sign-in");
      }}
    >
      Sign out
    </button>
  );
}
