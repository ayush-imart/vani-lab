// Rollout runs (one per experiment) and the auditable decision log.
import type { RolloutDecisionDto, RolloutRunDto } from "../contract";
import type { CollectionFactory } from "./collection";

// Run plus the engine's internal state: running maxima of ln Lambda (always-valid statistics) and
// the time each guardrail first went on watch.
export type RolloutRunDoc = RolloutRunDto & {
  peaks: Record<string, number>;
  watchSince: Record<string, number>;
};

export interface RolloutRepo {
  getRun(id: string): Promise<RolloutRunDoc | undefined>;
  saveRun(run: RolloutRunDoc): Promise<RolloutRunDoc>;
  listRuns(): Promise<RolloutRunDoc[]>;
  addDecision(decision: RolloutDecisionDto): Promise<void>;
  listDecisions(experimentId: string): Promise<RolloutDecisionDto[]>; // oldest first
}

export function createRolloutRepo(make: CollectionFactory): RolloutRepo {
  const runs = make<RolloutRunDoc>("rollout_runs");
  const decisions = make<RolloutDecisionDto>("rollout_decisions");
  return {
    getRun: (id) => runs.get(id),
    saveRun: (run) => runs.put(run),
    listRuns: () => runs.list(),
    addDecision: async (d) => void (await decisions.put(d)),
    listDecisions: async (experimentId) => (await decisions.list()).filter((d) => d.experimentId === experimentId),
  };
}
