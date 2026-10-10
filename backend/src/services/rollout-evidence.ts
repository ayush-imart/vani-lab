// Builds the full evidence snapshot for a rollout run from its calls: primary lift (two-sample mSPRT,
// stage-stratified), holdback lift, 9 guardrails, validity gates, failed-call rate, secondary metrics
// (descriptive only) and the separately labelled judge evidence. Pure: state in, state out.
import type { CallRecord, LiftEvidenceDto, RolloutEvidenceDto } from "../contract";
import { quantile } from "../stats/normal";
import { alwaysValidP, logLambdaTwoSided, twoSampleMsprt, type TwoSampleResult } from "../stats/msprt-two-sample";
import { ENGINE_GUARDS, PRIMARIES, SECONDARIES, STATS, type PmSettings, type PrimaryId } from "../spec";
import { isFullyJudged, primaryValue, secondaryValue, type Channel } from "./call-metrics";
import { evaluateGuardrails } from "./guardrails";
import { stageCounts } from "./stage-counts";
import { coverageCheck, splitCheck } from "./validity";

export type EvidenceRun = {
  experimentId: string;
  primary: PrimaryId;
  channel: Channel;
  challengerSlot: string;
  controlSlot: string;
  settings: PmSettings;
  holdbackStage: number | null; // treatment % during the holdback phase, null before it
  peaks: Readonly<Record<string, number>>; // running max of ln Lambda (primaryBenefit, primaryHarm, holdbackHarm, guardrails)
  watchSince: Readonly<Record<string, number>>;
};
export type EvidenceResult = {
  evidence: RolloutEvidenceDto;
  peaks: Record<string, number>;
  watchSince: Record<string, number>;
};

const safeExp = (log: number) => Math.exp(Math.min(log, 700));

function liftDto(r: TwoSampleResult, peakBenefit: number, peakHarm: number): LiftEvidenceDto {
  return {
    method: r.method,
    alpha: r.alpha,
    tau: r.tau,
    ratio: r.ratio,
    nControl: r.nControl,
    nTreatment: r.nTreatment,
    rateControl: r.rateControl,
    rateTreatment: r.rateTreatment,
    liftPts: r.liftPts,
    stdErrPts: r.stdErrPts,
    stages: r.stages,
    lambdaBenefit: safeExp(r.logLambdaBenefit),
    lambdaHarm: safeExp(r.logLambdaHarm),
    peakLambdaBenefit: safeExp(peakBenefit),
    peakLambdaHarm: safeExp(peakHarm),
    pBenefit: alwaysValidP(peakBenefit),
    pHarm: alwaysValidP(peakHarm),
    assumptions: r.assumptions,
  };
}

const mean = (xs: number[]) => (xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100);
const median = (xs: number[]) => (xs.length === 0 ? null : quantile(xs, 0.5));

function secondaryResults(judged: readonly CallRecord[], run: EvidenceRun, isTreatment: (c: CallRecord) => boolean, tau: number) {
  return SECONDARIES[run.primary].map((spec) => {
    const base = { id: spec.id, label: spec.label, baselinePct: spec.baselinePct, usedForDecision: false as const, ...(spec.basis ? { note: spec.basis } : {}) };
    if (spec.id === "medianCallSeconds") {
      const c = median(judged.filter((x) => !isTreatment(x)).map((x) => x.durationSec));
      const t = median(judged.filter(isTreatment).map((x) => x.durationSec));
      return {
        ...base,
        kind: "median_seconds" as const,
        nControl: judged.filter((x) => !isTreatment(x)).length,
        nTreatment: judged.filter(isTreatment).length,
        controlValue: c,
        treatmentValue: t,
        diff: c === null || t === null ? null : t - c,
        lambdaTwoSided: null,
        significant: null,
      };
    }
    const r = twoSampleMsprt(stageCounts(judged, isTreatment, (c) => secondaryValue(c, spec.id)), {
      tau,
      alpha: STATS.alpha,
      minPerArm: ENGINE_GUARDS.minCallsPerArmPerStage,
    });
    const lambda =
      r.liftPts === null || r.stdErrPts === null
        ? null
        : safeExp(logLambdaTwoSided(r.liftPts / 100, (r.stdErrPts / 100) ** 2, tau));
    return {
      ...base,
      kind: "rate" as const,
      nControl: r.nControl,
      nTreatment: r.nTreatment,
      controlValue: r.rateControl === null ? null : r.rateControl * 100,
      treatmentValue: r.rateTreatment === null ? null : r.rateTreatment * 100,
      diff: r.liftPts,
      lambdaTwoSided: lambda,
      significant: lambda === null ? null : lambda >= 1 / STATS.alpha,
    };
  });
}

export function buildEvidence(allCalls: readonly CallRecord[], run: EvidenceRun, now: number): EvidenceResult {
  const mine = allCalls.filter(
    (c) => c.experimentId === run.experimentId && (c.version === run.controlSlot || c.version === run.challengerSlot),
  );
  const isTreatment = (c: CallRecord) => c.version === run.challengerSlot;
  // Audit-created calls are judge evidence, not production traffic: they carry no outcome.
  const traffic = mine.filter((c) => c.source !== "audit");
  const measurable = traffic.filter((c) => !c.failed);
  const judged = measurable.filter((c) => isFullyJudged(c, run.primary, run.channel));
  const rampJudged = run.holdbackStage === null ? judged : judged.filter((c) => c.stage !== run.holdbackStage);
  const tau = run.settings.smallestWinPts / 100;
  const opts = { tau, alpha: STATS.alpha, minPerArm: ENGINE_GUARDS.minCallsPerArmPerStage };

  const primaryResult = twoSampleMsprt(stageCounts(rampJudged, isTreatment, (c) => primaryValue(c, run.primary)), opts);
  const peakBenefit = Math.max(run.peaks.primaryBenefit ?? 0, primaryResult.logLambdaBenefit);
  const peakHarm = Math.max(run.peaks.primaryHarm ?? 0, primaryResult.logLambdaHarm);

  let holdback: LiftEvidenceDto | null = null;
  let peakHoldbackHarm = run.peaks.holdbackHarm ?? 0;
  if (run.holdbackStage !== null) {
    const hb = twoSampleMsprt(
      stageCounts(judged.filter((c) => c.stage === run.holdbackStage), isTreatment, (c) => primaryValue(c, run.primary)),
      opts,
    );
    peakHoldbackHarm = Math.max(peakHoldbackHarm, hb.logLambdaHarm);
    holdback = liftDto(hb, Math.max(run.peaks.holdbackBenefit ?? 0, hb.logLambdaBenefit), peakHoldbackHarm);
  }

  const guardrails = evaluateGuardrails({
    calls: judged,
    isTreatment,
    channel: run.channel,
    primary: run.primary,
    tolerancePts: run.settings.guardrailTolerancePts,
    prevPeaks: run.peaks,
    watchSince: run.watchSince,
    now,
  });

  const treatmentTraffic = traffic.filter(isTreatment);
  const treatmentFailed = treatmentTraffic.filter((c) => c.failed).length;
  const judgedScores = (arm: boolean) =>
    mine.filter((c) => c.source === "audit" && c.scores && isTreatment(c) === arm).map((c) => (c.scores as { overall: number }).overall);

  const evidence: RolloutEvidenceDto = {
    primary: liftDto(primaryResult, peakBenefit, peakHarm),
    primaryId: run.primary,
    holdback,
    guardrails: guardrails.evals,
    validity: {
      srm: splitCheck(traffic, isTreatment),
      coverage: coverageCheck(judged.length, measurable.length, run.settings.coverageFloor),
    },
    failedCalls: {
      treatmentCalls: treatmentTraffic.length,
      treatmentFailed,
      pct: treatmentTraffic.length === 0 ? null : (treatmentFailed / treatmentTraffic.length) * 100,
    },
    secondary: secondaryResults(judged, run, isTreatment, tau),
    judgeEvidence: {
      signal: "judge_evidence",
      scale: "mean judge score, 1-5 (not a rate)",
      usedForDecision: false,
      control: { calls: judgedScores(false).length, meanOverall: mean(judgedScores(false)) },
      treatment: { calls: judgedScores(true).length, meanOverall: mean(judgedScores(true)) },
    },
    calls: { total: traffic.length, judged: judged.length },
  };
  return {
    evidence,
    peaks: { ...guardrails.peaks, primaryBenefit: peakBenefit, primaryHarm: peakHarm, holdbackHarm: peakHoldbackHarm,
      ...(holdback ? { holdbackBenefit: Math.log(Math.max(1, holdback.peakLambdaBenefit)) } : {}) },
    watchSince: guardrails.watchSince,
  };
}

export const primaryLabel = (p: PrimaryId): string => PRIMARIES[p].label;
