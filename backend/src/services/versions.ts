import type { VersionRecord } from "../contract";
import { createVersionSchema, updateVersionSchema } from "../contract";
import type { z } from "zod";
import { badRequest, conflict, notFound } from "../lib/errors";
import { newId, nowIso } from "../lib/http";
import type { Repos } from "../repos";

type DiffLine = { op: "same" | "add" | "del"; text: string };

// Exact line diff via longest common subsequence (deterministic, not a heuristic).
export function diffLines(from: string, to: string): DiffLine[] {
  const a = from.split("\n");
  const b = to.split("\n");
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = lcs[i] as number[];
      row[j] =
        a[i] === b[j]
          ? ((lcs[i + 1] as number[])[j + 1] as number) + 1
          : Math.max((lcs[i + 1] as number[])[j] as number, row[j + 1] as number);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: "same", text: a[i] as string });
      i += 1;
      j += 1;
    } else if (((lcs[i + 1] as number[])[j] as number) >= ((lcs[i] as number[])[j + 1] as number)) {
      out.push({ op: "del", text: a[i] as string });
      i += 1;
    } else {
      out.push({ op: "add", text: b[j] as string });
      j += 1;
    }
  }
  while (i < a.length) out.push({ op: "del", text: a[i++] as string });
  while (j < b.length) out.push({ op: "add", text: b[j++] as string });
  return out;
}

const SEED: { id: "A" | "B" | "C"; label: string }[] = [
  { id: "A", label: "Baseline" },
  { id: "B", label: "Challenger B" },
  { id: "C", label: "Challenger C" },
];

export function createVersionService(repos: Repos) {
  async function ensureSeed(): Promise<void> {
    if ((await repos.versions.list()).length > 0) return;
    for (const s of SEED) {
      await repos.versions.create({
        id: s.id,
        label: s.label,
        slot: s.id,
        promptText: `Placeholder prompt for version ${s.id}. Replace by saving a new version.`,
        changelog: "Seed version (placeholder).",
        createdAt: nowIso(),
      });
    }
  }
  async function get(id: string): Promise<VersionRecord> {
    await ensureSeed();
    const v = await repos.versions.get(id);
    if (!v) throw notFound(`Version ${id}`);
    return v;
  }
  return {
    ensureSeed,
    get,
    async list(): Promise<VersionRecord[]> {
      await ensureSeed();
      return (await repos.versions.list()).reverse();
    },
    // Save-as-new: prompt text is immutable.
    async create(input: z.infer<typeof createVersionSchema>): Promise<VersionRecord> {
      await ensureSeed();
      if (input.parentId) await get(input.parentId);
      return repos.versions.create({
        id: newId("ver"),
        label: input.label,
        promptText: input.promptText,
        changelog: input.changelog,
        ...(input.parentId ? { parentId: input.parentId } : {}),
        ...(input.slot ? { slot: input.slot } : {}),
        createdAt: nowIso(),
      });
    },
    // Library edits: label/changelog only. The prompt text is immutable (save a new version instead).
    async update(id: string, input: z.infer<typeof updateVersionSchema>): Promise<VersionRecord> {
      const v = await get(id);
      return repos.versions.save({
        ...v,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.changelog !== undefined ? { changelog: input.changelog } : {}),
      });
    },
    // Delete from the library. Slot-bound versions (A/B/C) and versions an experiment or a child
    // version references cannot be deleted, so no experiment loses its definition.
    async remove(id: string): Promise<{ deleted: string }> {
      const v = await get(id);
      if (v.slot) throw conflict(`Version ${id} is bound to slot ${v.slot} and cannot be deleted`);
      const exps = await repos.experiments.list();
      const used = exps.find((e) => e.baselineVersionId === id || e.challengerVersionId === id);
      if (used) throw conflict(`Version ${id} is used by experiment ${used.id}`);
      const child = (await repos.versions.list()).find((x) => x.parentId === id);
      if (child) throw conflict(`Version ${id} is the parent of ${child.id}`);
      await repos.versions.delete(id);
      return { deleted: id };
    },
    // Ancestor chain, newest first (the version itself first).
    async history(id: string): Promise<VersionRecord[]> {
      const chain: VersionRecord[] = [];
      let cursor: string | undefined = id;
      while (cursor) {
        if (chain.some((v) => v.id === cursor)) throw badRequest("Version parent cycle");
        const v: VersionRecord = await get(cursor);
        chain.push(v);
        cursor = v.parentId;
      }
      return chain;
    },
    async diff(fromId: string, toId: string) {
      const [from, to] = await Promise.all([get(fromId), get(toId)]);
      const lines = diffLines(from.promptText, to.promptText);
      return {
        from: from.id,
        to: to.id,
        lines,
        added: lines.filter((l) => l.op === "add").length,
        removed: lines.filter((l) => l.op === "del").length,
      };
    },
  };
}
export type VersionService = ReturnType<typeof createVersionService>;
