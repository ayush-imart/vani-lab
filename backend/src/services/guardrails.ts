// Guardrails engine: all 9 spec guardrails (plus the per-primary Meeting Fixed floor), B vs A in the
// SAME run, never against history. A guardrail can block or roll back B but never make it win.
//
// Status per guardrail (precedence rollback > blocked > watch > ok):
//   rollback  live rule met: proven worse (mSPRT harm Lambda peak >= 20, the same test as the
//             primary); fake meetings: proven B > 1.5 x A; slow replies: P95 latency +0.5 s.
//   blocked   moderate evidence of harm (peak Lambda >= 5), not proven, and B's excess over A is
//             beyond the tolerance: blocks scale-up.
//   watch     moderate evidence of harm (peak Lambda >= 5), not proven, still within tolerance.
//   ok        otherwise (including "not enough data yet": see evidenceSufficient). A point estimate
//             over tolerance without moderate evidence is noise at these sample sizes and does not block.
// Both watch and blocked count as "on watch" for the 24 h step-down trigger (watchSince).
// Interpretation note: the spec table says "proven worse" (live rule) and "beyond its limit"
// (scale-down table). We roll back on "proven worse"; the tolerance decides blocked.
import type { CallRecord, GuardrailEvalDto } from "../contract";
import { quantile } from "../stats/normal";
import { alwaysValidP, twoSampleMsprt } from "../stats/msprt-two-sample";
import {
  ENGINE_GUARDS,
  FAKE_MEETING_RATIO,
  FAKE_MEETING_TAU,
  GUARDRAILS,
  GUARDRAIL_IDS,
  LATENCY_P95_ROLLBACK_DELTA_SEC,
  MEETING_FIXED_FLOOR_DROP_PTS,
  PRIMARIES,
  STATS,
  type GuardrailId,
  type PrimaryId,
} from "../spec";
import { guardrailApplies, guardrailValue, type Channel } from "./call-metrics";
import { stageCounts, type ArmPicker } from "./stage-counts";

export type GuardrailEvalId = GuardrailId | "meetingFixedFloor";
export type GuardrailEval = GuardrailEvalDto & { id: GuardrailEvalId };

export type GuardrailInput = {
  calls: readonly CallRecord[]; // fully judged calls of the experiment
  isTreatment: ArmPicker;
  channel: Channel;
  primary: PrimaryId;
  tolerancePts: Partial<Record<GuardrailId, number>>;
  prevPeaks: Readonly<Record<string, number>>; // running max of ln Lambda(harm), per guardrail
  watchSince: Readonly<Record<string, number>>; // epoch ms when a guardrail first went on watch
  now: number;
};
export type GuardrailOutput = {
  evals: GuardrailEval[];
  peaks: Record<string, number>;
  watchSince: Record<string, number>;
};

const LOG_PROVEN = Math.log(1 / STATS.alpha);
const LOG_MODERATE = Math.log(STATS.moderateEvidenceLambda);
const MIN_TAU = 0.005;

const pct = (rate: number | null) => (rate === null ? null : rate * 100);
const exp = (log: number) => Math.exp(Math.min(log, 700));

function p95Of(calls: readonly CallRecord[], isTreatment: ArmPicker, treatment: boolean): number | null {
  const values = calls
    .filter((c) => isTreatment(c) === treatment)
    .map((c) => c.evaluator?.p95LatencySec)
    .filter((v): v is number => v !== undefined);
  return values.length === 0 ? null : quantile(values, 0.95);
}

function notApplicable(id: GuardrailId): GuardrailEval {
  return {
    id,
    label: GUARDRAILS[id].label,
    status: "not_applicable",
    rule: GUARDRAILS[id].liveRule,
    nControl: 0,
    nTreatment: 0,
    rateControlPct: null,
    rateTreatmentPct: null,
    excessPts: null,
    tolerancePts: null,
    lambdaHarm: 1,
    peakLambdaHarm: 1,
    pHarm: 1,
    evidenceSufficient: false,
    reason: "voice-only guardrail, not measured on a text run",
  };
}

type Verdict = { status: GuardrailEval["status"]; reason: string };

function verdictFor(args: {
  label: string;
  sufficient: boolean;
  excessPts: number | null;
  tolerancePts: number;
  peak: number;
  extraRollback?: string | undefined;
  provenText: string;
}): Verdict {
  const { label, sufficient, excessPts, tolerancePts, peak, extraRollback, provenText } = args;
  if (extraRollback) return { status: "rollback", reason: extraRollback };
  if (!sufficient) return { status: "ok", reason: `${label}: not enough calls yet (need ${ENGINE_GUARDS.minCallsPerArmForGuardrailStatus} per arm)` };
  if (peak >= LOG_PROVEN) return { status: "rollback", reason: `${label}: ${provenText} (peak Lambda ${exp(peak).toFixed(1)} >= ${1 / STATS.alpha})` };
  if (peak >= LOG_MODERATE) {
    const moderate = `moderate evidence of harm (peak Lambda ${exp(peak).toFixed(1)} >= ${STATS.moderateEvidenceLambda})`;
    return excessPts !== null && excessPts > tolerancePts
      ? { status: "blocked", reason: `${label}: ${moderate} and B is ${excessPts.toFixed(2)} pts over, beyond the ${tolerancePts} pt tolerance` }
      : { status: "watch", reason: `${label}: ${moderate}, still within the ${tolerancePts} pt tolerance` };
  }
  return { status: "ok", reason: `${label}: within tolerance` };
}

function rateGuardrail(id: GuardrailId, input: GuardrailInput): { eval: GuardrailEval; peak: number } {
  const spec = GUARDRAILS[id];
  const isFake = spec.liveRule === "ratio_over_1_5x";
  const tolerancePts = isFake ? 0 : (input.tolerancePts[id] ?? spec.preprodTolerancePts ?? 0);
  const ratio = isFake ? FAKE_MEETING_RATIO : 1;
  const tau = isFake ? FAKE_MEETING_TAU : Math.max(MIN_TAU, tolerancePts / 100);
  const counts = stageCounts(input.calls, input.isTreatment, (c) => guardrailValue(c, id, input.channel));
  const r = twoSampleMsprt(counts, { tau, alpha: STATS.alpha, ratio, minPerArm: ENGINE_GUARDS.minCallsPerArmPerStage });
  const peak = Math.max(input.prevPeaks[id] ?? 0, r.logLambdaBenefit); // benefit side of (B - k A) = harm
  const sufficient =
    r.nControl >= ENGINE_GUARDS.minCallsPerArmForGuardrailStatus && r.nTreatment >= ENGINE_GUARDS.minCallsPerArmForGuardrailStatus;
  let extraRollback: string | undefined;
  let latency: GuardrailEval["latency"];
  if (spec.liveRule === "p95_latency_plus_0_5s") {
    const c = p95Of(input.calls, input.isTreatment, false);
    const t = p95Of(input.calls, input.isTreatment, true);
    const delta = c === null || t === null ? null : t - c;
    latency = { controlP95Sec: c, treatmentP95Sec: t, deltaSec: delta };
    if (sufficient && delta !== null && delta >= LATENCY_P95_ROLLBACK_DELTA_SEC) {
      extraRollback = `${spec.label}: P95 latency is ${delta.toFixed(2)} s above A (limit +${LATENCY_P95_ROLLBACK_DELTA_SEC} s; observed quantile, not a statistical test)`;
    }
  }
  const verdict = verdictFor({
    label: spec.label,
    sufficient,
    excessPts: r.liftPts,
    tolerancePts,
    peak,
    extraRollback,
    provenText: isFake ? `proven B > ${FAKE_MEETING_RATIO}x A` : "proven worse than A",
  });
  const out: GuardrailEval = {
    id,
    label: spec.label,
    status: verdict.status,
    rule: spec.liveRule,
    nControl: r.nControl,
    nTreatment: r.nTreatment,
    rateControlPct: pct(r.rateControl),
    rateTreatmentPct: pct(r.rateTreatment),
    excessPts: r.liftPts,
    tolerancePts: isFake ? null : tolerancePts,
    lambdaHarm: exp(r.logLambdaBenefit),
    peakLambdaHarm: exp(peak),
    pHarm: alwaysValidP(peak),
    evidenceSufficient: sufficient,
    ...(latency ? { latency } : {}),
    reason: verdict.reason,
  };
  return { eval: out, peak };
}

// Extra guardrail on non-Meeting-Fixed primaries: Meeting Fixed may not drop by more than 1 pt.
function meetingFixedFloor(input: GuardrailInput): { eval: GuardrailEval; peak: number } {
  const counts = stageCounts(input.calls, input.isTreatment, (c) => c.outcome?.meetingFixed);
  const r = twoSampleMsprt(counts, { tau: STATS.defaultSmallestWinPts / 100, alpha: STATS.alpha, minPerArm: ENGINE_GUARDS.minCallsPerArmPerStage });
  const peak = Math.max(input.prevPeaks.meetingFixedFloor ?? 0, r.logLambdaHarm);
  const sufficient =
    r.nControl >= ENGINE_GUARDS.minCallsPerArmForGuardrailStatus && r.nTreatment >= ENGINE_GUARDS.minCallsPerArmForGuardrailStatus;
  const drop = r.liftPts === null ? null : -r.liftPts; // positive = Meeting Fixed fell
  const label = "Meeting Fixed floor";
  const verdict = verdictFor({
    label,
    sufficient,
    excessPts: drop,
    tolerancePts: MEETING_FIXED_FLOOR_DROP_PTS,
    peak,
    provenText: "Meeting Fixed proven lower than A",
  });
  // Proven worse only rolls back when the drop is also beyond the 1 pt limit.
  const status = verdict.status === "rollback" && (drop === null || drop <= MEETING_FIXED_FLOOR_DROP_PTS) ? "watch" : verdict.status;
  return {
    peak,
    eval: {
      id: "meetingFixedFloor",
      label,
      status,
      rule: `Meeting Fixed cannot drop more than ${MEETING_FIXED_FLOOR_DROP_PTS} pt (extra guardrail of ${PRIMARIES[input.primary].label})`,
      nControl: r.nControl,
      nTreatment: r.nTreatment,
      rateControlPct: pct(r.rateControl),
      rateTreatmentPct: pct(r.rateTreatment),
      excessPts: drop,
      tolerancePts: MEETING_FIXED_FLOOR_DROP_PTS,
      lambdaHarm: exp(r.logLambdaHarm),
      peakLambdaHarm: exp(peak),
      pHarm: alwaysValidP(peak),
      evidenceSufficient: sufficient,
      reason: status === verdict.status ? verdict.reason : `${label}: proven lower but within the ${MEETING_FIXED_FLOOR_DROP_PTS} pt limit`,
    },
  };
}

export function evaluateGuardrails(input: GuardrailInput): GuardrailOutput {
  const peaks: Record<string, number> = { ...input.prevPeaks };
  const evals: GuardrailEval[] = [];
  for (const id of GUARDRAIL_IDS) {
    if (!guardrailApplies(id, input.channel)) {
      evals.push(notApplicable(id));
      continue;
    }
    const { eval: e, peak } = rateGuardrail(id, input);
    peaks[id] = peak;
    evals.push(e);
  }
  if (PRIMARIES[input.primary].extraGuardrailId === "meetingFixedFloor") {
    const { eval: e, peak } = meetingFixedFloor(input);
    peaks.meetingFixedFloor = peak;
    evals.push(e);
  }
  const watchSince: Record<string, number> = {};
  for (const e of evals) {
    if (e.status === "watch" || e.status === "blocked") watchSince[e.id] = input.watchSince[e.id] ?? input.now;
  }
  const stamped = evals.map((e) =>
    watchSince[e.id] === undefined ? e : { ...e, watchSince: new Date(watchSince[e.id] as number).toISOString() },
  );
  return { evals: stamped, peaks, watchSince };
}

export const guardrailStatuses = (evals: readonly GuardrailEval[]) =>
  Object.fromEntries(evals.map((e) => [e.id, e.status])) as Partial<Record<GuardrailEvalId, GuardrailEval["status"]>>;
export const anyGuardrail = (evals: readonly GuardrailEval[], status: GuardrailEval["status"]) => evals.some((e) => e.status === status);
