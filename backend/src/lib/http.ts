import type { Context } from "hono";
import type { z } from "zod";
import { randomUUID } from "node:crypto";
import { badRequest } from "./errors";

export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("Body must be valid JSON");
  }
  return schema.parse(raw);
}

export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  return schema.parse(c.req.query());
}

export const newId = (prefix: string): string => `${prefix}_${randomUUID().slice(0, 12)}`;
export const nowIso = (): string => new Date().toISOString();
