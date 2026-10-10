import { useState } from "react";
import { ChipSelect } from "./chips";
import { Link } from "@tanstack/react-router";
import {
  Lock,
  ArrowRight,
  Check,
  Info,
  Star,
  Lightbulb,
  Pencil,
  GitCompareArrows,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageTitle, Pill, Note } from "./common";
import { goals, guardrails, versionPrompts, versions } from "./data";
import { DiffView, DiffCounts } from "./diff";
import { toast } from "sonner";
import { FadeIn, Reveal } from "./motion-kit";
import { PreprodGatePanel } from "./preprod";
import { RolloutPlan, RISK_LABEL, bucketLabel, useVersionLibrary } from "./rollout-plan";
import { useSelectExperiment } from "./experiment-picker";
import { createAndStart, type ExperimentRisk } from "@/lib/experiments-api";

const steps = ["Goal and change", "Pre-prod gate", "Rollout plan", "Decision"];

export function Setup() {
  const [step, setStep] = useState(0);
  const [locked, setLocked] = useState(false);
  const [name, setName] = useState("Shorter opening vs baseline");
  const [goal, setGoal] = useState("meeting-fixed");
  const [primaryMetric, setPrimaryMetric] = useState("Meeting Fixed");
  const [customGoal, setCustomGoal] = useState("");
  const [examples, setExamples] = useState("");
  const [baseId, setBaseId] = useState("A");
  const [challengerId, setChallengerId] = useState("B");
  const [drafts, setDrafts] = useState<Record<string, string>>(versionPrompts);
  const [editing, setEditing] = useState(false);
  const [why, setWhy] = useState(
    "A shorter opening and a direct meeting ask should lift Meeting Fixed.",
  );
  const [startPct, setStartPct] = useState(10);
  const [risk, setRisk] = useState<ExperimentRisk>("standard");
  const [starting, setStarting] = useState(false);
  const library = useVersionLibrary();
  const selectExperiment = useSelectExperiment();
  const [error, setError] = useState("");
  const atRisk = guardrails[0];
  const basePrompt = versionPrompts[baseId] ?? "";
  const variant = drafts[challengerId] ?? "";
  const setVariant = (value: string) => setDrafts({ ...drafts, [challengerId]: value });
  const sameVersion = baseId === challengerId;
  const versionName = (id: string) =>
    library.find((v) => v.id === id)?.label ?? versions.find((v) => v.id === id)?.name ?? id;
  const versionOptions =
    library.length > 0
      ? library.map((v) => ({ value: v.id, label: v.slot ? `Version ${v.slot}` : v.label }))
      : versions.map((v) => ({ value: v.id, label: `Version ${v.id}` }));
  const selectedGoal = goals.find((g) => g.id === goal);

  const advance = () => {
    setError("");
    if (step === 0) {
      if (!name.trim()) return setError("Name your experiment first.");
      if (goal === "custom" && (!customGoal.trim() || !examples.trim()))
        return setError("Define your custom goal and add 2-3 example calls.");
    }
    if (step === 0 && sameVersion) return setError("Pick two different versions.");
    setStep(step + 1);
  };

  return (
    <>
      <PageTitle
        eyebrow="EXPERIMENT / SETUP"
        title="A good test starts with a clear question."
        description="Pick what to move, change one thing, and keep everything else watched."
        action={
          <Pill tone={locked ? "blue" : "neutral"}>
            {locked ? <Lock size={11} /> : null}
            {locked ? "Definition locked" : "Draft experiment"}
          </Pill>
        }
      />
      <Reveal show={locked}>
        <div className="locked-banner">
          <Lock size={16} />
          <span>
            Definition locked. Changes would invalidate the comparison once a test starts.
          </span>
        </div>
      </Reveal>
      <div className="exp-name-wrap">
        <label className="eyebrow" htmlFor="exp-name">
          EXPERIMENT NAME
        </label>
        <input
          id="exp-name"
          className="exp-name-input"
          value={name}
          disabled={locked}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-stepper">
        {steps.map((s, i) => (
          <Button
            variant="ghost"
            key={s}
            className={step === i ? "active" : ""}
            onClick={() => setStep(i)}
          >
            <span className="step-number">{i < step ? <Check size={11} /> : i + 1}</span>
            {s}
          </Button>
        ))}
      </div>
      {step === 0 && (
        <FadeIn>
          <>
            <section className="setup-card">
              <h2>What are we trying to move?</h2>
              <p className="helper">Pick the one number this experiment should improve.</p>
              <div className="goal-grid" role="radiogroup" aria-label="Experiment goal">
                {goals.map((g) => (
                  <button
                    type="button"
                    key={g.id}
                    role="radio"
                    aria-checked={goal === g.id}
                    className={`goal-card ${goal === g.id ? "selected" : ""} ${
                      g.id === "custom" ? "custom" : ""
                    }`}
                    disabled={locked}
                    onClick={() => {
                      setGoal(g.id);
                      if (g.id !== "custom") setPrimaryMetric(g.label);
                    }}
                  >
                    <div className="goal-head">
                      <strong>{g.label}</strong>
                      {goal === g.id ? (
                        <Pill tone="blue">Selected</Pill>
                      ) : g.baseline ? (
                        <Pill>{g.baseline}</Pill>
                      ) : null}
                    </div>
                    <span>{g.desc}</span>
                  </button>
                ))}
              </div>
              <Reveal show={goal === "custom"}>
                <div className="mt-5">
                  <label className="field-label" htmlFor="custom-goal">
                    Define your goal
                  </label>
                  <textarea
                    id="custom-goal"
                    rows={2}
                    className="form-input"
                    value={customGoal}
                    placeholder="What should improve, in plain language?"
                    onChange={(e) => setCustomGoal(e.target.value)}
                  />
                  <label className="field-label mt-4" htmlFor="goal-examples">
                    2-3 example calls
                  </label>
                  <input
                    id="goal-examples"
                    className="form-input"
                    value={examples}
                    placeholder="e.g. seller asks for a callback, seller agrees to meet…"
                    onChange={(e) => setExamples(e.target.value)}
                  />
                </div>
              </Reveal>
              <div className="mt-5">
                <label className="field-label" htmlFor="primary-metric">
                  Primary metric
                </label>
                <input
                  id="primary-metric"
                  className="form-input"
                  value={goal === "custom" ? customGoal : primaryMetric}
                  disabled={locked}
                  placeholder="Your primary metric"
                  onChange={(e) =>
                    goal === "custom"
                      ? setCustomGoal(e.target.value)
                      : setPrimaryMetric(e.target.value)
                  }
                />
                <p className="field-help">This becomes the number the scorecard judges first.</p>
              </div>
              <div className="chip-strip">
                <Info size={14} />
                <span>Always watched, so the goal can’t break anything else:</span>
                {guardrails.map((g) => (
                  <Pill key={g} tone={g === atRisk ? "amber" : "neutral"}>
                    {g}
                    {g === atRisk ? " · at risk" : ""}
                  </Pill>
                ))}
              </div>
            </section>
            <section className="setup-card">
              <div className="section-heading mb-0">
                <div>
                  <h2 className="text-[16px]">What are we changing?</h2>
                  <p className="helper mb-0 mt-[7px]">
                    Pick the two versions to compare, then review the exact prompt diff.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <DiffCounts a={basePrompt} b={variant} />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={locked}
                    onClick={() => setEditing(!editing)}
                  >
                    {editing ? <GitCompareArrows /> : <Pencil />}
                    {editing ? "Review diff" : "Edit variant"}
                  </Button>
                </div>
              </div>
              <div className="field-grid mt-4 mb-3">
                <div>
                  <label className="field-label">Baseline (left)</label>
                  <ChipSelect
                    value={baseId}
                    onChange={setBaseId}
                    ariaLabel="Baseline version"
                    disabled={locked}
                    options={versionOptions}
                  />
                </div>
                <div>
                  <label className="field-label">Challenger (right)</label>
                  <ChipSelect
                    value={challengerId}
                    onChange={setChallengerId}
                    ariaLabel="Challenger version"
                    disabled={locked}
                    options={versionOptions}
                  />
                </div>
              </div>
              <Reveal show={sameVersion}>
                <Note>Choose two different versions to see a diff.</Note>
              </Reveal>
              <DiffView
                a={basePrompt}
                b={variant}
                aTitle={`${baseId} · ${baseId === "A" ? "Control · main_vani (production)" : versionName(baseId)}`}
                bTitle={`${challengerId} · Variant · ${versionName(challengerId)}`}
                mode={editing ? "edit" : "diff"}
                onBChange={setVariant}
                lockA
              />
              <p className="field-help">
                The left version is read-only. Change the challenger, or paste a full new prompt.
              </p>
              <div className="why-row">
                <Star size={14} />
                <span>Why this change:</span>
                <input
                  className="why-input"
                  aria-label="Hypothesis note"
                  value={why}
                  placeholder="Optional hypothesis note"
                  onChange={(e) => setWhy(e.target.value)}
                />
                <Button
                  variant="link"
                  size="sm"
                  onClick={() =>
                    toast("Suggested ideas · shorten the opening, ask directly, offer a callback")
                  }
                >
                  <Lightbulb size={13} />
                  More suggested ideas
                </Button>
              </div>
            </section>
          </>
        </FadeIn>
      )}
      {step === 1 && (
        <FadeIn>
          <section className="setup-card">
            <h2>Pre-prod gate</h2>
            <p className="helper">
              Smoke tests on synthetic scenarios must pass before live traffic. Results come from
              the backend; nothing is assumed.
            </p>
            <PreprodGatePanel versionId={challengerId} />
          </section>
        </FadeIn>
      )}
      {step === 2 && (
        <FadeIn>
          <RolloutPlan
            startPct={startPct}
            setStartPct={setStartPct}
            risk={risk}
            setRisk={setRisk}
            baseId={baseId}
            challengerId={challengerId}
            locked={locked}
          />
        </FadeIn>
      )}
      {step === 3 && (
        <FadeIn>
          <section className="setup-card">
            <h2>Decision</h2>
            <p className="helper">Starting locks the definition. This prototype places no calls.</p>
            {[
              ["Experiment", name],
              ["Goal", goal === "custom" ? customGoal || "Custom goal" : primaryMetric],
              ["Change", `${versionName(challengerId)} vs ${versionName(baseId)}`],
              ["Start size", `${startPct}% · ${bucketLabel(startPct)}`],
              ["Split", `${startPct}% ${versionName(challengerId)} (${bucketLabel(startPct)}) · ${100 - startPct}% ${versionName(baseId)}`],
              ["Risk appetite", RISK_LABEL[risk]],
              ["Decision method", "Staged rollout engine (mSPRT gates, automatic scale-down)"],
            ].map(([label, value]) => (
              <div className="form-summary" key={label}>
                <span>{label}</span>
                <strong className="max-w-[65%] text-right">{value}</strong>
              </div>
            ))}
            <div className="pending-slot">
              Promote only with defensible evidence and passing guardrails. The product team will
              finalise the decision rule.
            </div>
            <Note>
              Start runs a UI demonstration only. Pre-prod evaluations precede live traffic.
            </Note>
          </section>
        </FadeIn>
      )}
      <Reveal show={!!error}>
        <p className="validation-error">{error}</p>
      </Reveal>
      <div className="form-actions">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => toast.success("Draft saved · demo only")}>
            <Save />
            Save draft
          </Button>
          {step < 3 ? (
            <Button onClick={advance}>
              {step === 0
                ? "Continue to pre-prod gate"
                : step === 1
                  ? "Proceed to rollout plan"
                  : "Review decision"}
              <ArrowRight />
            </Button>
          ) : locked ? (
            <Button asChild>
              <Link to="/pipeline">
                View live pipeline
                <ArrowRight />
              </Link>
            </Button>
          ) : (
            <Button
              disabled={starting}
              onClick={() => {
                setStarting(true);
                setError("");
                createAndStart({
                  name,
                  goal: goal === "custom" ? customGoal || "Custom goal" : primaryMetric,
                  primaryMetric: goal === "callback" ? "callbackRequested" : "meetingFixed",
                  guardrails,
                  baselineVersionId: baseId,
                  challengerVersionId: challengerId,
                  riskAppetite: risk,
                  startPct,
                })
                  .then((exp) => {
                    setLocked(true);
                    toast.success(`Experiment started at ${startPct}% · definition locked`);
                    selectExperiment(exp.id, "/performance");
                  })
                  .catch((e: unknown) =>
                    setError(`Could not start: ${e instanceof Error ? e.message : "backend unreachable"}`),
                  )
                  .finally(() => setStarting(false));
              }}
            >
              <Lock />
              {starting ? "Starting…" : "Create and start"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
