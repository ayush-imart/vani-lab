import type { VersionRecord } from "../contract";
import type { CollectionFactory } from "./collection";

export interface VersionRepo {
  list(): Promise<VersionRecord[]>;
  get(id: string): Promise<VersionRecord | undefined>;
  create(version: VersionRecord): Promise<VersionRecord>;
  save(version: VersionRecord): Promise<VersionRecord>; // metadata edits only (prompt text stays immutable)
  delete(id: string): Promise<void>;
}

export function createVersionRepo(make: CollectionFactory): VersionRepo {
  const rows = make<VersionRecord>("versions");
  return {
    list: () => rows.list(),
    get: (id) => rows.get(id),
    create: (version) => rows.put(version),
    save: (version) => rows.put(version),
    delete: (id) => rows.delete(id),
  };
}
