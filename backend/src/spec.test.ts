import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT,
  GUARDRAIL_IDS,
  GUARDRAILS,
  PREPROD,
  PRIMARIES,
  PRIMARY_IDS,
  ROLLOUT,
  SECONDARIES,
  STAGES,
  STATS,
  defaultPmSettings,
  resolvePmSettings,
  specSnapshot,
} from "./spec";

describe("spec constants", () => {
  it("encodes the 4 primary metrics and their baselines", () => {
    expect(PRIMARY_IDS).toEqual(["meetingFixed", "positiveOutcome", "conversationReach", "callbackFixed"]);
    expect(PRIMARIES.meetingFixed.baselinePct).toBe(10.2);
    expect(PRIMARIES.positiveOutcome.baselinePct).toBe(18);
    expect(PRIMARIES.conversationReach.baselinePct).toBe(31);
    expect(PRIMARIES.callbackFixed.baselinePct).toBe(6.2);
    expect(PRIMARIES.positiveOutcome.baselineApproximate).toBe(true);
    expect(PRIMARIES.meetingFixed.extraGuardrailId).toBe("fakeMeetings");
    expect(PRIMARIES.callbackFixed.extraGuardrailId).toBe("meetingFixedFloor");
  });

  it("has secondary metrics for every primary", () => {
    PRIMARY_IDS.forEach((p) => expect(SECONDARIES[p].length).toBeGreaterThan(0));
    expect(SECONDARIES.meetingFixed.map((s) => s.baselinePct)).toEqual([31.0, 2.1, 11.8, 15.4, 47.6]);
  });

  it("encodes all 9 guardrails with baseline, tolerance and live rule", () => {
    expect(GUARDRAIL_IDS).toHaveLength(9);
    expect(GUARDRAILS.fakeMeetings).toMatchObject({ baselinePct: 2.6, preprodTolerancePts: null, liveRule: "ratio_over_1_5x" });
    expect(GUARDRAILS.earlyDrop).toMatchObject({ baselinePct: 29.2, preprodTolerancePts: 5 });
    expect(GUARDRAILS.doNotCall).toMatchObject({ baselinePct: 0.8, preprodTolerancePts: 1 });
    expect(GUARDRAILS.botLooping).toMatchObject({ baselinePct: 14.4, preprodTolerancePts: 3 });
    expect(GUARDRAILS.sellerHadToRepeat).toMatchObject({ baselinePct: 13.8, preprodTolerancePts: 3 });
    expect(GUARDRAILS.unansweredQuestions).toMatchObject({ baselinePct: 37.2, preprodTolerancePts: 5 });
    expect(GUARDRAILS.systemDroppedCalls).toMatchObject({ baselinePct: 35.2, preprodTolerancePts: 3 });
    expect(GUARDRAILS.slowReplies).toMatchObject({ baselinePct: 17.9, preprodTolerancePts: 5, voiceOnly: true, liveRule: "p95_latency_plus_0_5s" });
    expect(GUARDRAILS.talkOver).toMatchObject({ baselinePct: 0.5, preprodTolerancePts: 1, voiceOnly: true });
  });

  it("encodes pre-prod bands, stages, statistics, rollout and assignment", () => {
    expect(PREPROD.validityBands.meetingFixedPct).toMatchObject({ min: 8, max: 13 });
    expect(PREPROD.validityBands.callsUnder20sPct).toMatchObject({ min: 42, max: 58 });
    expect(PREPROD.validityBands.fakeMeetingsPct.max).toBe(4.5);
    expect(PREPROD.validityBands.judgeAgreementMinPct).toBe(90);
    expect(PREPROD.primaryTolerancePts.meetingFixed).toBe(-2);
    expect(PREPROD.regressionScenarios).toHaveLength(8);
    expect(PREPROD.maxRunsPerExperiment).toBe(3);
    expect(STAGES).toEqual([10, 25, 50, 100]);
    expect(STATS).toMatchObject({ alpha: 0.05, defaultSmallestWinPts: 3, srmPValue: 0.001, coverageFloor: 0.8 });
    expect(ROLLOUT.cooldownHours.default).toBe(24);
    expect(ROLLOUT.holdbackPct.default).toBe(5);
    expect(ROLLOUT.holdbackDays.default).toBe(7);
    expect(ROLLOUT.maxLengthDays.default).toBe(7);
    expect(ASSIGNMENT.buckets).toBe(100);
  });

  it("exposes a serialisable snapshot", () => {
    expect(() => JSON.stringify(specSnapshot())).not.toThrow();
  });
});

describe("PM control bounds", () => {
  it("accepts the defaults and in-range overrides", () => {
    expect(resolvePmSettings(undefined).violations).toEqual([]);
    expect(resolvePmSettings({ smallestWinPts: 5, startPct: 5, holdbackPct: 0, holdbackDays: 14, maxLengthDays: 10 }).violations).toEqual([]);
    expect(resolvePmSettings({ primary: "conversationReach" }).settings.primary).toBe("conversationReach");
  });

  it("rejects values outside the PM ranges", () => {
    const v = resolvePmSettings({ smallestWinPts: 0.5, startPct: 30, holdbackPct: 11, holdbackDays: 2 }).violations;
    expect(v).toHaveLength(4);
  });

  it("allows stricter-only on gates and tolerances, never looser", () => {
    expect(resolvePmSettings({ moderateGateMinLambda: 8, harmlessGateMinLiftPts: 0, guardrailTolerancePts: { earlyDrop: 3 } }).violations).toEqual([]);
    const looser = resolvePmSettings({
      moderateGateMinLambda: 2,
      moderateGateMinLiftPts: 0,
      harmlessGateMinLiftPts: -3,
      coverageFloor: 0.5,
      guardrailTolerancePts: { earlyDrop: 9, fakeMeetings: 1 },
    });
    expect(looser.violations).toHaveLength(6);
  });

  it("allows longer-only stage time and cooldown", () => {
    expect(resolvePmSettings({ minStageHours: 48, cooldownHours: 36 }).violations).toEqual([]);
    expect(resolvePmSettings({ minStageHours: 12, cooldownHours: 6 }).violations).toHaveLength(2);
  });

  it("defaults reproduce the spec defaults", () => {
    expect(defaultPmSettings()).toMatchObject({
      primary: "meetingFixed",
      smallestWinPts: 3,
      startPct: 10,
      requirePmApproval: true,
      holdbackPct: 5,
      holdbackDays: 7,
      harmlessGateMinLiftPts: -1,
      moderateGateMinLiftPts: 1,
      moderateGateMinLambda: 5,
    });
  });
});
