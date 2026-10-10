// Staged-rollout / A-B contract (PM spec). Standalone: depends only on zod and src/spec.ts constants.
import { z } from "zod";
import { GUARDRAIL_IDS, PRIMARY_IDS, SECONDARY_IDS } from "../spec";
import { channelSchema } from "./evaluator";

const isoDate = z.string();
const validDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "must be a valid date");
const slot = z.enum(["A", "B", "C"]);

export const primaryIdSchema = z.enum(PRIMARY_IDS);
export const guardrailIdSchema = z.enum(GUARDRAIL_IDS);
// Evaluation ids: the 9 spec guardrails plus the per-primary extra guardrail for non-Meeting-Fixed primaries.
export const guardrailEvalIdSchema = z.enum([...GUARDRAIL_IDS, "meetingFixedFloor"]);
export const secondaryIdSchema = z.enum(SECONDARY_IDS);
export const guardrailStatusSchema = z.enum(["ok", "watch", "blocked", "rollback", "not_applicable"]);
export type GuardrailStatus = z.infer<typeof guardrailStatusSchema>;

// ---- PM settings (bounds: stricter only / longer only; see GET /spec) ----
export const pmSettingsSchema = z.object({
  primary: primaryIdSchema,
  smallestWinPts: z.number(),
  startPct: z.number().int().min(10).max(80).multipleOf(10),
  maxLengthDays: z.number(),
  requirePmApproval: z.boolean(),
  minStageHours: z.number(),
  cooldownHours: z.number(),
  holdbackPct: z.number().int().min(0).max(10).multipleOf(10),
  holdbackDays: z.number(),
  harmlessGateMinLiftPts: z.number(),
  moderateGateMinLiftPts: z.number(),
  moderateGateMinLambda: z.number(),
  coverageFloor: z.number(),
  guardrailTolerancePts: z.partialRecord(guardrailIdSchema, z.number()),
});
export type PmSettingsDto = z.infer<typeof pmSettingsSchema>;

export const rolloutStartSchema = pmSettingsSchema.partial().extend({
  channel: channelSchema.optional(), // text (default) or voice; voice-only guardrails need voice
  windowStart: validDate.optional(), // default: now. A future start leaves the run "scheduled"
  windowEnd: validDate.optional(), // hard end of the experiment window
  // Demo override: start although the challenger's pre-prod gate has not passed (recorded as "simulated").
  allowSimulatedGate: z.boolean().optional(),
});
export type RolloutStart = z.infer<typeof rolloutStartSchema>;

// ---- evidence ----
export const liftEvidenceSchema = z.object({
  method: z.string(),
  alpha: z.number(),
  tau: z.number(),
  ratio: z.number(),
  nControl: z.number(),
  nTreatment: z.number(),
  rateControl: z.number().nullable(),
  rateTreatment: z.number().nullable(),
  liftPts: z.number().nullable(),
  stdErrPts: z.number().nullable(),
  stages: z.array(
    z.object({
      stage: z.number(),
      nControl: z.number(),
      nTreatment: z.number(),
      rateControl: z.number(),
      rateTreatment: z.number(),
      liftPts: z.number(),
      variance: z.number(),
      weight: z.number(),
    }),
  ),
  lambdaBenefit: z.number(),
  lambdaHarm: z.number(),
  peakLambdaBenefit: z.number(), // running maximum: the always-valid statistic
  peakLambdaHarm: z.number(),
  pBenefit: z.number(), // always-valid p-values = min(1, 1/peak)
  pHarm: z.number(),
  assumptions: z.array(z.string()),
});
export type LiftEvidenceDto = z.infer<typeof liftEvidenceSchema>;

export const guardrailEvalSchema = z.object({
  id: guardrailEvalIdSchema,
  label: z.string(),
  status: guardrailStatusSchema,
  rule: z.string(),
  nControl: z.number(),
  nTreatment: z.number(),
  rateControlPct: z.number().nullable(),
  rateTreatmentPct: z.number().nullable(),
  excessPts: z.number().nullable(), // B - A in pts (fake meetings: B - 1.5 x A)
  tolerancePts: z.number().nullable(),
  lambdaHarm: z.number(),
  peakLambdaHarm: z.number(),
  pHarm: z.number(),
  evidenceSufficient: z.boolean(),
  latency: z.object({ controlP95Sec: z.number().nullable(), treatmentP95Sec: z.number().nullable(), deltaSec: z.number().nullable() }).optional(),
  watchSince: isoDate.optional(),
  reason: z.string(),
});
export type GuardrailEvalDto = z.infer<typeof guardrailEvalSchema>;

export const validitySchema = z.object({
  srm: z.object({
    method: z.string(),
    threshold: z.number(),
    chiSquare: z.number(),
    df: z.number(),
    pValue: z.number().nullable(),
    failed: z.boolean(),
    stages: z.array(z.object({ stage: z.number(), expectedTreatmentShare: z.number(), observedTreatmentShare: z.number(), nControl: z.number(), nTreatment: z.number(), chiSquare: z.number() })),
  }),
  coverage: z.object({ judged: z.number(), total: z.number(), share: z.number().nullable(), floor: z.number(), ok: z.boolean() }),
});

export const secondaryResultSchema = z.object({
  id: secondaryIdSchema,
  label: z.string(),
  baselinePct: z.number().nullable(),
  kind: z.enum(["rate", "median_seconds"]),
  nControl: z.number(),
  nTreatment: z.number(),
  controlValue: z.number().nullable(), // rate in pct, or median seconds
  treatmentValue: z.number().nullable(),
  diff: z.number().nullable(),
  lambdaTwoSided: z.number().nullable(), // indicative current-time Lambda; descriptive only
  significant: z.boolean().nullable(),
  usedForDecision: z.literal(false),
  note: z.string().optional(),
});

export const judgeEvidenceSchema = z.object({
  signal: z.literal("judge_evidence"),
  scale: z.literal("mean judge score, 1-5 (not a rate)"),
  usedForDecision: z.literal(false),
  control: z.object({ calls: z.number(), meanOverall: z.number().nullable() }),
  treatment: z.object({ calls: z.number(), meanOverall: z.number().nullable() }),
});

export const rolloutEvidenceSchema = z.object({
  primary: liftEvidenceSchema,
  primaryId: primaryIdSchema,
  holdback: liftEvidenceSchema.nullable(),
  guardrails: z.array(guardrailEvalSchema),
  validity: validitySchema,
  failedCalls: z.object({ treatmentCalls: z.number(), treatmentFailed: z.number(), pct: z.number().nullable() }),
  secondary: z.array(secondaryResultSchema),
  judgeEvidence: judgeEvidenceSchema,
  calls: z.object({ total: z.number(), judged: z.number() }),
});
export type RolloutEvidenceDto = z.infer<typeof rolloutEvidenceSchema>;

// ---- run + decisions ----
export const rolloutStatusSchema = z.enum(["scheduled", "running", "paused", "completed", "rolled_back", "ended"]);
export const rolloutPhaseSchema = z.enum(["ramp", "holdback", "done"]);
export const rolloutVerdictSchema = z.enum(["winner", "losing", "inconclusive", "rolled_back_manually"]);
export const actionSchema = z.enum(["start", "hold", "advance", "promote", "step_down", "rollback", "pause", "resume", "end", "complete", "alert", "approve"]);
export const triggerSchema = z.enum([
  "started",
  "resumed",
  "gate_met",
  "gates_not_met",
  "cooldown",
  "min_stage_time",
  "insufficient_data",
  "awaiting_pm_approval",
  "coverage_below_floor",
  "srm_failed",
  "failed_calls_over_limit",
  "primary_proven_worse",
  "guardrail_proven_worse",
  "lift_below_step_down",
  "guardrail_on_watch",
  "max_length_reached",
  "window_ended",
  "holdback_lift_shrank",
  "holdback_lift_negative",
  "holdback_finished",
  "pm_approval",
  "pm_rollback",
  "pm_stop",
  "not_running",
  "monitoring",
]);

export const rolloutRunSchema = z.object({
  id: z.string(),
  experimentId: z.string(),
  status: rolloutStatusSchema,
  phase: rolloutPhaseSchema,
  verdict: rolloutVerdictSchema.optional(),
  primary: primaryIdSchema,
  channel: channelSchema,
  controlSlot: slot,
  challengerSlot: slot,
  settings: pmSettingsSchema,
  stages: z.array(z.number().int().min(10).max(90).multipleOf(10)), // ramp stages; promotion advances to 100%
  stagePct: z.number().int().min(0).max(100).multipleOf(10), // treatment %; includes 90% during 10% holdback
  traffic: z.object({ control: z.number(), treatment: z.number() }),
  frozen: z.boolean(),
  pmApproved: z.boolean(),
  preprodGate: z.enum(["pass", "simulated"]),
  simulated: z.boolean(),
  windowStart: isoDate,
  windowEnd: isoDate.optional(),
  startedAt: isoDate,
  stageEnteredAt: isoDate,
  lastChangeAt: isoDate,
  endedAt: isoDate.optional(),
  holdback: z.object({ startedAt: isoDate, liftAtPromotionPts: z.number().nullable(), alerted: z.boolean() }).optional(),
});
export type RolloutRunDto = z.infer<typeof rolloutRunSchema>;

export const rolloutDecisionSchema = z.object({
  id: z.string(),
  experimentId: z.string(),
  at: isoDate,
  actor: z.enum(["engine", "pm"]),
  action: actionSchema,
  trigger: triggerSchema,
  reason: z.string(),
  phase: rolloutPhaseSchema,
  stage: z.number(), // stage the decision was taken in
  fromStage: z.number(),
  toStage: z.number(),
  trafficBefore: z.object({ control: z.number(), treatment: z.number() }),
  trafficAfter: z.object({ control: z.number(), treatment: z.number() }),
  lambdaBenefit: z.number(),
  lambdaHarm: z.number(),
  peakLambdaBenefit: z.number(),
  peakLambdaHarm: z.number(),
  liftPts: z.number().nullable(),
  guardrailStatus: z.partialRecord(guardrailEvalIdSchema, guardrailStatusSchema),
  srmPValue: z.number().nullable(),
  coverage: z.number().nullable(),
  method: z.string(),
  evidence: rolloutEvidenceSchema,
});
export type RolloutDecisionDto = z.infer<typeof rolloutDecisionSchema>;

export const rolloutStateSchema = z.object({
  run: rolloutRunSchema,
  evidence: rolloutEvidenceSchema,
  nextGate: z.string().nullable(), // plain-language description of what the next step needs
});

export const rolloutReportSchema = z.object({
  run: rolloutRunSchema,
  method: z.object({ name: z.string(), alpha: z.number(), tau: z.number(), notes: z.array(z.string()) }),
  evidence: rolloutEvidenceSchema,
  decisions: z.array(rolloutDecisionSchema),
  impact: z.object({ basis: z.enum(["holdback_lift", "stopping_lift", "none"]), liftPts: z.number().nullable(), note: z.string() }),
  verdict: rolloutVerdictSchema.nullable(),
  generatedAt: isoDate,
});

// ---- assignment ----
export const assignmentQuerySchema = z.object({
  glid: z.string().regex(/^\d{1,20}$/),
  pct: z.coerce.number().int().min(0).max(100).multipleOf(10).default(10),
});
export const balanceSellerSchema = z.object({
  glid: z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,20}$/)]),
  leadType: z.string().min(1).max(40),
  firstCall: z.boolean(),
});
export const balanceCheckRequestSchema = z.object({
  pct: z.number().int().min(10).max(100).multipleOf(10),
  sellers: z.array(balanceSellerSchema).min(2).max(100_000),
});

// ---- simulation (synthetic paired calls; clearly labelled, never mixed into /metrics) ----
export const simulationRequestSchema = z.object({
  scenario: z.enum(["true_lift", "bad_variant", "no_difference"]).default("true_lift"),
  trueLiftPts: z.number().min(-30).max(30).optional(), // true_lift: default +5
  baselinePct: z.number().min(0.5).max(60).optional(), // control rate (default: the primary's spec baseline)
  badVariantPct: z.number().min(0).max(60).optional(), // bad_variant treatment rate (default 3.3)
  callsPerDay: z.number().int().min(100).max(10_000).default(2350),
  days: z.number().int().min(1).max(30).default(7),
  evaluateEveryHours: z.number().min(1).max(24).default(12),
  primary: primaryIdSchema.optional(),
  approveAtFinalGate: z.boolean().default(true), // simulate PM approval for the final 90 -> 100 promotion
  controlSlot: slot.default("A"),
  challengerSlot: slot.default("B"),
  seed: z.number().int().default(1),
});
export type SimulationRequest = z.infer<typeof simulationRequestSchema>;
