import { z } from "zod";

export const kpiKeys = [
  "meetingFixed",
  "callDuration",
  "answerRate",
  "locationConfirmed",
  "callbackRequested",
] as const;
export type KpiKey = (typeof kpiKeys)[number];

// Placeholder weights, matching the frontend; the primary KPI is user-editable.
export const defaultWeights: Record<KpiKey, number> = {
  meetingFixed: 0.4,
  callDuration: 0.15,
  answerRate: 0.15,
  locationConfirmed: 0.15,
  callbackRequested: 0.15,
};

const score = z.number().int().min(1).max(5);

export const judgeVerdictSchema = z.object({
  scores: z.object({
    meetingFixed: score,
    callDuration: score,
    answerRate: score,
    locationConfirmed: score,
    callbackRequested: score,
  }),
  guardrails: z.array(z.object({ name: z.string(), passed: z.boolean(), reason: z.string() })),
  notes: z.string().optional(),
});
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;

export function overallScore(
  scores: Record<KpiKey, number>,
  weights: Record<KpiKey, number> = defaultWeights,
): number {
  const total = kpiKeys.reduce((sum, k) => sum + scores[k] * weights[k], 0);
  return Math.round(total * 10) / 10;
}
