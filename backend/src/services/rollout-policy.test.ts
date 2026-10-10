import { describe, expect, it } from "vitest";
import type { GuardrailEvalDto, LiftEvidenceDto, RolloutEvidenceDto } from "../contract";
import { GUARDRAIL_IDS, defaultPmSettings, type GuardrailId } from "../spec";
import { decide, gateCheck, nextGateText, rampStages, type PolicyRun } from "./rollout-policy";

const H = 3_600_000;
const T0 = 1_700_000_000_000;

const lift = (over: Partial<LiftEvidenceDto> = {}): LiftEvidenceDto => ({
  method: "m", alpha: 0.05, tau: 0.03, ratio: 1, nControl: 1000, nTreatment: 500, rateControl: 0.1, rateTreatment: 0.1,
  liftPts: 0, stdErrPts: 1, stages: [], lambdaBenefit: 1, lambdaHarm: 1, peakLambdaBenefit: 1, peakLambdaHarm: 1,
  pBenefit: 1, pHarm: 1, assumptions: [], ...over,
});
const guard = (id: GuardrailId, status: GuardrailEvalDto["status"] = "ok"): GuardrailEvalDto => ({
  id, label: id, status, rule: "proven_worse", nControl: 1000, nTreatment: 500, rateControlPct: 10, rateTreatmentPct: 10,
  excessPts: 0, tolerancePts: 3, lambdaHarm: 1, peakLambdaHarm: 1, pHarm: 1, evidenceSufficient: true, reason: id,
});
const evidence = (over: Partial<RolloutEvidenceDto> & { primaryLift?: Partial<LiftEvidenceDto>; statuses?: Partial<Record<GuardrailId, GuardrailEvalDto["status"]>> } = {}): RolloutEvidenceDto => ({
  primary: lift(over.primaryLift), primaryId: "meetingFixed", holdback: null,
  guardrails: GUARDRAIL_IDS.map((id) => guard(id, over.statuses?.[id] ?? "ok")),
  validity: {
    srm: { method: "m", threshold: 0.001, chiSquare: 0, df: 1, pValue: 0.5, failed: false, stages: [] },
    coverage: { judged: 90, total: 100, share: 0.9, floor: 0.8, ok: true },
  },
  failedCalls: { treatmentCalls: 500, treatmentFailed: 0, pct: 0 },
  secondary: [], judgeEvidence: { signal: "judge_evidence", scale: "mean judge score, 1-5 (not a rate)", usedForDecision: false, control: { calls: 0, meanOverall: null }, treatment: { calls: 0, meanOverall: null } },
  calls: { total: 100, judged: 90 },
  ...(over.primary ? { primary: over.primary } : {}), ...(over.validity ? { validity: over.validity } : {}),
  ...(over.failedCalls ? { failedCalls: over.failedCalls } : {}), ...(over.holdback !== undefined ? { holdback: over.holdback } : {}),
});
const run = (over: Partial<PolicyRun> = {}): PolicyRun => ({
  status: "running", phase: "ramp", stagePct: 10, stages: rampStages(10), startedAtMs: T0, stageEnteredAtMs: T0, lastChangeAtMs: T0,
  windowEndMs: null, pmApproved: false, settings: defaultPmSettings(), watchSince: {}, holdback: null, ...over,
});
const at = (hours: number) => T0 + hours * H;

describe("rollout policy: scale up gates", () => {
  it("has ramp stages 10/25/50 and respects the start size", () => {
    expect(rampStages(10)).toEqual([10, 25, 50]);
    expect(rampStages(5)).toEqual([5, 10, 25, 50]);
    expect(rampStages(25)).toEqual([25, 50]);
  });

  it("10 -> 25 needs lift >= -1 pt and every guardrail ok, after 24 h", () => {
    const ok = evidence({ primaryLift: { liftPts: -0.5 } });
    expect(decide(run(), ok, at(23)).trigger).toBe("min_stage_time");
    const go = decide(run(), ok, at(24));
    expect(go).toMatchObject({ action: "advance", toStagePct: 25 });
    const low = decide(run(), evidence({ primaryLift: { liftPts: -1.5 } }), at(24));
    expect(low.action).toBe("hold");
    expect(low.trigger).toBe("gates_not_met");
    const blocked = decide(run(), evidence({ primaryLift: { liftPts: 2 }, statuses: { earlyDrop: "blocked" } }), at(24));
    expect(blocked.action).toBe("hold");
    expect(blocked.reason).toContain("earlyDrop=blocked");
  });

  it("does not advance on too few calls", () => {
    const thin = evidence({ primary: lift({ liftPts: 5, nControl: 40, nTreatment: 10 }) });
    expect(decide(run(), thin, at(30)).trigger).toBe("insufficient_data");
  });

  it("25 -> 50 needs lift >= +1 pt and Lambda >= 5", () => {
    const r = run({ stagePct: 25 });
    const weak = evidence({ primaryLift: { liftPts: 2, peakLambdaBenefit: 3 } });
    expect(decide(r, weak, at(24)).action).toBe("hold");
    const strong = evidence({ primaryLift: { liftPts: 2, peakLambdaBenefit: 6 } });
    expect(decide(r, strong, at(24))).toMatchObject({ action: "advance", toStagePct: 50 });
    const noLift = evidence({ primaryLift: { liftPts: 0.5, peakLambdaBenefit: 30 } });
    expect(decide(r, noLift, at(24)).action).toBe("hold");
  });

  it("50 -> 100 needs lift >= smallest win, Lambda >= 20 and the PM approval click", () => {
    const r = run({ stagePct: 50 });
    const e = evidence({ primaryLift: { liftPts: 4, peakLambdaBenefit: 25 } });
    expect(decide(r, evidence({ primaryLift: { liftPts: 2.9, peakLambdaBenefit: 25 } }), at(24)).action).toBe("hold");
    expect(decide(r, evidence({ primaryLift: { liftPts: 4, peakLambdaBenefit: 19 } }), at(24)).action).toBe("hold");
    expect(decide(r, e, at(24))).toMatchObject({ action: "hold", trigger: "awaiting_pm_approval" });
    const promoted = decide({ ...r, pmApproved: true }, e, at(24));
    expect(promoted).toMatchObject({ action: "promote", toStagePct: 95, toPhase: "holdback", toStatus: "running", liftAtPromotionPts: 4 });
  });

  it("promotes straight to completed when the PM turns approval off and holdback to 0", () => {
    const settings = { ...defaultPmSettings(), requirePmApproval: false, holdbackPct: 0 };
    const out = decide(run({ stagePct: 50, settings }), evidence({ primaryLift: { liftPts: 4, peakLambdaBenefit: 25 } }), at(24));
    expect(out).toMatchObject({ action: "promote", toStagePct: 100, toStatus: "completed", verdict: "winner" });
  });

  it("enforces the 24 h cooldown after a change even when min stage time passed", () => {
    const r = run({ stageEnteredAtMs: T0, lastChangeAtMs: at(20) });
    const out = decide(r, evidence({ primaryLift: { liftPts: 1 } }), at(30));
    expect(out.trigger).toBe("cooldown");
  });

  it("PM-stricter gates are honoured (higher Lambda)", () => {
    const settings = { ...defaultPmSettings(), moderateGateMinLambda: 10 };
    const r = run({ stagePct: 25, settings });
    expect(decide(r, evidence({ primaryLift: { liftPts: 2, peakLambdaBenefit: 6 } }), at(24)).action).toBe("hold");
  });
});

describe("rollout policy: automatic scale-down", () => {
  it("rolls back to 0% and marks Losing when the primary is proven worse (harm Lambda >= 20)", () => {
    const out = decide(run(), evidence({ primaryLift: { liftPts: -12, peakLambdaHarm: 500 } }), at(1));
    expect(out).toMatchObject({ action: "rollback", trigger: "primary_proven_worse", toStagePct: 0, toStatus: "rolled_back", verdict: "losing" });
  });

  it("rolls back to 0% when any guardrail is proven worse", () => {
    const out = decide(run(), evidence({ statuses: { botLooping: "rollback" } }), at(1));
    expect(out).toMatchObject({ action: "rollback", trigger: "guardrail_proven_worse", toStagePct: 0 });
    expect(out.reason).toContain("botLooping");
  });

  it("rolls back when failed calls exceed 2%", () => {
    const out = decide(run(), evidence({ failedCalls: { treatmentCalls: 500, treatmentFailed: 20, pct: 4 } }), at(1));
    expect(out).toMatchObject({ action: "rollback", trigger: "failed_calls_over_limit" });
  });

  it("pauses and freezes on SRM failure, before looking at statistics", () => {
    const e = evidence({ primaryLift: { liftPts: -12, peakLambdaHarm: 500 }, validity: { srm: { method: "m", threshold: 0.001, chiSquare: 40, df: 1, pValue: 1e-9, failed: true, stages: [] }, coverage: { judged: 90, total: 100, share: 0.9, floor: 0.8, ok: true } } });
    expect(decide(run(), e, at(1))).toMatchObject({ action: "pause", trigger: "srm_failed", freeze: true, toStatus: "paused" });
  });

  it("holds all decisions while outcome coverage is below the floor", () => {
    const e = evidence({ primaryLift: { liftPts: 5, peakLambdaBenefit: 50 }, validity: { srm: { method: "m", threshold: 0.001, chiSquare: 0, df: 1, pValue: 0.9, failed: false, stages: [] }, coverage: { judged: 50, total: 100, share: 0.5, floor: 0.8, ok: false } } });
    expect(decide(run(), e, at(48))).toMatchObject({ action: "hold", trigger: "coverage_below_floor" });
  });

  it("steps down one stage when lift <= -1 pt with moderate evidence", () => {
    const out = decide(run({ stagePct: 25, stages: rampStages(10) }), evidence({ primaryLift: { liftPts: -1.5, peakLambdaHarm: 6 } }), at(30));
    expect(out).toMatchObject({ action: "step_down", trigger: "lift_below_step_down", toStagePct: 10 });
  });

  it("does not step down on a negative lift without moderate evidence", () => {
    const out = decide(run({ stagePct: 25 }), evidence({ primaryLift: { liftPts: -1.5, peakLambdaHarm: 2 } }), at(30));
    expect(out.action).toBe("hold");
  });

  it("steps down when a guardrail has been on watch for more than 24 h", () => {
    const r = run({ stagePct: 50, watchSince: { earlyDrop: T0 } });
    const watch = evidence({ primaryLift: { liftPts: 2 }, statuses: { earlyDrop: "watch" } });
    expect(decide(r, watch, at(23)).action).toBe("hold");
    expect(decide(r, watch, at(25))).toMatchObject({ action: "step_down", trigger: "guardrail_on_watch", toStagePct: 25 });
  });

  it("stepping down from the first stage is a rollback to 0%", () => {
    const out = decide(run(), evidence({ primaryLift: { liftPts: -2, peakLambdaHarm: 7 } }), at(30));
    expect(out).toMatchObject({ action: "rollback", toStagePct: 0, verdict: "inconclusive" });
  });

  it("ends the test and keeps control at the maximum length when the gate is still unmet", () => {
    const out = decide(run(), evidence({ primaryLift: { liftPts: -1.5, peakLambdaHarm: 2 } }), at(7 * 24 + 1));
    expect(out).toMatchObject({ action: "end", trigger: "max_length_reached", toStagePct: 0, toStatus: "ended", verdict: "inconclusive" });
  });

  it("does not end on max length while only the PM approval is missing", () => {
    const r = run({ stagePct: 50 });
    const out = decide(r, evidence({ primaryLift: { liftPts: 4, peakLambdaBenefit: 25 } }), at(8 * 24));
    expect(out.trigger).toBe("awaiting_pm_approval");
  });

  it("ends when the experiment window closes", () => {
    const out = decide(run({ windowEndMs: at(10) }), evidence({ primaryLift: { liftPts: 3, peakLambdaBenefit: 3 } }), at(11));
    expect(out).toMatchObject({ action: "end", trigger: "window_ended" });
  });

  it("does nothing for a non-running run", () => {
    expect(decide(run({ status: "paused" }), evidence(), at(1)).trigger).toBe("not_running");
  });
});

describe("rollout policy: holdback", () => {
  const hb = (liftAtPromotionPts: number | null, alerted = false) => ({ startedAtMs: T0, liftAtPromotionPts, alerted });
  const hbRun = (alerted = false) => run({ phase: "holdback", stagePct: 95, holdback: hb(4, alerted) });
  const holdbackEv = (liftPts: number, peakLambdaHarm = 1) =>
    evidence({ holdback: lift({ nControl: 300, nTreatment: 3000, liftPts, peakLambdaHarm }) });

  it("alerts the PM once when the lift shrinks by more than half", () => {
    expect(decide(hbRun(), holdbackEv(1.5), at(48))).toMatchObject({ action: "alert", trigger: "holdback_lift_shrank", alerted: true });
    expect(decide(hbRun(true), holdbackEv(1.5), at(48)).action).toBe("hold");
  });

  it("rolls back when the holdback lift is negative with moderate evidence", () => {
    expect(decide(hbRun(), holdbackEv(-1.2, 6), at(48))).toMatchObject({ action: "rollback", trigger: "holdback_lift_negative", verdict: "losing" });
  });

  it("only alerts on a negative lift with weak evidence", () => {
    expect(decide(hbRun(), holdbackEv(-0.5, 2), at(48)).action).toBe("alert");
  });

  it("completes as winner once the holdback days have passed", () => {
    expect(decide(hbRun(), holdbackEv(3.5), at(7 * 24 + 1))).toMatchObject({ action: "complete", toStagePct: 100, toStatus: "completed", verdict: "winner" });
    expect(decide(hbRun(), holdbackEv(3.5), at(24)).action).toBe("hold");
  });
});

describe("gate text", () => {
  it("lists what is missing and describes the next gate", () => {
    const r = run({ stagePct: 25 });
    const e = evidence({ primaryLift: { liftPts: 0.2, peakLambdaBenefit: 2 } });
    const g = gateCheck(r, e);
    expect(g.met).toBe(false);
    expect(g.missing.join(" ")).toContain("Lambda >= 5");
    expect(nextGateText(r, e)).toContain("25% -> 50%");
  });
});

describe("rollout policy: step down respects the cooldown", () => {
  const harm = evidence({ primaryLift: { liftPts: -3, peakLambdaHarm: 8 } });

  it("steps down once, then holds until the 24 h cooldown has passed", () => {
    const first = decide(run({ stagePct: 50, lastChangeAtMs: T0 }), harm, at(30));
    expect(first).toMatchObject({ action: "step_down", toStagePct: 25 });
    // the engine just changed stage at hour 30; identical evidence must not cascade
    const again = decide(run({ stagePct: 25, lastChangeAtMs: at(30) }), harm, at(31));
    expect(again.action).toBe("hold");
    expect(again.trigger).toBe("cooldown");
    expect(decide(run({ stagePct: 25, lastChangeAtMs: at(30) }), harm, at(54)).action).toBe("step_down");
  });

  it("at the first stage the same evidence rolls back immediately (rollbacks never wait)", () => {
    expect(decide(run({ stagePct: 10, lastChangeAtMs: at(1) }), harm, at(2)).action).toBe("rollback");
  });
});
