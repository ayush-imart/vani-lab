import { describe, expect, it } from "vitest";
import { availableActions, fmtP, fmtPct, fmtPts, stageStates } from "@/components/vani/rollout-format";

describe("rollout-format", () => {
  it("renders null as No data, never 0%", () => {
    expect(fmtPct(null)).toBe("No data");
    expect(fmtPts(null)).toBe("No data");
    expect(fmtP(null)).toBe("No data");
    expect(fmtPct(0)).toBe("0.0%");
  });
  it("signs lifts", () => {
    expect(fmtPts(5)).toBe("+5.0 pt");
    expect(fmtPts(-1.25)).toBe("-1.3 pt");
  });
  it("marks stage progress", () => {
    expect(stageStates(25).map((s) => s.state)).toEqual(["done", "current", "next", "next"]);
  });
  it("only offers PM approve at the 50% gate", () => {
    expect(availableActions("running", "ramp", 50, false).approve).toBe(true);
    expect(availableActions("running", "ramp", 25, false).approve).toBe(false);
    expect(availableActions("ended", "done", 100, true).stop).toBe(false);
  });
});
