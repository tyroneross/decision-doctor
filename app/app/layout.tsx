import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { SignOutButton } from "./_components/sign-out";
import { ServiceWorkerRegister } from "./_components/sw-register";

// Auth gate for everything under /app/*. SSR redirect — no client flash.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const email = session.user.email ?? "";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="no-print border-b border-ink-100 bg-white">
        <nav
          aria-label="Primary"
          className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3"
        >
          <Link
            href="/app/decisions"
            className="text-sm font-medium text-ink-900"
          >
            Decision Doctor
          </Link>
          <div className="flex items-center gap-3 text-sm sm:gap-4">
            <Link
              href="/app/decisions"
              className="hidden min-h-11 items-center rounded-md px-2 text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:inline-flex"
            >
              History
            </Link>
            <Link
              href="/app/chat"
              className="inline-flex min-h-11 items-center rounded-md border border-ink-300 px-3 text-ink-900 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-600 hover:text-brand-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.98]"
            >
              Chat
            </Link>
            <Link
              href="/app/decisions/new"
              className="inline-flex min-h-11 items-center rounded-md bg-brand-600 px-3 text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.98]"
            >
              New
            </Link>
            <span className="hidden text-ink-500 lg:inline">{email}</span>
            <SignOutButton />
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
      <ServiceWorkerRegister />
    </div>
  );
}
