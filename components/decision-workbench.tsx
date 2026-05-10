"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DecisionGuide } from "@/components/decision-guide";
import type { DecisionGuideResult } from "@/lib/decision-guide";

export function DecisionWorkbench() {
  const [result, setResult] = useState<DecisionGuideResult | null>(null);

  return (
    <div className="decision-grid">
      <section className="panel entry-panel" id="chat">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Step 1</p>
            <h3>Rank AI insertion points.</h3>
          </div>
          <span className="quiet-badge">Framework first</span>
        </div>
        <DecisionGuide onResultChange={setResult} />
      </section>

      <RecommendationPreview result={result} />
    </div>
  );
}

function RecommendationPreview({ result }: { result: DecisionGuideResult | null }) {
  const title = result
    ? result.templateTitle
      ? `Run the ${result.templateTitle.toLowerCase()} framework.`
      : result.framework.name
    : "Top AI insertion: rank follow-up work first.";
  const body = result
    ? result.rationale
    : "Decision Doctor compares candidate workflows by time returned, AI feasibility, privacy risk, setup burden, and reversibility before recommending what to build.";
  const badge = result ? result.confidence : 82;
  const routeLabel = result
    ? result.templateTitle
      ? "Routed framework"
      : "Custom framework"
    : "Framework preview";
  const primaryOption =
    result?.framework.candidateOptions[0] ??
    "Start with a no-PHI follow-up draft workflow.";
  const criteria = result?.framework.criteria
    .slice(0, 3)
    .map((criterion) => criterion.label) ?? [
    "Time returned",
    "AI feasibility",
    "Privacy risk",
  ];

  return (
    <section
      className={result ? "recommendation-main active" : "recommendation-main"}
      id="recommendation"
      aria-label="Recommendation preview"
    >
      <div>
        <div className="result-heading">
          <p className="eyebrow">{routeLabel}</p>
          <span className="confidence-badge">
            <span>{badge}</span>
            Confidence
          </span>
        </div>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="recommendation-criteria" aria-label="Preview criteria">
          {criteria.map((criterion) => (
            <span key={criterion}>{criterion}</span>
          ))}
        </div>
      </div>
      <div className="recommendation-bottom">
        <div className="robust-row">
          <div>
            <p>{result ? "Working option" : "Robust fallback"}</p>
            <strong>{primaryOption}</strong>
          </div>
        </div>
        {result?.startPath && result.templateTitle ? (
          <Link className="primary-button" href={result.startPath}>
            <span>Start {result.templateTitle} intake</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        ) : (
          <a className="primary-button" href="#chat">
            <span>{result ? "Refine ranking" : "Start scan"}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        )}
      </div>
    </section>
  );
}
