import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AppFrame } from "@/components/decision-client";
import {
  DecisionGuideRequestSchema,
  guideDecisionQuestion,
  type AiMaturity,
  type DecisionGuideWorkflowIdea,
} from "@/lib/decision-guide";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GuidePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const question = firstValue(params.question) ?? "";
  const aiMaturity = firstValue(params.aiMaturity) ?? "new_to_ai";
  const parsed = DecisionGuideRequestSchema.safeParse({
    question,
    aiMaturity: aiMaturity as AiMaturity,
  });

  if (!parsed.success) {
    return (
      <AppFrame showHistory={false}>
        <Link className="button button-plain no-print" href="/app">
          <ArrowLeft size={18} aria-hidden="true" />
          Back
        </Link>
        <p className="eyebrow">AI insertion guide</p>
        <h1 className="page-title">Ask what AI should improve first.</h1>
        <p className="page-lede">
          Use a short business question without patient identifiers or clinical notes.
        </p>
      </AppFrame>
    );
  }

  const result = guideDecisionQuestion(parsed.data);
  const heading = result.templateTitle
    ? `${result.templateTitle} decision`
    : result.framework.name;

  return (
    <AppFrame showHistory={false}>
      <Link className="button button-plain no-print" href="/app">
        <ArrowLeft size={18} aria-hidden="true" />
        Back
      </Link>
      <p className="eyebrow">Decision framework</p>
      <h1 className="page-title">{heading}</h1>
      <p className="page-lede">{result.plainAnswer}</p>

      <section className="section guide-result" aria-label="Guide result">
        <div className="guide-result-topline">
          <span>{result.framework.decisionType}</span>
          <span>{result.confidence}% confidence</span>
        </div>
        <h2>{result.framework.name}</h2>
        <p>{result.rationale}</p>
        <p>{result.framework.why}</p>

        <div className="guide-primary-question">
          <div className="guide-progress">{result.progressLabel}</div>
          <strong>
            {result.primaryQuestion?.prompt ?? result.chat.nextQuestion}
          </strong>
          <div className="guide-chip-row" aria-label="Suggested replies">
            {result.chat.quickReplies.map((reply) => (
              <span className="guide-answer-chip" key={reply}>
                {reply}
              </span>
            ))}
          </div>
        </div>

        <div className="guide-assumptions">
          <strong>Starter prompt, skill, and plugin</strong>
          {result.framework.aiWorkflowIdeas.map((idea) => (
            <div className="guide-assumption" key={idea.title}>
              <div>
                <span>{idea.title}</span>
                <p>{idea.description}</p>
                <small>
                  {idea.type} / {idea.permission_tier} / {idea.automationLevel.replace("_", " ")}
                </small>
                <GuideArtifact idea={idea} />
              </div>
            </div>
          ))}
        </div>

        <div className="guide-safety">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>No PHI is needed for this decision.</span>
        </div>

        {result.startPath && result.templateTitle ? (
          <Link className="button button-primary" href={result.startPath}>
            <span>Start {result.templateTitle} intake</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        ) : (
          <Link className="button button-primary" href="/app#chat">
            <span>Keep chatting</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        )}
      </section>
    </AppFrame>
  );
}

function GuideArtifact({ idea }: { idea: DecisionGuideWorkflowIdea }) {
  const steps = idea.artifact.playbookSteps;
  const manifest = idea.artifact.pluginManifest;

  return (
    <div className="guide-artifact">
      {idea.artifact.promptText ? <p>{idea.artifact.promptText}</p> : null}
      {idea.artifact.skillName ? <p>Skill: {idea.artifact.skillName}</p> : null}
      {idea.artifact.skillMarkdown ? (
        <details>
          <summary>Skill starter</summary>
          <pre>{idea.artifact.skillMarkdown}</pre>
        </details>
      ) : null}
      {idea.artifact.pluginUrl ? <p>{idea.artifact.pluginUrl}</p> : null}
      {idea.artifact.pluginCommand ? <p>Command: {idea.artifact.pluginCommand}</p> : null}
      {manifest ? (
        <details>
          <summary>Plugin starter</summary>
          <pre>{JSON.stringify(manifest, null, 2)}</pre>
        </details>
      ) : null}
      {idea.artifact.mcpServer ? <p>MCP: {idea.artifact.mcpServer}</p> : null}
      {steps?.length ? (
        <ol>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
