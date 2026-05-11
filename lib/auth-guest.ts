import "server-only";
import { cookies } from "next/headers";

export const GUEST_COOKIE = "dd:guest";

export const GUEST_USER = {
  email: "guest@local",
  initials: "GU",
} as const;

export async function isGuestRequest(): Promise<boolean> {
  const c = await cookies();
  return c.get(GUEST_COOKIE)?.value === "1";
}
