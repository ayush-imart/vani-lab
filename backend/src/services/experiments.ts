import type { z } from "zod";
import type { Experiment } from "../contract";
import { createExperimentSchema } from "../contract";
import { badRequest, notFound } from "../lib/errors";
import { newId, nowIso } from "../lib/http";
import type { Repos } from "../repos";
import type { VersionService } from "./versions";
import { riskPresetOverride } from "./risk-presets";

export function createExperimentService(repos: Repos, versions: VersionService) {
  return {
    async list(): Promise<Experiment[]> {
      return (await repos.experiments.list()).reverse();
    },
    async get(id: string): Promise<Experiment> {
      const e = await repos.experiments.get(id);
      if (!e) throw notFound("Experiment");
      return e;
    },
    // PM settings to send to POST /experiments/:id/start: the stored risk preset + start size.
    async startSettings(id: string) {
      const e = await this.get(id);
      return riskPresetOverride(e.riskAppetite ?? "standard", e.startPct ?? 10);
    },
    async create(input: z.infer<typeof createExperimentSchema>): Promise<Experiment> {
      if (input.baselineVersionId === input.challengerVersionId) {
        throw badRequest("Baseline and challenger must be different versions");
      }
      await versions.get(input.baselineVersionId); // 404 if unknown
      await versions.get(input.challengerVersionId);
      return repos.experiments.save({
        ...input,
        id: newId("exp"),
        status: "draft",
        createdAt: nowIso(),
      });
    },
  };
}
export type ExperimentService = ReturnType<typeof createExperimentService>;
