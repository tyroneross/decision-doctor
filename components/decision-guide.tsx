"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { ArrowRight, ShieldCheck, WandSparkles } from "lucide-react";
import type {
  AiMaturity,
  DecisionGuideAssumption,
  DecisionGuideFramework,
  DecisionGuideResult,
} from "@/lib/decision-guide";

const DEFAULT_QUESTION =
  "I am exhausted and my waitlist keeps growing. Should I keep accepting new intakes?";

const EXAMPLES = [
  { label: "Capacity", text: DEFAULT_QUESTION },
  {
    label: "Pricing",
    text: "Should I raise my fee or keep prices stable while I still take insurance?",
  },
  {
    label: "Admin help",
    text: "I spend too much time on calls and billing. Should I hire admin help or automate first?",
  },
];

const MATURITY_OPTIONS: Array<{ label: string; value: AiMaturity }> = [
  { label: "New to AI", value: "new_to_ai" },
  { label: "Comfortable", value: "comfortable" },
  { label: "Advanced", value: "advanced" },
];

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export function DecisionGuide() {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [aiMaturity, setAiMaturity] = useState<AiMaturity>("new_to_ai");
  const [result, setResult] = useState<DecisionGuideResult | null>(null);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [challenged, setChallenged] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedQuestion = question.trim();
    if (!submittedQuestion) return;

    setIsLoading(true);
    setError(null);
    setDraftAnswer("");
    setChallenged([]);
    setMessages((current) => [...current, { role: "user", text: submittedQuestion }]);

    try {
      const response = await fetch("/api/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: submittedQuestion, aiMaturity }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body?.error ?? "The guide could not process that question.");
        setResult(null);
        return;
      }

      setResult(body);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: body?.chat?.assistantMessage ?? body?.plainAnswer ?? "I found a decision frame.",
        },
      ]);
    } catch {
      setError("The guide could not connect. Try again in a moment.");
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  function challengeAssumption(assumption: DecisionGuideAssumption) {
    setChallenged((current) =>
      current.includes(assumption.topic)
        ? current.filter((topic) => topic !== assumption.topic)
        : [...current, assumption.topic],
    );
  }

  return (
    <form
      action="/app/guide"
      className="decision-guide"
      aria-label="Decision question guide"
      method="get"
      onSubmit={handleSubmit}
    >
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
          id="decision-question"
          maxLength={700}
          name="question"
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
          value={question}
        />
      </label>

      <div className="guide-examples" aria-label="Example questions">
        {EXAMPLES.map((example) => (
          <label
            className="guide-example"
            key={example.label}
          >
            <input
              checked={question === example.text}
              name="question-example"
              onChange={() => setQuestion(example.text)}
              type="radio"
            />
            <span>
              <strong>{example.label}</strong>
              <small>{example.text}</small>
            </span>
          </label>
        ))}
      </div>

      <fieldset className="guide-maturity">
        <legend>AI comfort</legend>
        <div>
          {MATURITY_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                checked={aiMaturity === option.value}
                name="aiMaturity"
                onChange={() => setAiMaturity(option.value)}
                type="radio"
                value={option.value}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="guide-safety">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>Use counts and categories only. Keep patient details out.</span>
      </div>

      {messages.length > 0 ? (
        <div className="guide-chat" aria-label="Decision guide chat">
          {messages.map((message, index) => (
            <div className={`guide-chat-message ${message.role}`} key={`${message.role}-${index}`}>
              <span>{message.role === "assistant" ? "Decision Doctor" : "You"}</span>
              <p>{message.text}</p>
            </div>
          ))}
        </div>
      ) : null}

      <input
        className="primary-button guide-submit"
        disabled={isLoading}
        type="submit"
        value={isLoading ? "Guiding..." : "Guide me"}
      />

      {error ? (
        <div className="guide-message" role="alert">
          <strong>Guide unavailable</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {result ? (
        <GuideResult
          challenged={challenged}
          draftAnswer={draftAnswer}
          onChallenge={challengeAssumption}
          onDraftAnswerChange={setDraftAnswer}
          onQuickReply={setQuestion}
          result={result}
        />
      ) : null}
    </form>
  );
}

function GuideResult({
  challenged,
  draftAnswer,
  onChallenge,
  onDraftAnswerChange,
  onQuickReply,
  result,
}: {
  challenged: string[];
  draftAnswer: string;
  onChallenge: (assumption: DecisionGuideAssumption) => void;
  onDraftAnswerChange: (answer: string) => void;
  onQuickReply: (reply: string) => void;
  result: DecisionGuideResult;
}) {
  const primaryQuestion = result.primaryQuestion;
  const framework = result.framework;

  return (
    <div className="guide-result" aria-live="polite">
      <div className="guide-result-topline">
        <span>{result.status === "ready" ? "Suggested path" : "Clarify first"}</span>
        <span>{result.confidence}% confidence</span>
      </div>

      <h4>{result.templateTitle ?? "Choose a decision area"}</h4>
      <p>{result.plainAnswer}</p>
      <p>{result.rationale}</p>

      <FrameworkSummary framework={framework} />

      {primaryQuestion ? (
        <div className="guide-primary-question">
          <div className="guide-progress">{result.progressLabel}</div>
          <strong>{primaryQuestion.prompt}</strong>
          <div className="guide-chip-row" aria-label="Common answer chips">
            {primaryQuestion.chips.map((chip) => (
              <button
                className={draftAnswer === chip ? "guide-answer-chip active" : "guide-answer-chip"}
                key={chip}
                onClick={() => onDraftAnswerChange(draftAnswer === chip ? "" : chip)}
                type="button"
              >
                {chip}
              </button>
            ))}
          </div>
          <textarea
            aria-label={primaryQuestion.label}
            onChange={(event) => onDraftAnswerChange(event.target.value)}
            placeholder={primaryQuestion.example}
            rows={2}
            value={draftAnswer}
          />
        </div>
      ) : null}

      <div className="guide-next">
        <strong>{result.chat.nextQuestion}</strong>
        <span>Reply in the decision box above, or use one of these working options.</span>
        <div className="guide-chip-row" aria-label="Chat quick replies">
          {result.chat.quickReplies.map((reply) => (
            <button
              className="guide-answer-chip"
              key={reply}
              onClick={() => onQuickReply(reply)}
              type="button"
            >
              {reply}
            </button>
          ))}
        </div>
      </div>

      {result.inferredAssumptions.length > 0 ? (
        <div className="guide-assumptions">
          <strong>Assumptions to verify</strong>
          {result.inferredAssumptions.map((assumption) => {
            const isChallenged = challenged.includes(assumption.topic);
            return (
              <div className="guide-assumption" key={assumption.topic}>
                <div>
                  <span>{assumption.topic}</span>
                  <p>{isChallenged ? assumption.challengePrompt : assumption.value}</p>
                  <small>
                    {assumption.confidence} confidence - {assumption.rationale}
                  </small>
                </div>
                <button type="button" onClick={() => onChallenge(assumption)}>
                  {isChallenged ? "Keep" : "Challenge"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <ol className="guide-steps">
        {result.simpleSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {result.safetyNotes.map((note) => (
        <div className="guide-safety" key={note}>
          <ShieldCheck size={18} aria-hidden="true" />
          <span>{note}</span>
        </div>
      ))}

      {result.startPath && result.templateTitle ? (
        <a className="primary-button guide-link" href={result.startPath}>
          <span>Start {result.templateTitle} intake</span>
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      ) : (
        <div className="guide-safety">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>Keep chatting until the framework has enough constraints for a recommendation.</span>
        </div>
      )}
    </div>
  );
}

function FrameworkSummary({ framework }: { framework: DecisionGuideFramework }) {
  return (
    <div className="guide-framework">
      <div className="guide-result-topline">
        <span>{framework.decisionType}</span>
        <span>{framework.name}</span>
      </div>
      <p>{framework.why}</p>

      <div className="guide-framework-grid">
        <div>
          <strong>Decision methods</strong>
          <ol className="guide-method-list">
            {framework.methods.map((method) => (
              <li key={method}>{method}</li>
            ))}
          </ol>
        </div>
        <div>
          <strong>AI capacity levers</strong>
          <div className="guide-ai-ideas">
            {framework.aiWorkflowIdeas.map((idea) => (
              <article key={idea.title}>
                <span>{idea.permissionTier}</span>
                <strong>{idea.title}</strong>
                <p>{idea.description}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
