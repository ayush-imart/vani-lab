import { defaultWeights, kpiKeys, overallScore } from "../judge/rubric";
import type { KpiScores, Rubric } from "../contract";
import { badRequest } from "../lib/errors";
import { nowIso } from "../lib/http";
import type { Repos } from "../repos";

export const DEFAULT_GUARDRAILS = ["no_abusive_language", "no_false_claims", "no_pii_requested"];
const WEIGHT_TOLERANCE = 0.01;

export function defaultRubric(): Rubric {
  return {
    primaryMetric: "meetingFixed",
    weights: { ...defaultWeights },
    guardrails: [...DEFAULT_GUARDRAILS],
    updatedAt: nowIso(),
  };
}

export const overallFor = (scores: KpiScores, rubric: Rubric): number =>
  overallScore(scores, rubric.weights);

export function createRubricService(repos: Repos) {
  const get = async (): Promise<Rubric> => (await repos.rubric.getActive()) ?? defaultRubric();
  return {
    get,
    async update(input: Omit<Rubric, "updatedAt">): Promise<Rubric> {
      const sum = kpiKeys.reduce((acc, k) => acc + input.weights[k], 0);
      if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
        throw badRequest(`Weights must sum to 1 (got ${sum.toFixed(3)})`);
      }
      return repos.rubric.saveActive({ ...input, updatedAt: nowIso() });
    },
  };
}
export type RubricService = ReturnType<typeof createRubricService>;
