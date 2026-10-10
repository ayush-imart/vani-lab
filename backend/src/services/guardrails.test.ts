import { describe, expect, it } from "vitest";
import type { CallRecord } from "../contract";
import { createRng, type Rng } from "../lib/rng";
import { GUARDRAIL_IDS, type GuardrailId, type PrimaryId } from "../spec";
import { evaluateGuardrails, guardrailStatuses, type GuardrailInput } from "./guardrails";
import { baselineProfile, drawCall, withGuardrailRate, withPrimaryRate, type DrawOptions, type SimProfile } from "./sim-calls";

const isTreatment = (c: CallRecord) => c.version === "B";

function calls(rng: Rng, n: number, version: "A" | "B", profile: SimProfile, stage = 10, options: DrawOptions = {}): CallRecord[] {
  return Array.from({ length: n }, (_, i) => {
    const d = drawCall(rng, profile, options);
    return {
      id: `${version}-${stage}-${i}`,
      glidLast5: "00000",
      cohort: 0,
      version,
      at: 0,
      stage,
      experimentId: "e",
      ...d,
    } as CallRecord;
  });
}

const input = (cs: CallRecord[], over: Partial<GuardrailInput> = {}): GuardrailInput => ({
  calls: cs,
  isTreatment,
  channel: "text",
  primary: "meetingFixed",
  tolerancePts: {},
  prevPeaks: {},
  watchSince: {},
  now: 1_000,
  ...over,
});
const find = (out: ReturnType<typeof evaluateGuardrails>, id: string) => out.evals.find((e) => e.id === id)!;

describe("guardrails engine", () => {
  const base = baselineProfile();

  it("evaluates all 9 guardrails, voice-only ones are not applicable on a text run", () => {
    const rng = createRng(1);
    const cs = [...calls(rng, 1500, "A", base), ...calls(rng, 500, "B", base)];
    const out = evaluateGuardrails(input(cs));
    expect(out.evals.filter((e) => GUARDRAIL_IDS.includes(e.id as GuardrailId))).toHaveLength(9);
    expect(find(out, "slowReplies").status).toBe("not_applicable");
    expect(find(out, "talkOver").status).toBe("not_applicable");
    expect(find(out, "earlyDrop").status).not.toBe("not_applicable");
  });

  it("keeps A/A traffic ok on every applicable guardrail", () => {
    const rng = createRng(2);
    const cs = [...calls(rng, 2000, "A", base), ...calls(rng, 1000, "B", base)];
    const out = evaluateGuardrails(input(cs));
    expect(out.evals.filter((e) => e.status !== "ok" && e.status !== "not_applicable")).toEqual([]);
  });

  it("rolls back when early drop is proven worse", () => {
    const rng = createRng(3);
    const worse = withGuardrailRate(base, "earlyDrop", 45);
    const cs = [...calls(rng, 2000, "A", base), ...calls(rng, 500, "B", worse)];
    const e = find(evaluateGuardrails(input(cs)), "earlyDrop");
    expect(e.status).toBe("rollback");
    expect(e.peakLambdaHarm).toBeGreaterThan(20);
    expect(e.pHarm).toBeLessThan(0.05);
  });

  it("rolls back on fake meetings only when B is proven above 1.5x A", () => {
    const rng = createRng(4);
    const meetingHeavy = withPrimaryRate(base, "meetingFixed", 30); // plenty of meetings to measure
    const fakeBad = withGuardrailRate(meetingHeavy, "fakeMeetings", 9); // 9% vs 2.6% (3.5x)
    const bad = evaluateGuardrails(input([...calls(rng, 3000, "A", meetingHeavy), ...calls(rng, 3000, "B", fakeBad)]));
    expect(find(bad, "fakeMeetings").status).toBe("rollback");
    const fakeMild = withGuardrailRate(meetingHeavy, "fakeMeetings", 3.2); // 1.2x A: below the 1.5x line
    const mild = evaluateGuardrails(input([...calls(rng, 3000, "A", meetingHeavy), ...calls(rng, 3000, "B", fakeMild)]));
    expect(find(mild, "fakeMeetings").status).not.toBe("rollback");
  });

  it("is blocked beyond tolerance and watch within tolerance when harm is moderate but not proven", () => {
    // Sweep seeds for a sample where the peak Lambda lands between 5 and 20, then check both labels.
    const slightly = withGuardrailRate(base, "unansweredQuestions", base.guardrails.unansweredQuestions * 100 + 9);
    let checked = 0;
    for (let seed = 100; seed < 160 && checked === 0; seed += 1) {
      const rng = createRng(seed);
      const cs = [...calls(rng, 500, "A", base), ...calls(rng, 160, "B", slightly)];
      const strict = find(evaluateGuardrails(input(cs, { tolerancePts: { unansweredQuestions: 2 } })), "unansweredQuestions");
      if (strict.peakLambdaHarm < 5 || strict.peakLambdaHarm >= 20) continue;
      const loose = find(evaluateGuardrails(input(cs, { tolerancePts: { unansweredQuestions: 5 } })), "unansweredQuestions");
      expect(strict.status).toBe("blocked"); // excess is ~9 pts, beyond a 2 pt tolerance
      if ((loose.excessPts ?? 0) <= 5) expect(loose.status).toBe("watch");
      checked += 1;
    }
    expect(checked).toBe(1);
  });

  it("does not judge a guardrail below the minimum number of calls per arm", () => {
    const rng = createRng(6);
    const worse = withGuardrailRate(base, "doNotCall", 40);
    const cs = [...calls(rng, 60, "A", base), ...calls(rng, 20, "B", worse)];
    const e = find(evaluateGuardrails(input(cs)), "doNotCall");
    expect(e.evidenceSufficient).toBe(false);
    expect(e.status).toBe("ok");
  });

  it("slow replies: voice run rolls back when P95 latency is +0.5 s over A", () => {
    const rng = createRng(7);
    const cs = [
      ...calls(rng, 400, "A", base, 10, { channel: "voice" }),
      ...calls(rng, 400, "B", base, 10, { channel: "voice", p95LatencyShiftSec: 0.9 }),
    ];
    const e = find(evaluateGuardrails(input(cs, { channel: "voice" })), "slowReplies");
    expect(e.latency?.deltaSec).toBeGreaterThanOrEqual(0.5);
    expect(e.status).toBe("rollback");
    expect(e.reason).toContain("P95");
  });

  it("adds the Meeting Fixed floor guardrail for non-Meeting-Fixed primaries only", () => {
    const rng = createRng(8);
    const cs = [...calls(rng, 1500, "A", base), ...calls(rng, 500, "B", base)];
    expect(find(evaluateGuardrails(input(cs, { primary: "meetingFixed" })), "meetingFixedFloor")).toBeUndefined();
    for (const primary of ["positiveOutcome", "conversationReach", "callbackFixed"] as PrimaryId[]) {
      expect(find(evaluateGuardrails(input(cs, { primary })), "meetingFixedFloor")).toBeDefined();
    }
  });

  it("blocks when Meeting Fixed drops by more than 1 pt, and rolls back when that drop is proven", () => {
    const rng = createRng(9);
    const dropped = withPrimaryRate(base, "meetingFixed", 4); // 10.2 -> 4
    const cs = [...calls(rng, 2500, "A", base), ...calls(rng, 800, "B", dropped)];
    const e = find(evaluateGuardrails(input(cs, { primary: "conversationReach" })), "meetingFixedFloor");
    expect(e.excessPts).toBeGreaterThan(1);
    expect(e.status).toBe("rollback");
  });

  it("keeps the running peak and the first-seen watch time across evaluations", () => {
    const rng = createRng(10);
    const cs = [...calls(rng, 1000, "A", base), ...calls(rng, 400, "B", base)];
    const first = evaluateGuardrails(input(cs, { prevPeaks: { earlyDrop: 3 }, now: 5 }));
    expect(first.peaks.earlyDrop).toBeGreaterThanOrEqual(3); // a peak never decreases
    const watching = evaluateGuardrails(input(cs, { prevPeaks: { earlyDrop: Math.log(8) }, now: 7_000, watchSince: { earlyDrop: 100 } }));
    const e = find(watching, "earlyDrop");
    if (e.status === "watch" || e.status === "blocked") expect(watching.watchSince.earlyDrop).toBe(100);
    expect(guardrailStatuses(watching.evals).earlyDrop).toBe(e.status);
  });
});
