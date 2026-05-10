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
import { DecisionWorkbench } from "@/components/decision-workbench";

const ACCELERATORS = [
  {
    label: "AI insertion",
    href: "#chat",
    active: true,
    note: "Rank first",
  },
  {
    label: "Capacity",
    href: "/app/decisions/new/capacity",
    note: "Time",
  },
  {
    label: "Admin work",
    href: "/app/decisions/new/admin-hire",
    note: "Tasks",
  },
  {
    label: "Pricing",
    href: "/app/decisions/new/pricing",
    note: "Access",
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
            <p className="eyebrow">Decision frameworks for AI adoption</p>
            <h1>Prioritize where AI should help.</h1>
            <p>
              Rank time drains, score AI feasibility, and leave with a starter
              prompt, skill, or plugin plan.
            </p>
          </div>
          <div className="simple-actions">
            <a className="primary-button" href="#chat">
              <span>Start scan</span>
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a className="secondary-button" href="#automation">
              View artifacts
            </a>
          </div>
        </header>

        <section className="accelerator-bar" aria-label="Decision accelerators">
          <div>
            <p className="eyebrow">Researched starting points</p>
            <p>
              Known practice decisions seed the framework. The guide can rank
              any workflow where AI might return capacity.
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

        <DecisionWorkbench />

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
                  text="Time returned, safety, access, sustainability"
                />
                <TraceRow
                  label="Constraints"
                  text="No PHI, human review, reversible test"
                />
                <TraceRow
                  label="Weights"
                  text="Time 34, feasibility 28, risk 23"
                />
                <TraceRow
                  label="Ranking"
                  text="Follow-up draft workflow leads by 18 points"
                />
              </div>
            </details>

            <div className="reducer-section" id="automation">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Starter build outputs</p>
                  <h3>Prompt, skill, and plugin plans.</h3>
                </div>
              </div>
              <div className="reducer-list" aria-label="AI workflow ideas">
                <ReducerCard
                  icon={<Mail size={20} aria-hidden="true" />}
                  label="Prompt"
                  title="AI insertion ranker"
                  body="Score repeated tasks by time returned, AI fit, risk, and setup effort."
                />
                <ReducerCard
                  icon={<ClipboardCheck size={20} aria-hidden="true" />}
                  label="Skill"
                  title="Workflow scorer"
                  body="Collect task candidates, apply vetoes, and recommend the first safe build."
                />
                <ReducerCard
                  icon={<CalendarClock size={20} aria-hidden="true" />}
                  label="Plugin"
                  title="Starter brief"
                  body="Define command surface, permissions, and tests before connecting tools."
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
