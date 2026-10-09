import type { AuditRecord } from "../contract";
import type { CollectionFactory } from "./collection";

export interface AuditRepo {
  get(id: string): Promise<AuditRecord | undefined>;
  save(audit: AuditRecord): Promise<AuditRecord>;
  list(): Promise<AuditRecord[]>; // oldest first
}

export function createAuditRepo(make: CollectionFactory): AuditRepo {
  const rows = make<AuditRecord>("audits");
  return { get: (id) => rows.get(id), save: (a) => rows.put(a), list: () => rows.list() };
}
