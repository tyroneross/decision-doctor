import { ThemePicker } from "@/components/settings/ThemePicker";
import { Card } from "@/components/ui/Card";

/**
 * /app/account — minimal account / settings page (C12 scope).
 *
 * Only ships the theme picker for now. Profile, notifications, data
 * export, etc. are deferred. Reachable from MobileBottomNav's Account
 * tab and (after C12 ships) from the desktop sidebar user footer.
 *
 * Per the UI Guidelines v0.1 status doc: a full Settings/Account page
 * is later work; this stub mounts the theme picker so the user has a
 * place to actually use it.
 */
export default function AccountPage() {
  return (
    <main className="px-5 py-8 lg:px-8 lg:py-10 max-w-2xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-[22px] font-semibold leading-tight text-ink">
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
    </main>
  );
}
