import { NextResponse } from "next/server";
import { GUEST_COOKIE } from "@/lib/auth-guest";

const ONE_DAY = 60 * 60 * 24;

export async function POST() {
  const res = NextResponse.json({ ok: true, mode: "guest" });
  res.cookies.set(GUEST_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_DAY,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true, mode: "cleared" });
  res.cookies.set(GUEST_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
