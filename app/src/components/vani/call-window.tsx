import { useEffect, useRef, useState } from "react";
import {
  Captions,
  Check,
  ChevronDown,
  Circle,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Phone,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, Modal, Pill, Tip } from "./common";
import { FadeIn, Reveal } from "./motion-kit";
import {
  AUDIT_STAGES,
  auditClient,
  type AuditHandle,
  type AuditProgressEvent,
  type AuditStageId,
  type CallTurn,
} from "./audit-client";
import { createCallSession, type CallSession, type CallSessionState } from "./call-session";
import { versions } from "./data";
import type { VersionId } from "./performance-data";
import type { KpiKey } from "@/lib/api-contract";

type StageStatus = "pending" | "running" | "done" | "error";
type AuditResult = Extract<AuditProgressEvent, { type: "result" }>;
type Phase = "call" | "audit";

const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "done") return <Check size={14} />;
  if (status === "error") return <AlertCircle size={14} />;
  if (status === "running") return <Loader2 size={14} className="animate-spin" />;
  return <Circle size={14} />;
}

function AuditProgress({ stages, result, error, startedAt, onClose, onRetry }: {
  stages: Record<AuditStageId, StageStatus>;
  result: AuditResult | null;
  error: string;
  startedAt: number | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt || result || error) return;
    const update = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt, result, error]);
  const progress = AUDIT_STAGES.reduce((count, stage) => count + (stages[stage.id] === "done" ? 1 : stages[stage.id] === "running" ? 0.5 : 0), 0);
  const activeStage = AUDIT_STAGES.find((stage) => stages[stage.id] === "running");
  const kpiLabels: Record<KpiKey, string> = {
    meetingFixed: "Meeting fixed",
    callDuration: "Call duration",
    answerRate: "Answer rate",
    locationConfirmed: "Location confirmed",
    callbackRequested: "Callback requested",
  };
  const kpiKeys = Object.keys(kpiLabels) as KpiKey[];
  const calculatedOverall = result?.weights
    ? kpiKeys.reduce((sum, key) => sum + result.kpis[key] * result.weights![key], 0)
    : null;

  return (
    <div className="audit-progress" aria-live="polite">
      {!result && !error && <div className="audit-live-heading">
        <span className="audit-live-indicator"><i className="live-dot" /> LIVE AUDIT</span>
        <span>{formatClock(elapsed)} elapsed</span>
      </div>}
      <Progress value={(progress / AUDIT_STAGES.length) * 100} aria-label="Audit progress" />
      {activeStage && !result && !error && <p className="audit-current-stage">{activeStage.detail}</p>}
      <ol className="audit-stages">
        {AUDIT_STAGES.map((stage, index) => <li key={stage.id} data-status={stages[stage.id]}>
          <span className="audit-stage-marker"><StageIcon status={stages[stage.id]} /></span>
          <span className="audit-stage-copy">
            <strong>{stage.label}</strong>
            <small>{stages[stage.id] === "done" ? "Complete" : stage.detail}</small>
          </span>
          {index < AUDIT_STAGES.length - 1 && <span className="audit-stage-line" aria-hidden="true" />}
        </li>)}
      </ol>
      {error && <div className="audit-error" role="alert">
        <AlertCircle size={18} />
        <div><strong>Audit could not be completed</strong><p>{error}</p></div>
        <Button variant="outline" onClick={onRetry}>Retry audit</Button>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>}
      {result && <section className="audit-result" aria-label="Audit result">
        <header className="audit-result-summary">
          <div><span>OVERALL SCORE</span><strong>{result.overall.toFixed(1)}<small> / 5</small></strong></div>
          <Pill tone={result.guardrailsPassed ? "green" : "red"}>
            {result.guardrailsPassed ? "Guardrails passed" : "Guardrail flagged"}
          </Pill>
        </header>
        <div className="audit-section-heading"><h3>KPI breakdown</h3><span>Score times rubric weight</span></div>
        {kpiKeys.map((key) => {
          const rationale = result.kpiBreakdown?.[key];
          const weight = result.weights?.[key];
          return <article className="audit-kpi-row" key={key}>
            <div className="audit-kpi-topline"><strong>{kpiLabels[key]}</strong><span>{result.kpis[key]} / 5</span></div>
            <div className="audit-kpi-meta">
              <span>Weight {weight === undefined ? "unavailable" : `${(weight * 100).toFixed(0)}%`}</span>
              <span>Contribution {weight === undefined ? "unavailable" : (result.kpis[key] * weight).toFixed(2)}</span>
            </div>
            <p>{rationale?.reason ?? "The auditor did not provide a written rationale for this KPI."}</p>
            {rationale?.evidence && <blockquote>Transcript evidence: "{rationale.evidence}"</blockquote>}
          </article>;
        })}
        {result.weights && calculatedOverall !== null
          ? <p className="audit-calculation">
            Weighted calculation: {kpiKeys.map((key) => `${result.kpis[key]} x ${(result.weights![key] * 100).toFixed(0)}%`).join(" + ")} = {calculatedOverall.toFixed(2)}, rounded to <strong>{result.overall.toFixed(1)} / 5</strong>
          </p>
          : <p className="audit-calculation">Rubric weights were not included, so this total cannot be reconstructed from the saved audit.</p>}
        <div className="audit-section-heading"><h3>Guardrail checks</h3></div>
        {(result.guardrails ?? []).length > 0 ? result.guardrails!.map((guardrail) => <div className="audit-guardrail-row" key={guardrail.name}>
          {guardrail.passed ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <div><strong>{guardrail.name.replaceAll("_", " ")}</strong><p>{guardrail.reason}</p></div>
          <Pill tone={guardrail.passed ? "green" : "red"}>{guardrail.passed ? "Passed" : "Flagged"}</Pill>
        </div>) : <p className="audit-calculation">Guardrail details are unavailable for this audit.</p>}
        {result.notes && <p className="audit-notes">Auditor notes: {result.notes}</p>}
      </section>}
      <div className="flex justify-end">
        {!error && <Button variant={result ? "default" : "outline"} onClick={onClose}>{result ? "Done" : "Cancel audit"}</Button>}
      </div>
    </div>
  );
}

const WAVE_BARS = [0.5, 0.8, 0.6, 1, 0.7, 0.9, 0.55, 0.85, 0.65, 1, 0.75, 0.6, 0.9, 0.7, 0.8, 0.5];
const MIN_BAR_PX = 4;
const MAX_BAR_PX = 28;
// The SDK reports small RMS values; scale up so normal speech fills the bars.
const LEVEL_GAIN = 4;

function Waveform({ level, active }: { level: number; active: boolean }) {
  const shown = active ? Math.min(1, level * LEVEL_GAIN) : 0;
  return (
    <div className="call-wave" aria-hidden="true">
      {WAVE_BARS.map((factor, i) => (
        <i
          key={i}
          style={{
            height: `${MIN_BAR_PX + shown * factor * (MAX_BAR_PX - MIN_BAR_PX)}px`,
            opacity: active ? 1 : 0.5,
          }}
        />
      ))}
    </div>
  );
}

const STATUS_TEXT: Record<CallSessionState, string> = {
  idle: "Ready to start",
  connecting: "Connecting…",
  listening: "Listening…",
  speaking: "Speaking…",
  ended: "Call ended",
  unavailable: "Not set up",
  error: "Something went wrong",
};

export function CallWindow({
  version,
  onClose,
}: {
  version: VersionId | null;
  onClose: () => void;
}) {
  const info = versions.find((v) => v.id === version);
  const [phase, setPhase] = useState<Phase>("call");
  const [turns, setTurns] = useState<CallTurn[]>([]);
  const [sessionState, setSessionState] = useState<CallSessionState>("idle");
  const [level, setLevel] = useState(0);
  const [errorText, setErrorText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [muted, setMuted] = useState(false);
  const [stages, setStages] = useState<Record<AuditStageId, StageStatus>>(initialStages);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [auditError, setAuditError] = useState("");
  const [auditStartedAt, setAuditStartedAt] = useState<number | null>(null);
  const handle = useRef<AuditHandle | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<CallSession | null>(null);
  const live = sessionState === "listening" || sessionState === "speaking";
  const ended = sessionState === "ended";

  // One session per opened version; it is stopped when the window closes or the version changes.
  useEffect(() => {
    if (!version) return;
    setPhase("call");
    setTurns([]);
    setSessionState("idle");
    setLevel(0);
    setErrorText("");
    setMuted(false);
    setSeconds(0);
    setStages(initialStages());
    setResult(null);
    setAuditError("");
    setAuditStartedAt(null);
    sessionRef.current = createCallSession(version, {
      onState: setSessionState,
      onTranscript: (turn) => setTurns((prev) => [...prev, turn]),
      onLevel: (next) => setLevel(Math.round(next * 100) / 100),
      onError: setErrorText,
    });
    return () => {
      void sessionRef.current?.stop();
      sessionRef.current = null;
      handle.current?.cancel();
    };
  }, [version]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [turns]);

  const startCall = () => {
    setErrorText("");
    void sessionRef.current?.start();
  };
  const toggleMute = () => {
    setMuted(!muted);
    sessionRef.current?.setMuted(!muted);
  };
  const endCall = async () => {
    await sessionRef.current?.stop();
    setConfirmEnd(true);
  };

  const answered = turns.some((t) => t.speaker === "seller");
  const runAudit = () => {
    if (!version) return;
    handle.current?.cancel();
    setConfirmEnd(false);
    setPhase("audit");
    setAuditError("");
    setResult(null);
    setStages(initialStages());
    setAuditStartedAt(Date.now());
    handle.current = auditClient.submit(
      { version, transcript: turns, durationSec: seconds, answered },
      (event) => {
        if (event.type === "stage") {
          setStages((prev) => ({ ...prev, [event.stage]: event.status }));
        } else if (event.type === "result") {
          setResult(event);
        } else {
          setAuditError(event.message);
          setStages((prev) => {
            const active = AUDIT_STAGES.find((stage) => prev[stage.id] === "running");
            return active
              ? { ...prev, [active.id]: "error" }
              : { ...prev, transcript: "error" };
          });
        }
      },
    );
  };
  const submitAudit = () => runAudit();

  return (
    <>
      <Modal
        open={version !== null}
        onOpenChange={(open) => !open && onClose()}
        title={phase === "call" ? `Call with Version ${version}` : "Auditing your call"}
        description={phase === "call"
          ? "Talk to the voice agent with your microphone. The call is audited from its transcript."
          : "Checking safety, scoring call outcomes, calculating the overall score, and saving the result."}
      >
        <FadeIn key={phase}>
          {phase === "call" && info ? (
            <div className="call-surface">
              <span
                className={`call-avatar version-${info.id} ${sessionState === "speaking" ? "speaking" : ""}`}
              >
                <img src={info.image} alt={info.name} width="96" height="96" />
              </span>
              <strong className="call-name">{info.name}</strong>
              <small>{info.title}</small>
              {live ? (
                <Pill tone="green">
                  <i className="live-dot" />
                  {formatClock(seconds)}
                </Pill>
              ) : (
                <Pill>
                  {ended ? `${formatClock(seconds)} recorded` : STATUS_TEXT[sessionState]}
                </Pill>
              )}
              <Waveform level={level} active={live && !muted} />
              <span className="call-status" aria-live="polite">
                {muted && live ? "You are muted" : STATUS_TEXT[sessionState]}
              </span>
              <Reveal show={sessionState === "unavailable"}>
                <p className="call-empty">
                  Voice agent for Version {version} is not set up yet. Ask an admin to add its
                  Sarvam app.
                </p>
              </Reveal>
              <Reveal show={!!errorText}>
                <p className="validation-error">{errorText}</p>
              </Reveal>
              {sessionState === "idle" ||
              sessionState === "unavailable" ||
              sessionState === "error" ? (
                <Button onClick={startCall} disabled={sessionState === "unavailable"}>
                  <Phone />
                  {sessionState === "error" ? "Try again" : "Start call"}
                </Button>
              ) : ended ? (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>
                    Close without audit
                  </Button>
                  <Button onClick={() => setConfirmEnd(true)} disabled={turns.length === 0}>
                    Submit for audit
                  </Button>
                </div>
              ) : (
                <div className="call-controls">
                  <Tip side="top" label={muted ? "Unmute" : "Mute"}>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-pressed={muted}
                      aria-label={muted ? "Unmute" : "Mute"}
                      onClick={toggleMute}
                      disabled={!live}
                    >
                      {muted ? <MicOff /> : <Mic />}
                    </Button>
                  </Tip>
                  <Tip side="top" label="End call">
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="call-end"
                      aria-label="End call"
                      onClick={() => void endCall()}
                    >
                      <PhoneOff />
                    </Button>
                  </Tip>
                </div>
              )}
              <Collapsible className="call-captions">
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm">
                    <Captions />
                    Live captions
                    <ChevronDown />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="call-log" role="log" aria-label="Captions">
                    {turns.length === 0 && <p className="neutral-text">No speech captured yet.</p>}
                    {turns.map((t, i) => (
                      <div key={i} className={`call-turn ${t.speaker}`}>
                        <small>{t.speaker === "bot" ? "VANI" : "You (seller)"}</small>
                        <p>{t.text}</p>
                      </div>
                    ))}
                    <div ref={endRef} />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : (
            <AuditProgress
              stages={stages}
              result={result}
              error={auditError}
              startedAt={auditStartedAt}
              onClose={onClose}
              onRetry={runAudit}
            />
          )}
        </FadeIn>
      </Modal>
      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit for audit?</AlertDialogTitle>
            <AlertDialogDescription>
              The auditor scores this transcript on guardrails and KPIs. You can watch it progress.
              {turns.length === 0 ? " No speech was captured, so there is nothing to audit." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Decide later</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmEnd(false);
                onClose();
              }}
            >
              End without audit
            </Button>
            <AlertDialogAction onClick={submitAudit} disabled={turns.length === 0}>
              Submit for audit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function initialStages(): Record<AuditStageId, StageStatus> {
  return {
    transcript: "pending",
    guardrails: "pending",
    kpis: "pending",
    overall: "pending",
    saved: "pending",
  };
}
