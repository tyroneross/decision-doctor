import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ThemePicker } from "@/components/settings/ThemePicker";
import { PasswordCard } from "@/components/account/PasswordCard";
import { SearchScopeToggle } from "@/components/SearchScopeToggle";
import { SearchScopeProvider } from "@/lib/search-scope/context";
import { Card } from "@/components/ui/Card";

/**
 * /app/account — account / settings.
 *
 * Sections:
 *   - Theme (always available)
 *   - Search scope (Track A C4 — Focused vs Broad)
 *   - Password (signed-in non-guest only — guests sign in to get one)
 *
 * Server-renders the auth state and conditionally mounts <PasswordCard />.
 * We don't useSession() client-side — every other authenticated page in this
 * app reads the session on the server, and that pattern stays consistent here.
 */
export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const signedIn = Boolean(session?.user);

  return (
    <SearchScopeProvider isAuthed={signedIn}>
      <main className="px-5 py-8 lg:px-8 lg:py-10 max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-h1 sm:text-h1-lg text-ink">
            Account
          </h1>
          <p className="text-[14px] text-mute leading-relaxed">
            Adjust the look. More options arrive as the app grows.
          </p>
        </header>

        <Card>
          <ThemePicker />
        </Card>

        <p className="text-[12px] text-mute">
          Theme F is the default. A and B preserve the layout. Only the
          accent color and surface tones change.
        </p>

        <Card>
          <div className="space-y-2">
            <p className="text-[14px] font-medium text-ink">Search scope</p>
            <SearchScopeToggle />
          </div>
        </Card>

        {signedIn ? (
          <PasswordCard />
        ) : (
          <Card>
            <p className="text-[13px] text-mute leading-relaxed">
              Sign in to set or rotate a password on this account.
            </p>
          </Card>
        )}
      </main>
    </SearchScopeProvider>
  );
}
