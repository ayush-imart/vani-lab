import type { CallRecord } from "../contract";
import type { CollectionFactory } from "./collection";

export interface CallRepo {
  add(call: CallRecord): Promise<CallRecord>;
  list(): Promise<CallRecord[]>; // oldest first
}

export function createCallRepo(make: CollectionFactory): CallRepo {
  const rows = make<CallRecord>("calls");
  return { add: (c) => rows.put(c), list: () => rows.list() };
}
