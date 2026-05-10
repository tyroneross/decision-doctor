import { SignInClient } from "./sign-in-client";

export const metadata = { title: "Sign in · Decision Doctor" };

export default function SignInPage() {
  return (
    <main className="min-h-screen flex items-start justify-center px-4 pt-12 pb-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-ink-subtle">
          Use a magic link or your email and password. Both work.
        </p>
        <SignInClient />
      </div>
    </main>
  );
}
