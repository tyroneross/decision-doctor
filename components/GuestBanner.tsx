import Link from "next/link";

export function GuestBanner() {
  return (
    <div
      role="status"
      className="no-print fixed bottom-[68px] left-1/2 z-40 -translate-x-1/2 lg:bottom-3"
    >
      <div className="flex items-center gap-3 rounded-full border border-line bg-paper px-4 py-2 shadow-card">
        <span className="inline-flex h-2 w-2 rounded-full bg-ink" aria-hidden />
        <span className="text-[13px] font-medium text-text">
          Guest mode &middot; your work won&rsquo;t be saved
        </span>
        <Link
          href="/sign-in"
          className="text-[13px] font-semibold text-ink underline-offset-2 hover:underline"
        >
          Sign in &rarr;
        </Link>
      </div>
    </div>
  );
}
