import Link from "next/link";
import { ArrowRight, ShieldCheck, WandSparkles } from "lucide-react";

const EXAMPLES = [
  { label: "Capacity", text: "Waitlist growth with clinician exhaustion" },
  { label: "Pricing", text: "Fee change with access and retention risk" },
  { label: "Admin help", text: "Admin workload against margin" },
];

export function DecisionGuide() {
  return (
    <div className="decision-guide" aria-label="Decision question guide">
      <div className="guide-heading">
        <div className="guide-icon" aria-hidden="true">
          <WandSparkles size={20} />
        </div>
        <div>
          <p className="eyebrow">Question guide</p>
          <h3>Ask the practice decision.</h3>
        </div>
      </div>

      <label className="guide-question" htmlFor="decision-question">
        <span>Decision question</span>
        <textarea
          defaultValue="I am exhausted and my waitlist keeps growing. Should I keep accepting new intakes?"
          id="decision-question"
          maxLength={700}
          rows={4}
        />
      </label>

      <div className="guide-examples" aria-label="Example decision areas">
        {EXAMPLES.map((example, index) => (
          <span
            className={index === 0 ? "guide-example active" : "guide-example"}
            key={example.label}
          >
            <strong>{example.label}</strong>
            <small>{example.text}</small>
          </span>
        ))}
      </div>

      <div className="guide-safety">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>Use counts and categories only. Keep patient details out.</span>
      </div>

      <a className="primary-button guide-submit" href="#guide-result">
        <WandSparkles size={18} aria-hidden="true" />
        <span>Guide me</span>
        <ArrowRight size={18} aria-hidden="true" />
      </a>

      <div className="guide-result" id="guide-result">
        <div className="guide-result-topline">
          <span>Suggested path</span>
          <span>82% confidence</span>
        </div>
        <h4>Capacity decision</h4>
        <p>
          Use the capacity intake. The question is about access, workload, and
          whether the current panel can absorb more demand.
        </p>
        <Link className="primary-button guide-link" href="/app/decisions/new/capacity">
          <span>Start Capacity intake</span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
