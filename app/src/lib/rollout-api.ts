// Typed client for the staged-rollout endpoints (backend/src/routes/rollouts.ts).
import { api } from "./api";
import {
  rolloutDecisionListSchema,
  rolloutReportSchema,
  rolloutRunListSchema,
  rolloutRunSchema,
  rolloutStateSchema,
  simulationResultSchema,
  type RolloutReport,
  type RolloutState,
  type SimulationResult,
  type RolloutDecisionDto,
  type RolloutRunDto,
  type SimulationRequest,
} from "./api-contract";
import { z } from "zod/v4";

const base = (id: string) => `/experiments/${encodeURIComponent(id)}/rollout`;
const post = <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
  api<T>(path, { method: "POST", body, schema });

export type RolloutAction = "tick" | "approve" | "rollback" | "stop";

export const getSpec = () => api<Record<string, unknown>>("/spec");
export const listRollouts = async (): Promise<RolloutRunDto[]> =>
  (await api("/rollouts", { schema: rolloutRunListSchema })).items;
export const startRollout = (id: string, body: Record<string, unknown> = {}) =>
  post(`/experiments/${encodeURIComponent(id)}/start`, rolloutRunSchema, body);
export const getRolloutState = (id: string): Promise<RolloutState> =>
  api(base(id), { schema: rolloutStateSchema });
export const rolloutAction = (id: string, action: RolloutAction) =>
  post(`${base(id)}/${action}`, z.unknown());
export const getDecisions = async (id: string): Promise<RolloutDecisionDto[]> =>
  (await api(`${base(id)}/decisions`, { schema: rolloutDecisionListSchema })).items;
export const getReport = (id: string): Promise<RolloutReport> =>
  api(`${base(id)}/report`, { schema: rolloutReportSchema });
export const runSimulation = (req: Partial<SimulationRequest>): Promise<SimulationResult> =>
  post("/simulations/rollout", simulationResultSchema, req);

const experimentListSchema = z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })) });
export const listExperiments = async () =>
  (await api("/experiments", { schema: experimentListSchema })).items;
