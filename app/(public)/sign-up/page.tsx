import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

// Personas (Maya, Hank) hit /sign-up directly because the sign-in page tabs
// hide sign-up under a "Sign in" heading. This route opens the sign-in page
// pre-selected on the sign-up tab so the URL matches user intent.
// The `next` param threads through so the chat-first landing CTA lands
// directly on /app/chat after signup.
export default async function SignUpRoute({ searchParams }: PageProps) {
  const { next } = await searchParams;
  // Allow only same-origin paths (defense against open-redirect).
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : null;
  const target = safeNext
    ? `/sign-in?tab=signup&next=${encodeURIComponent(safeNext)}`
    : "/sign-in?tab=signup";
  redirect(target);
}
