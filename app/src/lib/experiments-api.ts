// Typed client for experiments and the shared version library (Phase E).
import { z } from "zod/v4";
import { api } from "./api";

export const EXPERIMENT_STATUSES = [
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "rolled_back",
  "ended",
] as const;
export const experimentRiskValues = ["cautious", "standard"] as const;
export const MAX_EXPERIMENT_VERSIONS = 2;
export type ExperimentRisk = (typeof experimentRiskValues)[number];

export const experimentSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  primaryMetric: z.string(),
  baselineVersionId: z.string(),
  challengerVersionId: z.string(),
  status: z.enum(EXPERIMENT_STATUSES),
  riskAppetite: z.enum(experimentRiskValues).optional(),
  startPct: z.number().optional(),
  createdAt: z.string(),
});
export type Experiment = z.infer<typeof experimentSchema>;

export const libraryVersionSchema = z.object({
  id: z.string(),
  label: z.string(),
  slot: z.enum(["A", "B", "C"]).optional(),
  changelog: z.string(),
  createdAt: z.string(),
});
export type LibraryVersion = z.infer<typeof libraryVersionSchema>;

export type CreateExperimentInput = {
  name: string;
  goal: string;
  primaryMetric: string;
  guardrails: string[];
  baselineVersionId: string;
  challengerVersionId: string;
  riskAppetite: ExperimentRisk;
  startPct: number;
};

const createExperimentInputSchema = z
  .object({
    name: z.string().min(1),
    goal: z.string().min(1),
    primaryMetric: z.string().min(1),
    guardrails: z.array(z.string()),
    baselineVersionId: z.string().min(1),
    challengerVersionId: z.string().min(1),
    riskAppetite: z.enum(experimentRiskValues),
    startPct: z.number().int().min(10).max(80).multipleOf(10),
  })
  .refine(
    ({ baselineVersionId, challengerVersionId }) =>
      new Set([baselineVersionId, challengerVersionId]).size === MAX_EXPERIMENT_VERSIONS,
    "An experiment compares exactly two different versions",
  );

const list = <T>(schema: z.ZodType<T>) => z.object({ items: z.array(schema) });

export const listExperiments = async (): Promise<Experiment[]> =>
  (await api("/experiments", { schema: list(experimentSchema) })).items;
export const listVersions = async (): Promise<LibraryVersion[]> =>
  (await api("/versions", { schema: list(libraryVersionSchema) })).items;
export const createExperiment = (input: CreateExperimentInput): Promise<Experiment> =>
  api("/experiments", {
    method: "POST",
    body: createExperimentInputSchema.parse(input),
    schema: experimentSchema,
  });
export const getStartSettings = (id: string) =>
  api<Record<string, unknown>>(`/experiments/${encodeURIComponent(id)}/start-settings`);

// Create, then start with the stored preset. The demo has no real pre-prod run, so the start
// records the gate as "simulated" (allowSimulatedGate), never as passed.
export async function createAndStart(input: CreateExperimentInput): Promise<Experiment> {
  const exp = await createExperiment(input);
  const settings = await getStartSettings(exp.id);
  await api(`/experiments/${encodeURIComponent(exp.id)}/start`, {
    method: "POST",
    body: { ...settings, allowSimulatedGate: true },
  });
  return exp;
}

// Slots (A/B/C) of the versions an experiment compares; drives version scoping on screens.
export function experimentSlots(exp: Experiment | undefined, versions: LibraryVersion[]): string[] {
  if (!exp) return [];
  const slotOf = (id: string) => versions.find((v) => v.id === id)?.slot ?? id;
  return [...new Set([slotOf(exp.baselineVersionId), slotOf(exp.challengerVersionId)])].slice(
    0,
    MAX_EXPERIMENT_VERSIONS,
  );
}

export const STATUS_TONE: Record<Experiment["status"], string> = {
  draft: "neutral",
  scheduled: "blue",
  running: "green",
  paused: "amber",
  completed: "blue",
  rolled_back: "red",
  ended: "neutral",
};
export const statusLabel = (s: Experiment["status"]) => s.replace("_", " ");
