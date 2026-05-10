import Link from "next/link";
import { redirect } from "next/navigation";
import { getActorSession } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getActorSession();
  if (!session) redirect("/sign-in");
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 sm:px-6 py-3 border-b border-border flex items-center justify-between bg-canvas-raised no-print">
        <Link href="/app/chat" className="text-sm font-semibold text-ink">
          Decision Doctor
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/app/chat" className="text-ink-subtle hover:text-ink min-h-[44px] inline-flex items-center">
            New
          </Link>
          <Link href="/app/history" className="text-ink-subtle hover:text-ink min-h-[44px] inline-flex items-center">
            History
          </Link>
          <SignOutButton />
        </nav>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
