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
          Find the AI that frees the most hours in your week.
        </h1>
        <p className="mt-4 text-ink-subtle max-w-xl text-base sm:text-lg">
          For solo healthcare practitioners. Five minutes of conversation, then a
          ranked stack of tools to deploy — with hours saved, monthly cost, and
          step-by-step setup.
        </p>
      </header>

      <section className="px-6 mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
        <Card title="Clinical notes" body="AI scribes for SOAP and dictation — typically 5–10 hr/wk back." />
        <Card title="Patient comms" body="Secure messaging + AI replies for the FAQs you answer 30x/week." />
        <Card title="Billing &amp; admin" body="Claims automation, prior-auth drafting, intake doc generators." />
      </section>

      <section className="px-6 mt-10 max-w-xl">
        <ol className="space-y-2 text-ink-subtle text-sm leading-relaxed">
          <li>1. Tell us where your time goes each week — clinical notes, comms, billing, admin.</li>
          <li>2. We rank a curated set of AI tools by hours saved, cost, HIPAA fit, and setup effort.</li>
          <li>3. Get the deploy stack — top 2–4 tools with paste-ready setup steps. No PHI asked or stored.</li>
        </ol>
      </section>

      <div className="px-6 mt-auto pt-10 pb-10">
        <Link
          href="/sign-up?next=/app/chat"
          className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-ink text-white font-medium min-h-[48px] min-w-[200px]"
        >
          Audit my week
        </Link>
        <p className="mt-3 text-xs text-ink-muted">
          Free. ~5 minutes. We never ask for patient information.
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
