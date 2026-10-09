// Storage primitive. Domain repos (src/repos/<domain>.ts) sit on top of a typed Collection;
// the same code runs on memory or on Supabase (one table per collection, columns id + data jsonb).
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../lib/env";
import { useSupabase } from "../lib/env";

export interface Collection<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  put(item: T): Promise<T>;
  list(): Promise<T[]>; // insertion order, oldest first
  delete(id: string): Promise<void>;
}

export type CollectionFactory = <T extends { id: string }>(table: string) => Collection<T>;

export function memoryFactory(): CollectionFactory {
  const tables = new Map<string, Map<string, unknown>>();
  return <T extends { id: string }>(table: string): Collection<T> => {
    const rows = (tables.get(table) ?? new Map<string, unknown>()) as Map<string, T>;
    tables.set(table, rows);
    return {
      get: async (id) => rows.get(id),
      put: async (item) => {
        rows.set(item.id, structuredClone(item));
        return item;
      },
      list: async () => [...rows.values()].map((r) => structuredClone(r)),
      delete: async (id) => {
        rows.delete(id);
      },
    };
  };
}

export function supabaseFactory(env: Env): CollectionFactory {
  const client = createClient(env.SUPABASE_URL ?? "", env.supabaseKey ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return <T extends { id: string }>(table: string): Collection<T> => ({
    get: async (id) => {
      const { data, error } = await client.from(table).select("data").eq("id", id).maybeSingle();
      if (error) throw new Error(`supabase ${table}.get: ${error.message}`);
      return (data?.data as T | undefined) ?? undefined;
    },
    put: async (item) => {
      const { error } = await client.from(table).upsert({ id: item.id, data: item });
      if (error) throw new Error(`supabase ${table}.put: ${error.message}`);
      return item;
    },
    list: async () => {
      const { data, error } = await client
        .from(table)
        .select("data")
        .order("created_at", { ascending: true });
      if (error) throw new Error(`supabase ${table}.list: ${error.message}`);
      return (data ?? []).map((r) => r.data as T);
    },
    delete: async (id) => {
      const { error } = await client.from(table).delete().eq("id", id);
      if (error) throw new Error(`supabase ${table}.delete: ${error.message}`);
    },
  });
}

export const chooseFactory = (env: Env): CollectionFactory =>
  useSupabase(env) ? supabaseFactory(env) : memoryFactory();
