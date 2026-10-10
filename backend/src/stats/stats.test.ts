import { describe, expect, it } from "vitest";
import { createRng } from "../lib/rng";
import { STATS } from "../spec";
import { chiSquareSurvival, lnNormalCdf, normalCdf, quantile } from "./normal";
import { alwaysValidP, peakOf, twoSampleMsprt, type StageCounts } from "./msprt-two-sample";
import { srmCheck } from "./srm";

const stage = (s: number, nA: number, xA: number, nB: number, xB: number): StageCounts => ({
  stage: s,
  control: { n: nA, x: xA },
  treatment: { n: nB, x: xB },
});
const opts = { tau: 0.03, alpha: STATS.alpha };

describe("normal and chi-square helpers", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(lnNormalCdf(-10)).toBeCloseTo(-53.231, 2); // ln Phi(-10) = -53.2312
    expect(chiSquareSurvival(3.841, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquareSurvival(10.828, 1)).toBeCloseTo(0.001, 4);
    expect(chiSquareSurvival(5.991, 2)).toBeCloseTo(0.05, 3);
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });
});

describe("two-sample mSPRT on lift", () => {
  it("returns Lambda = 1 and null lift with no data", () => {
    const r = twoSampleMsprt([], opts);
    expect(r).toMatchObject({ liftPts: null, lambdaBenefit: 1, lambdaHarm: 1 });
  });

  it("records method, alpha, tau and assumptions as evidence", () => {
    const r = twoSampleMsprt([stage(10, 900, 90, 100, 10)], opts);
    expect(r.method).toContain("mSPRT");
    expect(r).toMatchObject({ alpha: 0.05, tau: 0.03, ratio: 1 });
    expect(r.assumptions.length).toBeGreaterThan(0);
  });

  it("gives large benefit Lambda for a clear win and large harm Lambda for a clear loss", () => {
    const win = twoSampleMsprt([stage(10, 2000, 204, 2000, 304)], opts); // 10.2% vs 15.2%
    expect(win.liftPts).toBeCloseTo(5, 1);
    expect(win.lambdaBenefit).toBeGreaterThan(STATS.provenBenefitLambda);
    expect(win.lambdaHarm).toBeLessThan(1);
    const loss = twoSampleMsprt([stage(10, 2000, 366, 300, 10)], opts); // 18.3% vs 3.3%
    expect(loss.liftPts).toBeLessThan(-14);
    expect(loss.lambdaHarm).toBeGreaterThan(STATS.provenHarmLambda);
  });

  it("is near 1 or below for no difference", () => {
    const r = twoSampleMsprt([stage(10, 1000, 100, 1000, 100)], opts);
    expect(r.liftPts).toBeCloseTo(0, 6);
    expect(r.lambdaBenefit).toBeLessThan(1.5);
    expect(r.lambdaHarm).toBeLessThan(1.5);
  });

  it("combines stages by inverse variance with weights summing to 1", () => {
    const r = twoSampleMsprt([stage(10, 900, 90, 100, 15), stage(25, 750, 75, 250, 38)], opts);
    expect(r.stages).toHaveLength(2);
    expect(r.stages.reduce((a, s) => a + s.weight, 0)).toBeCloseTo(1, 10);
    const lifts = r.stages.map((s) => s.liftPts);
    expect(r.liftPts).toBeGreaterThanOrEqual(Math.min(...lifts));
    expect(r.liftPts).toBeLessThanOrEqual(Math.max(...lifts));
  });

  it("is stratified: a baseline shift between stages does not fake a lift", () => {
    // Stage 10: A 10%, B 10%. Stage 50: A 20%, B 20% (baseline drifted up). No true lift.
    const stratified = twoSampleMsprt([stage(10, 900, 90, 100, 10), stage(50, 500, 100, 500, 100)], opts);
    expect(stratified.liftPts).toBeCloseTo(0, 6);
    // Naive pooling would credit B (mostly later, higher-baseline traffic) with a lift.
    const pooledA = (90 + 100) / 1400;
    const pooledB = (10 + 100) / 600;
    expect(pooledB - pooledA).toBeGreaterThan(0.04);
  });

  it("skips stages below the per-arm minimum", () => {
    const r = twoSampleMsprt([stage(10, 900, 90, 5, 4)], { ...opts, minPerArm: 30 });
    expect(r.liftPts).toBeNull();
    expect(r.nTreatment).toBe(5);
  });

  it("supports the fake-meeting ratio rule B > 1.5 x A", () => {
    // A 2.6% of 4000 meetings, B 6% of 4000: clearly above 1.5 x 2.6% = 3.9%.
    const bad = twoSampleMsprt([stage(10, 4000, 104, 4000, 240)], { tau: 0.02, alpha: 0.05, ratio: 1.5 });
    expect(bad.lambdaBenefit).toBeGreaterThan(20);
    // B at 3% is below the 1.5x line.
    const fine = twoSampleMsprt([stage(10, 4000, 104, 4000, 120)], { tau: 0.02, alpha: 0.05, ratio: 1.5 });
    expect(fine.lambdaBenefit).toBeLessThan(5);
  });

  it("tracks the running maximum and converts it to an always-valid p-value", () => {
    expect(peakOf(undefined, 2)).toBe(2);
    expect(peakOf(3, 1)).toBe(3);
    expect(alwaysValidP(Math.log(20))).toBeCloseTo(0.05, 10);
    expect(alwaysValidP(-1)).toBe(1);
  });

  it("keeps false winners under alpha when peeking continuously on A/A data", () => {
    const rng = createRng(20261010);
    const runs = 400;
    const perArm = 3000;
    const peekEvery = 100;
    let falseWinners = 0;
    for (let i = 0; i < runs; i += 1) {
      let xa = 0;
      let xb = 0;
      let crossed = false;
      for (let n = 1; n <= perArm && !crossed; n += 1) {
        xa += rng() < 0.102 ? 1 : 0;
        xb += rng() < 0.102 ? 1 : 0;
        if (n % peekEvery === 0) {
          const r = twoSampleMsprt([stage(10, n, xa, n, xb)], { ...opts, minPerArm: 30 });
          crossed = r.lambdaBenefit >= 1 / STATS.alpha;
        }
      }
      if (crossed) falseWinners += 1;
    }
    expect(falseWinners / runs).toBeLessThanOrEqual(STATS.alpha);
  });
});

describe("SRM check", () => {
  it("passes a split that matches the configured share", () => {
    const r = srmCheck([{ stage: 10, treatmentShare: 0.1, nControl: 2110, nTreatment: 240 }], 0.001, 50);
    expect(r.failed).toBe(false);
    expect(r.pValue).toBeGreaterThan(0.001);
  });

  it("fails and reports p < 0.001 when the split is off", () => {
    const r = srmCheck([{ stage: 10, treatmentShare: 0.1, nControl: 2000, nTreatment: 500 }], 0.001, 50);
    expect(r.failed).toBe(true);
    expect(r.pValue).toBeLessThan(0.001);
  });

  it("returns null p-value (no verdict) when there is too little data", () => {
    const r = srmCheck([{ stage: 10, treatmentShare: 0.1, nControl: 10, nTreatment: 1 }], 0.001, 50);
    expect(r).toMatchObject({ pValue: null, failed: false });
  });

  it("sums chi-square over stages", () => {
    const r = srmCheck(
      [
        { stage: 10, treatmentShare: 0.1, nControl: 900, nTreatment: 100 },
        { stage: 25, treatmentShare: 0.25, nControl: 750, nTreatment: 250 },
      ],
      0.001,
      50,
    );
    expect(r.df).toBe(2);
    expect(r.chiSquare).toBeCloseTo(0, 8);
  });
});
