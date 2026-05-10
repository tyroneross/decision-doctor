import { SignInClient } from "./sign-in-client";

export const metadata = { title: "Sign in or sign up · Decision Doctor" };

interface PageProps {
  searchParams: Promise<{ tab?: string; next?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const { tab, next } = await searchParams;
  const initialMode =
    tab === "signup" ? "signup" : tab === "password" ? "password" : "magic";
  const isSignup = initialMode === "signup";
  // Defense against open-redirect: only same-origin paths allowed.
  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/app/chat";
  return (
    <main className="min-h-screen flex items-start justify-center px-4 pt-12 pb-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">
          {isSignup ? "Create your account" : "Sign in"}
        </h1>
        <p className="mt-2 text-sm text-ink-subtle">
          {isSignup
            ? "Free. No card. We never ask for patient information."
            : "Use a magic link or your email and password. Both work."}
        </p>
        <SignInClient initialMode={initialMode} nextPath={safeNext} />
      </div>
    </main>
  );
}
