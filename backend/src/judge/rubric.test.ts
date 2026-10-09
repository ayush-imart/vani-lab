import { describe, expect, it } from "vitest";
import { judgeVerdictSchema, overallScore } from "./rubric";

const scores = {
  meetingFixed: 5,
  callDuration: 2,
  answerRate: 4,
  locationConfirmed: 4,
  callbackRequested: 2,
};

describe("rubric", () => {
  it("computes the weighted overall score", () => {
    expect(overallScore(scores)).toBe(3.8);
  });

  it("rejects out-of-range scores", () => {
    const bad = { scores: { ...scores, meetingFixed: 6 }, guardrails: [] };
    expect(judgeVerdictSchema.safeParse(bad).success).toBe(false);
  });
});
