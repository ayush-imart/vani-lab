// Staged rollout policy (PM spec "Scale up and down"). Pure: (run state, evidence, now) -> decision.
//
// Order of evaluation (safest first; validity gates run before any statistical decision):
//   1 split check (SRM)           p < 0.001                     -> pause and freeze, alert PM
//   2 failed calls                > 2% of treatment calls       -> roll back to 0%
//   3 outcome coverage            below the floor               -> hold decisions
//   4 proven harm                 primary Lambda(harm) >= 20, or any guardrail rollback -> roll back to 0%
//   5 holdback phase              shrink/negative lift checks, then complete after holdbackDays
//   6 step down                   lift <= -1 pt with moderate evidence (Lambda(harm) >= 5), or a
//                                 guardrail on watch/blocked for more than 24 h -> one stage down
//   7 scale up                    stage gates below, after min stage time and the 24 h cooldown
//   8 window / max length         end the test and keep control
// Scale-downs and rollbacks never wait for a human or for the cooldown. Scale-ups never skip a gate.
import type { RolloutEvidenceDto } from "../contract";
import { ENGINE_GUARDS, ROLLOUT, STAGES, STATS, type PmSettings } from "../spec";

export type Phase = "ramp" | "holdback" | "done";
export type Status = "scheduled" | "running" | "paused" | "completed" | "rolled_back" | "ended";
export type Verdict = "winner" | "losing" | "inconclusive" | "rolled_back_manually";
export type Action = "start" | "hold" | "advance" | "promote" | "step_down" | "rollback" | "pause" | "resume" | "end" | "complete" | "alert" | "approve";

export type PolicyRun = {
  status: Status;
  phase: Phase;
  stagePct: number; // treatment % in force
  stages: readonly number[]; // ramp stages (treatment %)
  startedAtMs: number;
  stageEnteredAtMs: number;
  lastChangeAtMs: number;
  windowEndMs: number | null;
  pmApproved: boolean;
  settings: PmSettings;
  watchSince: Readonly<Record<string, number>>;
  holdback: { startedAtMs: number; liftAtPromotionPts: number | null; alerted: boolean } | null;
};

export type Trigger =
  | "gate_met" | "gates_not_met" | "cooldown" | "min_stage_time" | "insufficient_data" | "awaiting_pm_approval"
  | "coverage_below_floor" | "srm_failed" | "failed_calls_over_limit" | "primary_proven_worse"
  | "guardrail_proven_worse" | "lift_below_step_down" | "guardrail_on_watch" | "max_length_reached"
  | "window_ended" | "holdback_lift_shrank" | "holdback_lift_negative" | "holdback_finished" | "not_running" | "monitoring";

export type PolicyDecision = {
  action: Action;
  trigger: Trigger;
  reason: string;
  toStagePct: number;
  toPhase: Phase;
  toStatus: Status;
  verdict?: Verdict;
  freeze?: boolean;
  liftAtPromotionPts?: number | null;
  alerted?: boolean;
};

const HOUR_MS = 3_600_000;
const LN_PROVEN = Math.log(STATS.provenBenefitLambda);
const LN_MODERATE = Math.log(STATS.moderateEvidenceLambda);
const fmt = (n: number | null, digits = 2) => (n === null ? "n/a" : n.toFixed(digits));
const lnOf = (lambda: number) => Math.log(Math.max(lambda, 1e-300));

export function stageAfter(run: Pick<PolicyRun, "stages" | "stagePct">): number | undefined {
  const i = run.stages.indexOf(run.stagePct);
  return i < 0 ? undefined : run.stages[i + 1];
}
export function stageBefore(run: Pick<PolicyRun, "stages" | "stagePct">): number | undefined {
  const i = run.stages.indexOf(run.stagePct);
  return i > 0 ? run.stages[i - 1] : undefined;
}

// Ramp through 10% units up to 90%; the final gated promotion goes to 100% before holdback.
export const rampStages = (startPct: number): number[] => [startPct, ...STAGES.filter((s) => s > startPct && s < 100)];

const holdOf = (run: PolicyRun, trigger: Trigger, reason: string): PolicyDecision => ({
  action: "hold", trigger, reason, toStagePct: run.stagePct, toPhase: run.phase, toStatus: run.status,
});
const rollbackOf = (trigger: Trigger, reason: string, verdict: Verdict, action: Action = "rollback"): PolicyDecision => ({
  action, trigger, reason, toStagePct: 0, toPhase: "done", toStatus: action === "end" ? "ended" : "rolled_back", verdict,
});

export type GateCheck = { met: boolean; description: string; missing: string[] };

// What the NEXT scale-up needs, evaluated on the statistics only (time and approval are separate).
export function gateCheck(run: PolicyRun, ev: RolloutEvidenceDto): GateCheck {
  const s = run.settings;
  const lift = ev.primary.liftPts;
  const peakBenefit = ev.primary.peakLambdaBenefit;
  const allOk = ev.guardrails.every((g) => g.status === "ok" || g.status === "not_applicable");
  const missing: string[] = [];
  const enough = ev.primary.nControl >= ENGINE_GUARDS.minCallsPerArmToAdvance && ev.primary.nTreatment >= ENGINE_GUARDS.minCallsPerArmToAdvance;
  if (!enough) missing.push(`at least ${ENGINE_GUARDS.minCallsPerArmToAdvance} judged calls per arm (engine guard)`);
  let description: string;
  if (run.stagePct < ROLLOUT.gates.moderate.atStage) {
    description = `lift >= ${s.harmlessGateMinLiftPts} pt and all guardrails ok`;
    if (lift === null || lift < s.harmlessGateMinLiftPts) missing.push(`lift >= ${s.harmlessGateMinLiftPts} pt (now ${fmt(lift)})`);
  } else if (run.stagePct < ROLLOUT.gates.final.atStage) {
    description = `lift >= +${s.moderateGateMinLiftPts} pt, Lambda >= ${s.moderateGateMinLambda} and all guardrails ok`;
    if (lift === null || lift < s.moderateGateMinLiftPts) missing.push(`lift >= +${s.moderateGateMinLiftPts} pt (now ${fmt(lift)})`);
    if (peakBenefit < s.moderateGateMinLambda) missing.push(`Lambda >= ${s.moderateGateMinLambda} (now ${fmt(peakBenefit, 1)})`);
  } else {
    description = `lift >= +${s.smallestWinPts} pt (smallest win), Lambda >= ${STATS.provenBenefitLambda} and all guardrails ok${s.requirePmApproval ? ", then PM approval" : ""}`;
    if (lift === null || lift < s.smallestWinPts) missing.push(`lift >= +${s.smallestWinPts} pt (now ${fmt(lift)})`);
    if (peakBenefit < STATS.provenBenefitLambda) missing.push(`Lambda >= ${STATS.provenBenefitLambda} (now ${fmt(peakBenefit, 1)})`);
  }
  if (!allOk) missing.push("every guardrail ok (" + ev.guardrails.filter((g) => g.status !== "ok" && g.status !== "not_applicable").map((g) => `${g.id}=${g.status}`).join(", ") + ")");
  return { met: missing.length === 0, description, missing };
}

function decideHoldback(run: PolicyRun, ev: RolloutEvidenceDto, now: number): PolicyDecision {
  const hb = run.holdback;
  const h = ev.holdback;
  if (!hb) return holdOf(run, "monitoring", "holdback running");
  const enough = h !== null && h.nControl >= ENGINE_GUARDS.minCallsPerArmForGuardrailStatus && h.nTreatment >= ENGINE_GUARDS.minCallsPerArmForGuardrailStatus;
  const lift = h?.liftPts ?? null;
  const atPromotion = hb.liftAtPromotionPts;
  if (enough && lift !== null && lift < 0 && lnOf(h.peakLambdaHarm) >= LN_MODERATE) {
    return rollbackOf("holdback_lift_negative", `Holdback lift is negative (${fmt(lift)} pts, harm Lambda ${fmt(h.peakLambdaHarm, 1)} >= ${STATS.moderateEvidenceLambda}); rolled back`, "losing");
  }
  const shrank = enough && lift !== null && atPromotion !== null && atPromotion > 0 && lift < atPromotion * (1 - ROLLOUT.scaleDown.holdbackShrinkFraction);
  if ((shrank || (enough && lift !== null && lift < 0)) && !hb.alerted) {
    return {
      ...holdOf(run, "holdback_lift_shrank", `Holdback lift ${fmt(lift)} pts vs ${fmt(atPromotion)} pts at promotion: shrank by more than half${lift !== null && lift < 0 ? " and is negative (weak evidence, alert only)" : ""}. PM alerted`),
      action: "alert", alerted: true,
    };
  }
  if (now >= hb.startedAtMs + run.settings.holdbackDays * 24 * HOUR_MS) {
    return {
      action: "complete", trigger: "holdback_finished", toStagePct: 100, toPhase: "done", toStatus: "completed", verdict: "winner",
      reason: `Holdback of ${run.settings.holdbackDays} days finished; impact reported from the holdback lift (${fmt(lift)} pts)`,
    };
  }
  return holdOf(run, "monitoring", `Holdback: lift ${fmt(lift)} pts so far (${fmt(atPromotion)} pts at promotion)`);
}

export function decide(run: PolicyRun, ev: RolloutEvidenceDto, now: number): PolicyDecision {
  const s = run.settings;
  if (run.status !== "running") return holdOf(run, "not_running", `run is ${run.status}`);

  // 1 split check
  if (ev.validity.srm.failed) {
    return {
      action: "pause", trigger: "srm_failed", freeze: true, toStagePct: run.stagePct, toPhase: run.phase, toStatus: "paused",
      reason: `Split check failed (chi-square p=${fmt(ev.validity.srm.pValue, 5)} < ${STATS.srmPValue}); traffic frozen, PM alerted`,
    };
  }
  // 2 technical rollback
  const f = ev.failedCalls;
  if (f.pct !== null && f.treatmentCalls >= ENGINE_GUARDS.minCallsPerArmToAdvance && f.pct > ROLLOUT.scaleDown.failedCallsMaxPct) {
    return rollbackOf("failed_calls_over_limit", `Failed calls ${fmt(f.pct)}% of treatment calls > ${ROLLOUT.scaleDown.failedCallsMaxPct}%`, "losing");
  }
  // 3 coverage
  if (!ev.validity.coverage.ok) {
    return holdOf(run, "coverage_below_floor", `Outcome coverage ${fmt((ev.validity.coverage.share ?? 0) * 100, 1)}% is below the ${s.coverageFloor * 100}% floor; decisions on hold`);
  }
  // 4 proven harm
  if (lnOf(ev.primary.peakLambdaHarm) >= LN_PROVEN) {
    return rollbackOf("primary_proven_worse", `Primary proven worse than A (harm Lambda ${fmt(ev.primary.peakLambdaHarm, 1)} >= ${STATS.provenHarmLambda}, lift ${fmt(ev.primary.liftPts)} pts); rolled back to 0%, marked Losing`, "losing");
  }
  const bad = ev.guardrails.find((g) => g.status === "rollback");
  if (bad) return rollbackOf("guardrail_proven_worse", `Guardrail ${bad.id} proven worse: ${bad.reason}`, "losing");

  // 5 holdback
  if (run.phase === "holdback") return decideHoldback(run, ev, now);

  // 6 step down
  const lift = ev.primary.liftPts;
  const previous = stageBefore(run);
  const down = (trigger: Trigger, reason: string): PolicyDecision =>
    previous === undefined
      ? rollbackOf(trigger, `${reason}; already at the first stage, rolled back to 0%`, "inconclusive")
      : now - run.lastChangeAtMs < s.cooldownHours * HOUR_MS
        ? holdOf(run, "cooldown", `${reason}; a step down waits for the ${s.cooldownHours} h cooldown after the last change`)
        : { action: "step_down", trigger, reason: `${reason}; stepping down to ${previous}%`, toStagePct: previous, toPhase: "ramp", toStatus: "running" };
  if (lift !== null && lift <= ROLLOUT.scaleDown.stepDownLiftPts && lnOf(ev.primary.peakLambdaHarm) >= LN_MODERATE) {
    return down("lift_below_step_down", `Lift ${fmt(lift)} pts <= ${ROLLOUT.scaleDown.stepDownLiftPts} pt with moderate evidence (harm Lambda ${fmt(ev.primary.peakLambdaHarm, 1)})`);
  }
  const longWatch = ev.guardrails.find((g) => {
    const since = run.watchSince[g.id];
    return since !== undefined && (g.status === "watch" || g.status === "blocked") && now - since > ROLLOUT.scaleDown.guardrailWatchHours * HOUR_MS;
  });
  if (longWatch) return down("guardrail_on_watch", `Guardrail ${longWatch.id} on ${longWatch.status} for over ${ROLLOUT.scaleDown.guardrailWatchHours} h`);

  // 7 scale up
  const gate = gateCheck(run, ev);
  if (run.windowEndMs !== null && now >= run.windowEndMs) {
    return rollbackOf("window_ended", "Experiment window ended; test ended, control kept", "inconclusive", "end");
  }
  if (!gate.met) {
    if (now - run.startedAtMs >= s.maxLengthDays * 24 * HOUR_MS) {
      return rollbackOf("max_length_reached", `Maximum length of ${s.maxLengthDays} days reached and the gate is still unmet (${gate.missing.join("; ")}); test ended, control kept`, "inconclusive", "end");
    }
    const insufficient = gate.missing.some((m) => m.includes("judged calls per arm"));
    return holdOf(run, insufficient ? "insufficient_data" : "gates_not_met", `Gate not met: ${gate.missing.join("; ")}`);
  }
  if (now - run.stageEnteredAtMs < s.minStageHours * HOUR_MS) {
    return holdOf(run, "min_stage_time", `Gate met (${gate.description}); waiting for the ${s.minStageHours} h minimum time at ${run.stagePct}%`);
  }
  if (now - run.lastChangeAtMs < s.cooldownHours * HOUR_MS) {
    return holdOf(run, "cooldown", `Gate met (${gate.description}); in the ${s.cooldownHours} h cooldown after the last change`);
  }
  const next = stageAfter(run);
  if (next !== undefined) {
    return {
      action: "advance", trigger: "gate_met", toStagePct: next, toPhase: "ramp", toStatus: "running",
      reason: `${run.stagePct}% -> ${next}%: ${gate.description} (lift ${fmt(lift)} pts, Lambda ${fmt(ev.primary.peakLambdaBenefit, 1)})`,
    };
  }
  // Final gate: 90 -> 100 (then preserve one 10% terminal-digit unit as control).
  if (s.requirePmApproval && !run.pmApproved) {
    return holdOf(run, "awaiting_pm_approval", `Final gate met (lift ${fmt(lift)} pts, Lambda ${fmt(ev.primary.peakLambdaBenefit, 1)}); waiting for the PM approval click`);
  }
  const holdbackPct = s.holdbackPct;
  return {
    action: "promote", trigger: "gate_met", liftAtPromotionPts: lift,
    toStagePct: holdbackPct > 0 ? 100 - holdbackPct : 100,
    toPhase: holdbackPct > 0 ? "holdback" : "done",
    toStatus: holdbackPct > 0 ? "running" : "completed",
    ...(holdbackPct > 0 ? {} : { verdict: "winner" as const }),
    reason: `Promoted to 100%${holdbackPct > 0 ? ` with a ${holdbackPct}% holdback on the old prompt for ${s.holdbackDays} days` : ""}: ${gate.description} (lift ${fmt(lift)} pts, Lambda ${fmt(ev.primary.peakLambdaBenefit, 1)})`,
  };
}

// Plain-language "what is needed next" for the state endpoint.
export function nextGateText(run: PolicyRun, ev: RolloutEvidenceDto): string | null {
  if (run.status !== "running") return null;
  if (run.phase === "holdback") return `Holdback until day ${run.settings.holdbackDays}; rolls back if the lift turns negative`;
  const next = stageAfter(run);
  const gate = gateCheck(run, ev);
  const target = next === undefined ? "100%" : `${next}%`;
  return `${run.stagePct}% -> ${target}: ${gate.description}.${gate.met ? " Statistics met." : ` Missing: ${gate.missing.join("; ")}.`}`;
}
