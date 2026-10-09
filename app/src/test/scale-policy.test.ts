import { describe, expect, it } from "vitest";
import { createRng } from "@/components/vani/performance-data";
import {
  INITIAL_TRAFFIC,
  RISK_STEPS,
  applyScaleDown,
  applyScaleUp,
  createAutoscaleState,
  stepAutoscale,
  type AutoscaleConfig,
} from "@/components/vani/scale-policy";

const config: AutoscaleConfig = { thresholdPct: 12, stepPoints: 10, autoscale: true };

function run(ticks: number, cfg: AutoscaleConfig, seed = 5) {
  const rng = createRng(seed);
  let state = createAutoscaleState();
  for (let i = 0; i < ticks; i += 1) state = stepAutoscale(state, rng, cfg, i);
  return state;
}

describe("scale policy", () => {
  it("orders risk steps conservative < moderate < fast", () => {
    expect(RISK_STEPS).toEqual({ conservative: 1, moderate: 2.5, fast: 10 });
  });

  it("moves the step from the baseline on scale-up and never touches the baseline version", () => {
    const up = applyScaleUp(INITIAL_TRAFFIC, "B", 2.5);
    expect(up).toEqual({ A: 47.5, B: 27.5, C: 25 });
    expect(applyScaleUp(INITIAL_TRAFFIC, "A", 10)).toEqual(INITIAL_TRAFFIC);
  });

  it("returns all traffic to the baseline on scale-down", () => {
    expect(applyScaleDown(INITIAL_TRAFFIC, "C")).toEqual({ A: 75, B: 25, C: 0 });
  });

  it("scales a clearly worse version down once the threshold evidence is strong", () => {
    const state = run(60, config);
    const down = state.events.find((e) => e.kind === "scale-down" && e.version === "C");

    expect(down).toBeDefined();
    expect(down?.pValue).toBeLessThanOrEqual(0.05);
    expect(state.traffic.C).toBe(0);
  });

  it("does nothing automatic when autoscale is off", () => {
    const state = run(60, { ...config, autoscale: false });

    expect(state.events).toHaveLength(0);
    expect(state.traffic).toEqual(INITIAL_TRAFFIC);
  });

  it("makes no decision in the first ticks (little data)", () => {
    expect(run(2, config).events).toHaveLength(0);
  });
});
