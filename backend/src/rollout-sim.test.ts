import { describe, expect, it } from "vitest";
import { simulationRequestSchema } from "./contract";
import { runSimulation } from "./services/rollout-sim";

const sim = (o: Record<string, unknown>) => runSimulation(simulationRequestSchema.parse(o));

describe("rollout engine on simulated paired calls", () => {
  it("a true +5 pt variant climbs the stages and is never rolled back", async () => {
    const r = await sim({ scenario: "true_lift", trueLiftPts: 5, days: 14, seed: 7 });
    const stages = r.timeline.filter((t) => t.action === "advance").map((t) => t.stage);
    expect(stages).toContain(25);
    expect(stages).toContain(50);
    const promote = r.timeline.findIndex((t) => t.action === "promote");
    expect(promote).toBeGreaterThanOrEqual(0);
    // nothing is rolled back on the way up (the holdback phase is covered separately)
    expect(r.timeline.slice(0, promote).some((t) => t.action === "rollback")).toBe(false);
    expect(r.simulated).toBe(true);
  }, 60_000);

  it("a bad variant (3.3% vs 18.3%) is rolled back automatically at 10%", async () => {
    const r = await sim({ scenario: "bad_variant", baselinePct: 18.3, badVariantPct: 3.3, primary: "positiveOutcome", days: 7, seed: 3 });
    const rb = r.timeline.find((t) => t.action === "rollback");
    expect(rb).toBeDefined();
    expect(rb?.stage).toBe(0);
    expect(r.finalStatus).toBe("rolled_back");
    // stopped early at the first stage: spec says about 1.3 days of traffic
    expect(Date.parse(rb?.at ?? "") - Date.UTC(2026, 9, 1)).toBeLessThan(3 * 24 * 3_600_000);
    expect(["losing", "inconclusive"]).toContain(r.verdict);
  }, 60_000);

  it("no true difference never reaches the final promotion", async () => {
    const r = await sim({ scenario: "no_difference", days: 10, seed: 11 });
    expect(r.timeline.some((t) => t.action === "promote")).toBe(false);
  }, 60_000);
});
