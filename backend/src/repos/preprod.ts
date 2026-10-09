import type { PreprodRun } from "../contract";
import type { CollectionFactory } from "./collection";

export interface PreprodRepo {
  get(id: string): Promise<PreprodRun | undefined>;
  save(run: PreprodRun): Promise<PreprodRun>;
  list(): Promise<PreprodRun[]>; // oldest first
}

export function createPreprodRepo(make: CollectionFactory): PreprodRepo {
  const rows = make<PreprodRun>("preprod_evals");
  return { get: (id) => rows.get(id), save: (r) => rows.put(r), list: () => rows.list() };
}
