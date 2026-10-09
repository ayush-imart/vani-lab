import type { Env } from "../lib/env";
import { chooseFactory, memoryFactory, type CollectionFactory } from "./collection";
import { createAuditRepo } from "./audits";
import { createCallRepo } from "./calls";
import { createExperimentRepo } from "./experiments";
import { createNotificationRepo } from "./notifications";
import { createPreprodRepo } from "./preprod";
import { createRubricRepo } from "./rubric";
import { createTrafficRepo } from "./traffic";
import { createVersionRepo } from "./versions";

// Add a new domain repo here (one line) after creating src/repos/<domain>.ts.
export function createRepos(make: CollectionFactory) {
  return {
    versions: createVersionRepo(make),
    experiments: createExperimentRepo(make),
    rubric: createRubricRepo(make),
    calls: createCallRepo(make),
    audits: createAuditRepo(make),
    traffic: createTrafficRepo(make),
    notifications: createNotificationRepo(make),
    preprod: createPreprodRepo(make),
  };
}
export type Repos = ReturnType<typeof createRepos>;

export const createReposFromEnv = (env: Env): Repos => createRepos(chooseFactory(env));
export const createMemoryRepos = (): Repos => createRepos(memoryFactory());
