import { describe, expect, it } from "vitest";
import { createRng } from "../lib/rng";
import {
  initialState,
  lnRegIncBeta,
  logLikelihoodRatio,
  sequentialUpdate,
  type SequentialOptions,
} from "./sequential-test";

const below: SequentialOptions = { threshold: 0.12, direction: "below", alpha: 0.05 };

function countSuccesses(rng: () => number, trials: number, rate: number) {
  return Array.from({ length: trials }, () => rng() < rate).filter(Boolean).length;
}

describe("mSPRT for a Bernoulli rate (ported from the frontend)", () => {
  it("matches a numeric integral of the mixture likelihood ratio", () => {
    const s = 7;
    const f = 93;
    const x = 0.12;
    const steps = 200_000;
    let total = 0;
    for (let i = 0; i < steps; i += 1) {
      const t = ((i + 0.5) / steps) * x;
      total += (t / x) ** s * ((1 - t) / (1 - x)) ** f;
    }
    expect(Math.exp(logLikelihoodRatio(s, s + f, below))).toBeCloseTo(total / steps, 4);
  });

  it("mirrors correctly for the above direction", () => {
    const a = logLikelihoodRatio(30, 100, { threshold: 0.2, direction: "above" });
    const b = logLikelihoodRatio(70, 100, { threshold: 0.8, direction: "below" });
    expect(a).toBeCloseTo(b, 8);
  });

  it("computes the incomplete beta for a known value", () => {
    expect(Math.exp(lnRegIncBeta(0.5, 2, 2))).toBeCloseTo(0.5, 10);
  });

  it("makes no decision with little data", () => {
    const r = sequentialUpdate(initialState(), { successes: 0, trials: 20 }, below);
    expect(r.decision).toBe("continue");
    expect(r.trials).toBe(20);
  });

  it("decides when the rate is clearly below the threshold", () => {
    const r = sequentialUpdate(initialState(), { successes: 20, trials: 1000 }, below);
    expect(r.decision).toBe("reject");
    expect(r.pValue).toBeLessThanOrEqual(0.05);
  });

  it("does not decide when the rate is above the threshold", () => {
    const r = sequentialUpdate(initialState(), { successes: 150, trials: 1000 }, below);
    expect(r.decision).toBe("continue");
    expect(r.pValue).toBe(1);
  });

  it("keeps the always-valid p-value non-increasing as data accumulates", () => {
    const rng = createRng(11);
    let state = initialState();
    let last = 1;
    for (let i = 0; i < 100; i += 1) {
      const r = sequentialUpdate(state, { successes: countSuccesses(rng, 20, 0.08), trials: 20 }, below);
      expect(r.pValue).toBeLessThanOrEqual(last);
      last = r.pValue;
      state = r;
    }
  });

  it("peeking does not inflate false positives (fixed seed, rate exactly at the boundary)", () => {
    const rng = createRng(2026);
    const runs = 1500;
    const peekEvery = 10;
    const peeks = 50;
    let msprtRejections = 0;
    let naiveRejections = 0;
    for (let run = 0; run < runs; run += 1) {
      let state = initialState();
      let msprt = false;
      let naive = false;
      for (let t = 0; t < peeks; t += 1) {
        const successes = countSuccesses(rng, peekEvery, 0.12);
        const r = sequentialUpdate(state, { successes, trials: peekEvery }, below);
        state = r;
        if (r.decision === "reject") msprt = true;
        const z = (r.successes / r.trials - 0.12) / Math.sqrt((0.12 * 0.88) / r.trials);
        if (r.trials >= 50 && z < -1.645) naive = true;
      }
      msprtRejections += msprt ? 1 : 0;
      naiveRejections += naive ? 1 : 0;
    }
    expect(msprtRejections / runs).toBeLessThanOrEqual(0.05);
    expect(naiveRejections).toBeGreaterThan(msprtRejections);
  });
});
