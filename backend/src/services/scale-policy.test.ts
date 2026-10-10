import { describe, expect, it } from "vitest";
import {
  INITIAL_TRAFFIC,
  RISK_STEPS,
  applyScaleDown,
  applyScaleUp,
  emptyBatch,
  evaluateTick,
  freshEvidence,
  perVersion,
  type TickConfig,
} from "./scale-policy";

const config: TickConfig = { thresholdPct: 12, stepPoints: 10, autoscale: true };
const input = (pendingC: { trials: number; successes: number }, over?: Partial<TickConfig>) => ({
  traffic: INITIAL_TRAFFIC,
  evidence: perVersion(freshEvidence),
  pending: { ...perVersion(emptyBatch), C: pendingC },
  config: { ...config, ...over },
});

describe("scale policy", () => {
  it("orders risk steps conservative < moderate < fast", () => {
    expect(RISK_STEPS).toEqual({ conservative: 1, moderate: 2.5, fast: 10 });
  });

  it("moves the step from the baseline on scale-up and never touches the baseline version", () => {
    expect(applyScaleUp(INITIAL_TRAFFIC, "B", 2.5)).toEqual({ A: 47.5, B: 27.5, C: 25 });
    expect(applyScaleUp(INITIAL_TRAFFIC, "A", 10)).toEqual(INITIAL_TRAFFIC);
  });

  it("returns all traffic to the baseline on scale-down", () => {
    expect(applyScaleDown(INITIAL_TRAFFIC, "C")).toEqual({ A: 75, B: 25, C: 0 });
    expect(applyScaleDown(INITIAL_TRAFFIC, "A")).toEqual(INITIAL_TRAFFIC);
  });

  it("scales a clearly worse version down with auditable evidence", () => {
    const out = evaluateTick(input({ trials: 1000, successes: 20 }));
    expect(out.traffic).toEqual({ A: 75, B: 25, C: 0 });
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ kind: "scale-down", version: "C", trials: 1000, successes: 20 });
    expect(out.events[0]?.pValue).toBeLessThanOrEqual(0.05);
    expect(out.evidence.C.below.trials).toBe(0); // evidence restarts after acting
  });

  it("scales a clearly better version up by the step", () => {
    const out = evaluateTick(input({ trials: 1000, successes: 200 }));
    expect(out.traffic).toEqual({ A: 40, B: 25, C: 35 });
    expect(out.events[0]?.kind).toBe("scale-up");
  });

  it("does nothing automatic when autoscale is off, but still records evidence", () => {
    const out = evaluateTick(input({ trials: 1000, successes: 20 }, { autoscale: false }));
    expect(out.events).toHaveLength(0);
    expect(out.traffic).toEqual(INITIAL_TRAFFIC);
    expect(out.evidence.C.below.trials).toBe(1000);
  });

  it("never scales the baseline", () => {
    const out = evaluateTick({
      ...input({ trials: 0, successes: 0 }),
      pending: { ...perVersion(emptyBatch), A: { trials: 1000, successes: 20 } },
    });
    expect(out.events).toHaveLength(0);
    expect(out.traffic).toEqual(INITIAL_TRAFFIC);
  });

  it("waits for the minimum number of calls", () => {
    const out = evaluateTick(input({ trials: 30, successes: 0 }));
    expect(out.events).toHaveLength(0);
  });
});

describe("applyScaleUp takes from the worst performer first", () => {
  it("takes from the lowest-rate version before the baseline", () => {
    const next = applyScaleUp({ A: 50, B: 25, C: 25 }, "B", 10, { A: 0.115, B: 0.132, C: 0.098 });
    expect(next).toEqual({ A: 50, B: 35, C: 15 });
  });

  it("moves on to the next worst once the worst is empty", () => {
    expect(applyScaleUp({ A: 50, B: 45, C: 5 }, "B", 10, { A: 0.115, C: 0.098 })).toEqual({ A: 45, B: 55, C: 0 });
  });

  it("never takes the baseline below its floor", () => {
    expect(applyScaleUp({ A: 10, B: 90, C: 0 }, "B", 10, { A: 0.115 })).toEqual({ A: 10, B: 90, C: 0 });
  });
});
