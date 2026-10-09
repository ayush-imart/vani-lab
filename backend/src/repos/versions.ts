import type { VersionRecord } from "../contract";
import type { CollectionFactory } from "./collection";

export interface VersionRepo {
  list(): Promise<VersionRecord[]>;
  get(id: string): Promise<VersionRecord | undefined>;
  create(version: VersionRecord): Promise<VersionRecord>; // immutable: no update/delete
}

export function createVersionRepo(make: CollectionFactory): VersionRepo {
  const rows = make<VersionRecord>("versions");
  return {
    list: () => rows.list(),
    get: (id) => rows.get(id),
    create: (version) => rows.put(version),
  };
}
