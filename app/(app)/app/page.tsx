import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DecisionGuide } from "@/components/decision-guide";

const ACCELERATORS = [
  {
    label: "Any decision",
    href: "#chat",
    active: true,
    note: "Start in chat",
  },
  {
    label: "Capacity",
    href: "/app/decisions/new/capacity",
    note: "Demand and panel load",
  },
  {
    label: "Pricing",
    href: "/app/decisions/new/pricing",
    note: "Fees, access, retention",
  },
  {
    label: "Admin help",
    href: "/app/decisions/new/admin-hire",
    note: "Delegation and automation",
  },
];

export default function AppPage() {
  return (
    <main className="mockup-shell">
      <div className="simple-workspace">
        <header className="simple-header">
          <div className="brand-line">
            <div className="brand-mark">
              <Stethoscope size={19} aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">Decision Doctor</p>
              <strong>Practice decision workbench</strong>
            </div>
          </div>
          <div className="header-lock">
            <LockKeyhole size={16} aria-hidden="true" />
            <span>No PHI in v1</span>
          </div>
          <div className="simple-title">
            <p className="eyebrow">Chat-first decision support</p>
            <h1>Ask about any practice decision.</h1>
            <p>
              Decision Doctor turns free-text questions into a structured
              recommendation, visible math, and AI workflow ideas that free
              capacity.
            </p>
          </div>
          <div className="simple-actions">
            <a className="primary-button" href="#chat">
              <span>Start chat</span>
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a className="secondary-button" href="#automation">
              Find AI leverage
            </a>
          </div>
        </header>

        <section className="accelerator-bar" aria-label="Decision accelerators">
          <div>
            <p className="eyebrow">Researched accelerators</p>
            <p>
              Capacity, pricing, and admin help are fast paths. Chat still
              handles a decision that does not fit a template.
            </p>
          </div>
          <nav className="template-strip" aria-label="Decision accelerators">
            {ACCELERATORS.map((template) => (
              <Link
                className={
                  template.active ? "template-pill active" : "template-pill"
                }
                href={template.href}
                key={template.label}
              >
                <strong>{template.label}</strong>
                <small>{template.note}</small>
              </Link>
            ))}
          </nav>
        </section>

        <div className="decision-grid">
          <section className="panel entry-panel" id="chat">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Step 1</p>
                <h3>Chat through the decision.</h3>
              </div>
              <span className="quiet-badge">Any type</span>
            </div>
            <DecisionGuide />
          </section>

          <section
            className="recommendation-main"
            id="recommendation"
            aria-label="Recommendation preview"
          >
            <div>
              <div className="result-heading">
                <p className="eyebrow">Recommendation preview</p>
                <span className="confidence-badge">
                  <span>82</span>
                  Confidence
                </span>
              </div>
              <h2>Recommended: cap new intakes for 14 days.</h2>
              <p>
                The chat routed this to the capacity model because the question
                touches demand, access, clinician hours, and reversibility.
              </p>
            </div>
            <div className="recommendation-bottom">
              <div className="robust-row">
                <div>
                  <p>Robust fallback</p>
                  <strong>
                    Reopen two consult slots if cancellations exceed 15%.
                  </strong>
                </div>
              </div>
              <Link className="primary-button" href="/app/decisions/new/capacity">
                <span>Run guided intake</span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>

        <section className="method-panel" aria-label="Decision explanation">
          <div className="method-header">
            <div>
              <p className="eyebrow">Step 2</p>
              <h2>Check the math and capacity gains.</h2>
            </div>
            <span className="status-pill success">
              <CheckCircle2 size={15} aria-hidden="true" />
              Explainable draft
            </span>
          </div>

          <div className="method-grid">
            <details className="evidence-box" open>
              <summary>
                <span>Alternatives considered</span>
                <ChevronRight size={18} aria-hidden="true" />
              </summary>
              <div className="evidence-list">
                <EvidenceItem
                  title="Add two evening sessions"
                  body="Burnout risk outranks the short-term revenue upside."
                  stage="Eliminated"
                />
                <EvidenceItem
                  title="Hire admin help immediately"
                  body="Cash buffer is below the commitment threshold."
                  stage="Deferred"
                />
              </div>
            </details>

            <details className="evidence-box">
              <summary>
                <span>Show the work</span>
                <ChevronRight size={18} aria-hidden="true" />
              </summary>
              <div className="trace-list">
                <TraceRow
                  label="Values"
                  text="Access, sustainability, cash stability"
                />
                <TraceRow label="Constraints" text="No PHI, 28 clinical hours" />
                <TraceRow label="Weights" text="Burnout 34, access 28, cash 23" />
                <TraceRow label="Ranking" text="Cap intakes leads by 18 points" />
              </div>
            </details>

            <div className="reducer-section" id="automation">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">AI leverage scan</p>
                  <h3>Free capacity without adding clinical hours.</h3>
                </div>
              </div>
              <div className="reducer-list" aria-label="AI workflow ideas">
                <ReducerCard
                  icon={<Mail size={20} aria-hidden="true" />}
                  label="Prompt"
                  title="Waitlist reply draft"
                  body="Explain the pause, review window, and next check-in."
                />
                <ReducerCard
                  icon={<ClipboardCheck size={20} aria-hidden="true" />}
                  label="Playbook"
                  title="Two-week triage script"
                  body="Sort consults by fit, urgency, and referral source."
                />
                <ReducerCard
                  icon={<CalendarClock size={20} aria-hidden="true" />}
                  label="MCP hook"
                  title="Review block"
                  body="Create a calendar block to reopen capacity if assumptions shift."
                />
              </div>
            </div>
          </div>
        </section>

        <footer className="mockup-footer">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            Decision Doctor uses counts and categories only. Patient identifiers
            stay out of the workflow.
          </span>
        </footer>
      </div>
    </main>
  );
}

function EvidenceItem({
  title,
  body,
  stage,
}: {
  title: string;
  body: string;
  stage: string;
}) {
  return (
    <div className="evidence-item">
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      <span>{stage}</span>
    </div>
  );
}

function TraceRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="trace-row">
      <span>{label}</span>
      <p>{text}</p>
    </div>
  );
}

function ReducerCard({
  icon,
  label,
  title,
  body,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  body: string;
}) {
  return (
    <article className="reducer-card">
      <div className="reducer-topline">
        {icon}
        <span>{label}</span>
      </div>
      <h4>{title}</h4>
      <p>{body}</p>
    </article>
  );
}
