// Staged rollout (10 -> 25 -> 50 -> 100) driven by the backend rollout engine.
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Ban, Check, Play, RotateCcw, Square, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChipSelect } from "./chips";
import { Note, Pill, Tip } from "./common";
import { RolloutAudit } from "./rollout-audit";
import { RolloutSimulation } from "./rollout-sim";
import {
  NO_DATA,
  PRIMARY_OPTIONS,
  SECONDARY_BY_PRIMARY,
  STATUS_LABEL,
  STATUS_TONE,
  availableActions,
  fmtNum,
  fmtP,
  fmtPct,
  fmtPts,
  stageStates,
} from "./rollout-format";
import type { RolloutState } from "@/lib/api-contract";
import {
  getRolloutState,
  listExperiments,
  listRollouts,
  rolloutAction,
  startRollout,
  type RolloutAction,
} from "@/lib/rollout-api";

type Load =
  | { kind: "loading" }
  | { kind: "offline" }
  | { kind: "none"; experimentId: string | null }
  | { kind: "ready"; experimentId: string; state: RolloutState };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Request failed");

export function RolloutPanel() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [primary, setPrimary] = useState("meetingFixed");
  const [busy, setBusy] = useState(false);
  const [auditKey, setAuditKey] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const runs = await listRollouts();
      const run = runs[0];
      if (run) {
        const state = await getRolloutState(run.experimentId);
        setPrimary(state.run.primary);
        setLoad({ kind: "ready", experimentId: run.experimentId, state });
        return;
      }
      const exps = await listExperiments();
      setLoad({ kind: "none", experimentId: exps[0]?.id ?? null });
    } catch {
      setLoad({ kind: "offline" });
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      await refresh();
      setAuditKey((k) => k + 1);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rollout" aria-labelledby="rollout-title">
      <div className="section-heading">
        <div>
          <div className="section-kicker">
            <h2 id="rollout-title">Staged rollout</h2>
            {load.kind === "ready" && <Pill tone="green">Live backend</Pill>}
            {load.kind === "ready" && load.state.run.simulated && (
              <Pill tone="amber">SIMULATED run</Pill>
            )}
          </div>
          <p>
            10% to 25% to 50% to 100%. Each step needs evidence and healthy guardrails; the last
            step needs your approval.
          </p>
        </div>
      </div>
      <div className="rollout-primary">
        <span className="field-label">Primary metric</span>
        <ChipSelect
          value={primary}
          onChange={setPrimary}
          options={PRIMARY_OPTIONS}
          ariaLabel="Primary metric"
          max={4}
          disabled={load.kind === "ready"}
        />
        {load.kind === "ready" && (
          <span className="neutral-text text-[10px]">Fixed once the rollout has started.</span>
        )}
      </div>

      {load.kind === "loading" && <p className="neutral-text">Loading rollout...</p>}
      {load.kind === "offline" && (
        <Note>
          Backend not reachable, so there is no live rollout to show. You can still run the
          simulation below once the backend is up.
        </Note>
      )}
      {load.kind === "none" && (
        <div className="rollout-empty">
          <p className="neutral-text">No rollout has been started.</p>
          <Button
            disabled={busy || !load.experimentId}
            onClick={() =>
              load.experimentId &&
              void run("Rollout started", () => startRollout(load.experimentId!, { primary }))
            }
          >
            <Play /> Start staged rollout
          </Button>
          {!load.experimentId && <p className="neutral-text">Create an experiment first.</p>}
        </div>
      )}
      {load.kind === "ready" && (
        <RolloutBody
          experimentId={load.experimentId}
          state={load.state}
          busy={busy}
          onAction={(a, label) => void run(label, () => rolloutAction(load.experimentId, a))}
          auditKey={auditKey}
        />
      )}
      <RolloutSimulation primary={primary} />
    </section>
  );
}

function RolloutBody({
  experimentId,
  state,
  busy,
  onAction,
  auditKey,
}: {
  experimentId: string;
  state: RolloutState;
  busy: boolean;
  onAction: (a: RolloutAction, label: string) => void;
  auditKey: number;
}) {
  const { run, evidence, nextGate } = state;
  const can = availableActions(run.status, run.phase, run.stagePct, run.pmApproved);
  const p = evidence.primary;
  const cov = evidence.validity.coverage;
  return (
    <>
      <div className="stage-track" role="list" aria-label="Rollout stages">
        {stageStates(run.stagePct).map((s) => (
          <motion.div
            layout="position"
            key={s.stage}
            role="listitem"
            aria-current={s.state === "current" ? "step" : undefined}
            className={`stage-step stage-${s.state}`}
          >
            <strong>
              {s.state === "done" && <Check size={12} />} {s.stage}%
            </strong>
            <small>
              {s.state === "current" ? "Current" : s.state === "done" ? "Passed" : "Next"}
            </small>
          </motion.div>
        ))}
      </div>
      <div className="rollout-summary">
        <Pill
          tone={run.status === "running" ? "green" : run.status === "rolled_back" ? "red" : "neutral"}
        >
          {run.status.replace("_", " ")}
        </Pill>
        <span>
          Traffic: control {run.traffic.control}% / challenger {run.traffic.treatment}%
          {run.phase === "holdback" && " (holdback phase)"}
        </span>
        {run.verdict && <Pill tone="blue">Verdict: {run.verdict.replace(/_/g, " ")}</Pill>}
      </div>
      <p className="next-gate" aria-live="polite">
        <strong>Next gate:</strong> {nextGate ?? "None. This rollout has finished."}
      </p>

      <div className="rollout-kpis">
        <Tip label={`${p.method}. alpha ${p.alpha}, tau ${p.tau}`}>
          <div tabIndex={0}>
            <small>Primary lift (challenger - control)</small>
            <strong>{fmtPts(p.liftPts)}</strong>
            <small>
              {fmtPct(p.rateTreatment)} vs {fmtPct(p.rateControl)} · {p.nTreatment}/{p.nControl} calls
            </small>
          </div>
        </Tip>
        <div>
          <small>Evidence for benefit (Lambda)</small>
          <strong>{fmtNum(p.peakLambdaBenefit)}</strong>
          <small>
            p = {fmtP(p.pBenefit)} · harm Lambda {fmtNum(p.peakLambdaHarm)}
          </small>
        </div>
        <div>
          <small>Holdback</small>
          <strong>
            {evidence.holdback ? fmtPts(evidence.holdback.liftPts) : `${run.settings.holdbackPct}% planned`}
          </strong>
          <small>
            {evidence.holdback
              ? "Lift measured on held-back control"
              : `After 100%, ${run.settings.holdbackPct}% stays on control for ${run.settings.holdbackDays} days`}
          </small>
        </div>
      </div>

      <div className="validity-row">
        <Tip label={evidence.validity.srm.method}>
          <span tabIndex={0}>
            <Pill tone={evidence.validity.srm.failed ? "red" : "green"}>
              SRM p = {fmtP(evidence.validity.srm.pValue)} {evidence.validity.srm.failed ? "FAILED" : "ok"}
            </Pill>
          </span>
        </Tip>
        <Pill tone={cov.ok ? "green" : "amber"}>
          Outcome coverage {fmtPct(cov.share === null ? null : cov.share * 100, 0)} (floor{" "}
          {Math.round(cov.floor * 100)}%)
        </Pill>
        <Pill tone={(evidence.failedCalls.pct ?? 0) > 2 ? "red" : "neutral"}>
          Failed calls {fmtPct(evidence.failedCalls.pct)}
        </Pill>
      </div>

      <h3 className="rollout-h3">Guardrails</h3>
      <div className="guardrail-grid">
        {evidence.guardrails.map((g) => (
          <Tip key={g.id} label={g.reason || g.rule} side="top">
            <div className="guardrail-card" tabIndex={0}>
              <div className="flex justify-between gap-2">
                <strong>{g.label}</strong>
                <Pill tone={STATUS_TONE[g.status]}>{STATUS_LABEL[g.status]}</Pill>
              </div>
              <small>
                {fmtPct(g.rateTreatmentPct)} vs {fmtPct(g.rateControlPct)}
                {g.excessPts !== null && ` · ${fmtPts(g.excessPts)}`}
              </small>
              {!g.evidenceSufficient && <small>Not enough data yet</small>}
            </div>
          </Tip>
        ))}
      </div>

      <h3 className="rollout-h3">
        Secondary metrics <small className="neutral-text">(descriptive only, never used for decisions)</small>
      </h3>
      <div className="score-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Control</th>
              <th>Challenger</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            {evidence.secondary.map((s) => {
              const show = (v: number | null, diff = false) =>
                v === null ? NO_DATA : s.kind === "rate" ? (diff ? fmtPts(v) : fmtPct(v)) : `${v.toFixed(0)} s`;
              return (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td>{show(s.controlValue)}</td>
                  <td>{show(s.treatmentValue)}</td>
                  <td>{show(s.diff, true)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="neutral-text text-[10px]">
        Tracked for this primary: {(SECONDARY_BY_PRIMARY[run.primary] ?? []).join(", ")}.
      </p>

      <div className="rollout-actions">
        <Tip label="Allowed at the 50% gate once the final evidence bar is met">
          <span>
            <Button disabled={busy || !can.approve} onClick={() => onAction("approve", "Approved: 50% to 100%")}>
              <ThumbsUp /> Approve 50% to 100%
            </Button>
          </span>
        </Tip>
        <Button variant="outline" disabled={busy || !can.tick} onClick={() => onAction("tick", "Evaluated")}>
          <RotateCcw /> Evaluate now
        </Button>
        <Button variant="outline" disabled={busy || !can.stop} onClick={() => onAction("stop", "Rollout stopped")}>
          <Square /> Stop
        </Button>
        <Button
          variant="destructive"
          disabled={busy || !can.rollback}
          onClick={() => onAction("rollback", "Rolled back to control")}
        >
          <Ban /> Roll back
        </Button>
      </div>
      <RolloutAudit experimentId={experimentId} refreshKey={auditKey} />
    </>
  );
}
