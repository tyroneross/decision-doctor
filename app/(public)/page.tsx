import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Top-right Sign in link (returning users skip the marketing flow) */}
      <div className="px-6 pt-4 flex justify-end">
        <Link
          href="/sign-in"
          className="text-sm font-medium text-ink underline underline-offset-2 min-h-[44px] inline-flex items-center px-2"
        >
          Sign in
        </Link>
      </div>

      <header className="px-6 pt-6 pb-4">
        <div className="text-sm tracking-wide uppercase text-ink-muted">Decision Doctor</div>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold leading-tight max-w-xl">
          A second opinion for the business decisions you keep putting off.
        </h1>
        <p className="mt-4 text-ink-subtle max-w-xl text-base sm:text-lg">
          Five minutes of structured input. One recommendation, with the math made
          visible. Built for solo healthcare practitioners.
        </p>
      </header>

      <section className="px-6 mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
        <Card title="Capacity" body="Cap intake, raise prices, or hire admin help." />
        <Card title="Pricing" body="Decide how much to raise without losing the patients you'd keep." />
        <Card title="Hire" body="Pick the right shape of help for your actual bottleneck." />
      </section>

      <section className="px-6 mt-10 max-w-xl">
        <ol className="space-y-2 text-ink-subtle text-sm leading-relaxed">
          <li>1. Pick a decision template.</li>
          <li>2. Answer up to seven questions. No PHI — none asked, none stored.</li>
          <li>3. Get one recommendation with alternatives, confidence, and a robust fallback.</li>
        </ol>
      </section>

      <div className="px-6 mt-auto pt-10 pb-10">
        <Link
          href="/sign-up"
          className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-ink text-white font-medium min-h-[48px] min-w-[160px]"
        >
          Get started — it's free
        </Link>
        <p className="mt-3 text-xs text-ink-muted">
          Takes 30 seconds. We never ask for patient information.
        </p>
      </div>
    </main>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-canvas-raised p-4">
      <div className="text-base font-semibold text-ink">{title}</div>
      <div className="mt-1 text-sm text-ink-subtle">{body}</div>
    </div>
  );
}
