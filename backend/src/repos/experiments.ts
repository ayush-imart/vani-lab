import type { Experiment } from "../contract";
import type { CollectionFactory } from "./collection";

export interface ExperimentRepo {
  list(): Promise<Experiment[]>;
  get(id: string): Promise<Experiment | undefined>;
  save(experiment: Experiment): Promise<Experiment>;
}

export function createExperimentRepo(make: CollectionFactory): ExperimentRepo {
  const rows = make<Experiment>("experiments");
  return { list: () => rows.list(), get: (id) => rows.get(id), save: (e) => rows.put(e) };
}
