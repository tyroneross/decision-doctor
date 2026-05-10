'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, Clock, User } from 'lucide-react';
import clsx from 'clsx';

interface MobileTabBarProps {
  userInitials?: string;
  userEmail?: string;
}

/**
 * MobileTabBar: Mobile-only bottom tab bar (md: hidden).
 * 3 tabs: New Decision (primary), History, Account.
 * Per PRD F-01/F-02: New decision is larger, dominates the action.
 *
 * Desktop: hidden (desktop uses the top nav from AppLayout).
 * Mobile: fixed bottom, 3 equal-width tabs with icons.
 */
export function MobileTabBar({ userInitials = '?', userEmail = 'guest@demo.local' }: MobileTabBarProps) {
  const pathname = usePathname();

  const isNewDecision = pathname === '/app/chat' || pathname.startsWith('/app/chat/');
  const isHistory = pathname === '/app/decisions';
  const isAccount = pathname === '/app/account';

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-rule bg-cream-2/80 backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-3xl items-stretch">
        {/* New Decision tab — primary, accent coral */}
        <Link
          href="/app/chat"
          className={clsx(
            'ease-soft flex flex-1 flex-col items-center justify-center gap-1 px-2 py-3 text-xs font-semibold transition-colors',
            isNewDecision
              ? 'grad-coral text-white shadow-md'
              : 'text-ink-700 hover:bg-cream-2 active:bg-cream'
          )}
        >
          <Plus className="h-5 w-5" aria-hidden />
          <span>New</span>
        </Link>

        {/* History tab */}
        <Link
          href="/app/decisions"
          className={clsx(
            'ease-soft flex flex-1 flex-col items-center justify-center gap-1 px-2 py-3 text-xs font-semibold transition-colors',
            isHistory
              ? 'text-coral bg-white/50'
              : 'text-ink-700 hover:bg-cream-2 active:bg-cream'
          )}
        >
          <Clock className="h-5 w-5" aria-hidden />
          <span>History</span>
        </Link>

        {/* Account tab */}
        <Link
          href="/app/account"
          className={clsx(
            'ease-soft flex flex-1 flex-col items-center justify-center gap-1 px-2 py-3 text-xs font-semibold transition-colors',
            isAccount
              ? 'text-coral bg-white/50'
              : 'text-ink-700 hover:bg-cream-2 active:bg-cream'
          )}
          title={userEmail}
        >
          <div
            aria-hidden
            className="grad-coral flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
          >
            {userInitials}
          </div>
          <span>Account</span>
        </Link>
      </div>
    </nav>
  );
}
