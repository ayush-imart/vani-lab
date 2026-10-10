// HTTP contract (zod). The frontend can copy this file: it only depends on zod.
import { z } from "zod/v4";

export const kpiKeys = [
  "meetingFixed",
  "callDuration",
  "answerRate",
  "locationConfirmed",
  "callbackRequested",
] as const;
export const metricKeys = ["overall", ...kpiKeys] as const;

export const versionSlotSchema = z.enum(["A", "B", "C"]);
export const kpiKeySchema = z.enum(kpiKeys);
export const metricKeySchema = z.enum(metricKeys);
export type VersionSlot = z.infer<typeof versionSlotSchema>;
export type KpiKey = z.infer<typeof kpiKeySchema>;
export type MetricKey = z.infer<typeof metricKeySchema>;

const score15 = z.number().min(1).max(5);
const isoDate = z.string();

// ---- error envelope (every non-2xx response) ----
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum([
      "validation_error",
      "bad_request",
      "not_found",
      "conflict",
      "unavailable",
      "internal",
    ]),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

// ---- audits ----
export const transcriptTurnSchema = z.object({
  speaker: z.enum(["bot", "seller"]),
  text: z.string().min(1).max(4000),
});
export const auditRequestSchema = z.object({
  version: versionSlotSchema,
  transcript: z.array(transcriptTurnSchema).min(1).max(200),
  durationSec: z.number().min(0).max(7200),
  answered: z.boolean().optional(), // default true
  glid: z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,20}$/)]).optional(), // masked on ingest; synthetic id generated when omitted
});
export type AuditRequest = z.infer<typeof auditRequestSchema>;
export const auditCreatedSchema = z.object({ auditId: z.string() });

export const guardrailResultSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  reason: z.string(),
});
export const kpiScoresSchema = z.object({
  meetingFixed: score15,
  callDuration: score15,
  answerRate: score15,
  locationConfirmed: score15,
  callbackRequested: score15,
});
export type KpiScores = z.infer<typeof kpiScoresSchema>;
export const kpiWeightsSchema = z.object({
  meetingFixed: z.number().min(0).max(1),
  callDuration: z.number().min(0).max(1),
  answerRate: z.number().min(0).max(1),
  locationConfirmed: z.number().min(0).max(1),
  callbackRequested: z.number().min(0).max(1),
});
export const kpiBreakdownSchema = z.object({
  meetingFixed: z.object({ reason: z.string(), evidence: z.string().optional() }),
  callDuration: z.object({ reason: z.string(), evidence: z.string().optional() }),
  answerRate: z.object({ reason: z.string(), evidence: z.string().optional() }),
  locationConfirmed: z.object({ reason: z.string(), evidence: z.string().optional() }),
  callbackRequested: z.object({ reason: z.string(), evidence: z.string().optional() }),
});

export const auditStatusSchema = z.enum(["running", "done", "error", "cancelled"]);
export const auditRecordSchema = z.object({
  id: z.string(),
  version: versionSlotSchema,
  status: auditStatusSchema,
  transcript: z.array(transcriptTurnSchema),
  durationSec: z.number(),
  answered: z.boolean(),
  kpis: kpiScoresSchema.optional(),
  kpiBreakdown: kpiBreakdownSchema.optional(),
  weights: kpiWeightsSchema.optional(),
  overall: score15.optional(),
  guardrails: z.array(guardrailResultSchema).optional(),
  guardrailsPassed: z.boolean().optional(),
  notes: z.string().optional(),
  model: z.string().optional(),
  error: z.string().optional(),
  createdAt: isoDate,
  completedAt: isoDate.optional(),
});
export type AuditRecord = z.infer<typeof auditRecordSchema>;

export const auditStageSchema = z.enum(["transcript", "guardrails", "kpis", "overall", "saved"]);
export const auditEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stage"),
    stage: auditStageSchema,
    status: z.enum(["running", "done"]),
  }),
  z.object({
    type: z.literal("result"),
    overall: score15,
    kpis: kpiScoresSchema,
    guardrailsPassed: z.boolean(),
    kpiBreakdown: kpiBreakdownSchema.optional(),
    weights: kpiWeightsSchema.optional(),
    guardrails: z.array(guardrailResultSchema).optional(),
    notes: z.string().optional(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditListQuerySchema = z.object({
  version: versionSlotSchema.optional(),
  status: auditStatusSchema.optional(),
  guardrailsPassed: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ---- rubric ----
export const rubricSchema = z.object({
  primaryMetric: kpiKeySchema,
  weights: kpiScoresSchema.extend({
    meetingFixed: z.number().min(0).max(1),
    callDuration: z.number().min(0).max(1),
    answerRate: z.number().min(0).max(1),
    locationConfirmed: z.number().min(0).max(1),
    callbackRequested: z.number().min(0).max(1),
  }), // weights per KPI, must sum to 1 (+-0.01)
  guardrails: z.array(z.string().min(1)).min(1),
  updatedAt: isoDate,
});
export const rubricUpdateSchema = rubricSchema.omit({ updatedAt: true });
export type Rubric = z.infer<typeof rubricSchema>;

// ---- prompt versions (immutable) ----
export const versionRecordSchema = z.object({
  id: z.string(),
  label: z.string(),
  slot: versionSlotSchema.optional(), // live traffic slot, if any
  promptText: z.string(),
  changelog: z.string(),
  parentId: z.string().optional(),
  createdAt: isoDate,
});
export const createVersionSchema = z.object({
  label: z.string().min(1).max(80),
  promptText: z.string().min(1).max(50_000),
  changelog: z.string().min(1).max(2000),
  parentId: z.string().optional(),
  slot: versionSlotSchema.optional(),
});
export const versionDiffSchema = z.object({
  from: z.string(),
  to: z.string(),
  lines: z.array(z.object({ op: z.enum(["same", "add", "del"]), text: z.string() })),
  added: z.number(),
  removed: z.number(),
});
export type VersionRecord = z.infer<typeof versionRecordSchema>;

// ---- experiments ----
export const createExperimentSchema = z.object({
  name: z.string().min(1).max(120),
  goal: z.string().min(1).max(1000),
  primaryMetric: metricKeySchema,
  guardrails: z.array(z.string().min(1)).default([]),
  baselineVersionId: z.string(),
  challengerVersionId: z.string(),
});
export const experimentSchema = createExperimentSchema.extend({
  id: z.string(),
  status: z.enum(["draft", "running", "completed"]),
  createdAt: isoDate,
});
export type Experiment = z.infer<typeof experimentSchema>;

// ---- calls / performance ----
export const callIngestSchema = z.object({
  glid: z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,20}$/)]),
  version: versionSlotSchema,
  at: z.number().optional(), // epoch ms, default now
  durationSec: z.number().min(0).max(7200),
  outcome: z.object({
    answered: z.boolean(),
    meetingFixed: z.boolean(),
    locationConfirmed: z.boolean(),
    callbackRequested: z.boolean(),
  }),
  scores: kpiScoresSchema.optional(), // 1-5 per KPI; overall is computed server-side
});
export type CallIngest = z.infer<typeof callIngestSchema>;

const scoresWithOverall = kpiScoresSchema.extend({ overall: score15 });
export const callRecordSchema = z.object({
  id: z.string(),
  glidLast5: z.string(), // GLIDs are never returned in full
  cohort: z.number().int().min(0).max(9),
  version: versionSlotSchema,
  at: z.number(),
  durationSec: z.number(),
  // Absent on calls created from audits: the judge gives scores, not boolean outcomes.
  outcome: callIngestSchema.shape.outcome.optional(),
  scores: scoresWithOverall.optional(),
  source: z.enum(["ingest", "audit"]).optional(), // default ingest
});
export type CallRecord = z.infer<typeof callRecordSchema>;
export const versionMetricsSchema = z.object({
  version: versionSlotSchema,
  calls: z.number(),
  outcomeCalls: z.number(), // denominator of the pct fields
  // null means "no data" (never 0%)
  meetingFixedPct: z.number().nullable(),
  avgDurationSec: z.number().nullable(),
  answerPct: z.number().nullable(),
  locationConfirmedPct: z.number().nullable(),
  callbackRequestedPct: z.number().nullable(),
  units: z.object({
    pct: z.literal("percent of calls with a boolean outcome"),
    avgDurationSec: z.literal("seconds"),
  }),
});
export type VersionMetrics = z.infer<typeof versionMetricsSchema>;
export const cohortRecordSchema = z.object({
  digit: z.number().int().min(0).max(9),
  calls: z.number(),
  lastCallAt: z.number(),
  byVersion: z.partialRecord(
    versionSlotSchema,
    z.object({ calls: z.number(), scores: scoresWithOverall.nullable() }),
  ),
});
export const leaderboardQuerySchema = z.object({
  sort: metricKeySchema.default("overall"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export const leaderboardRowSchema = z.object({
  rank: z.number(),
  version: versionSlotSchema,
  calls: z.number(),
  scores: scoresWithOverall.nullable(), // mean 1-5 score over calls that carried scores
});

// ---- traffic / autoscale ----
export const trafficSplitSchema = z.object({
  A: z.number().min(0),
  B: z.number().min(0),
  C: z.number().min(0),
});
export type TrafficSplit = z.infer<typeof trafficSplitSchema>;
export const riskAppetiteSchema = z.enum(["conservative", "moderate", "fast"]);
export type RiskAppetite = z.infer<typeof riskAppetiteSchema>;
export const autoscaleSettingsSchema = z.object({
  autoscale: z.boolean(),
  riskAppetite: riskAppetiteSchema,
  thresholdPct: z.number().gt(0).lt(100),
  stepPoints: z.number(), // derived: conservative 1, moderate 2.5, fast 10
});
export const autoscaleSettingsUpdateSchema = z
  .object({
    autoscale: z.boolean(),
    riskAppetite: riskAppetiteSchema,
    thresholdPct: z.number().gt(0).lt(100),
  })
  .partial();
export const outcomeUpdateSchema = z.object({
  version: versionSlotSchema,
  trials: z.number().int().min(0),
  successes: z.number().int().min(0),
});
const sequentialSchema = z.object({
  successes: z.number(),
  trials: z.number(),
  logLR: z.number().optional(),
  pValue: z.number().optional(),
  decision: z.enum(["reject", "continue"]).optional(),
});
export const autoscaleStateSchema = z.object({
  traffic: trafficSplitSchema,
  settings: autoscaleSettingsSchema,
  alpha: z.number(),
  minTrials: z.number(),
  evidence: z.record(
    versionSlotSchema,
    z.object({ below: sequentialSchema, above: sequentialSchema }),
  ),
  pending: z.record(versionSlotSchema, z.object({ trials: z.number(), successes: z.number() })),
  totals: z.record(versionSlotSchema, z.object({ trials: z.number(), successes: z.number() })),
});
export const decisionRecordSchema = z.object({
  id: z.string(),
  at: isoDate,
  version: versionSlotSchema,
  decision: z.enum(["scale-up", "scale-down"]),
  trafficBefore: z.number(),
  trafficAfter: z.number(),
  pValue: z.number(),
  logLR: z.number(),
  trials: z.number(),
  successes: z.number(),
  alpha: z.number(),
  thresholdPct: z.number(),
  method: z.literal("mSPRT"),
});
export type DecisionRecord = z.infer<typeof decisionRecordSchema>;
export const tickResultSchema = z.object({
  traffic: trafficSplitSchema,
  decisions: z.array(decisionRecordSchema),
});

// ---- notifications ----
export const notificationSchema = z.object({
  id: z.string(),
  kind: z.enum(["scale-down", "scale-up", "info"]),
  title: z.string(),
  body: z.string(),
  version: versionSlotSchema.optional(),
  read: z.boolean(),
  createdAt: isoDate,
});
export type Notification = z.infer<typeof notificationSchema>;
export const notificationPrefsSchema = z.object({
  inApp: z.boolean(),
  gchat: z.boolean(), // stub: nothing is sent externally yet
  whatsapp: z.boolean(), // stub
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

// ---- pre-prod gate ----
export const preprodCheckIds = [
  "language_matching",
  "consent_before_meeting",
  "respect_dnc",
  "polite_objection_handling",
] as const;
export const preprodCheckIdSchema = z.enum(preprodCheckIds);
export type PreprodCheckId = z.infer<typeof preprodCheckIdSchema>;
export const severitySchema = z.enum(["blocker", "major", "minor"]);
export const preprodScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  check: preprodCheckIdSchema,
  severity: severitySchema,
  description: z.string(),
  expected: z.enum(["pass", "fail"]), // what the check should conclude for this fixture
  transcript: z.array(transcriptTurnSchema), // synthetic bot transcript fixture
});
export type PreprodScenario = z.infer<typeof preprodScenarioSchema>;
export const preprodCheckSchema = z.object({
  id: preprodCheckIdSchema,
  label: z.string(),
  description: z.string(),
});
export const preprodRunRequestSchema = z.object({
  versionId: z.string().min(1),
  scenarioIds: z.array(z.string()).min(1).optional(), // default: whole catalogue
  real: z.boolean().default(false), // true = use the real Eve judge (one LLM call per scenario, max 4)
});
export const preprodResultSchema = z.object({
  scenarioId: z.string(),
  check: preprodCheckIdSchema,
  severity: severitySchema,
  expected: z.enum(["pass", "fail"]),
  passed: z.boolean(), // what the judge concluded
  ok: z.boolean(), // passed matches expected
  reason: z.string(),
  model: z.string(),
});
export const preprodRunSchema = z.object({
  id: z.string(),
  versionId: z.string(),
  status: z.enum(["running", "done", "error"]),
  real: z.boolean(),
  results: z.array(preprodResultSchema),
  error: z.string().optional(),
  startedAt: isoDate,
  completedAt: isoDate.optional(),
});
export type PreprodRun = z.infer<typeof preprodRunSchema>;
export const gateStatusSchema = z.enum(["pass", "fail", "pending"]);
export const preprodGateSchema = z.object({
  versionId: z.string(),
  status: gateStatusSchema,
  lastRunId: z.string().optional(),
  checks: z.array(
    z.object({
      id: preprodCheckIdSchema,
      label: z.string(),
      status: gateStatusSchema,
      reasons: z.array(z.string()),
      scenarios: z.array(
        z.object({
          scenarioId: z.string(),
          status: gateStatusSchema,
          severity: severitySchema,
          reason: z.string().optional(),
        }),
      ),
    }),
  ),
});
export type PreprodGate = z.infer<typeof preprodGateSchema>;

// ---- live voice session scaffold (Sarvam Voice Agents) ----
export const sessionRequestSchema = z.object({ versionId: versionSlotSchema });
export const sessionConfigSchema = z.object({
  versionId: versionSlotSchema,
  orgId: z.string(),
  workspaceId: z.string(),
  appId: z.string(),
  baseUrl: z.string(), // pass as ConversationAgent baseUrl; the backend adds the API key
  inputSampleRate: z.literal(16000),
  outputSampleRate: z.literal(16000),
});

// ---- staged rollout (mirror of backend/src/contract/rollout.ts + the spec id lists) ----
export const channelSchema = z.enum(["text", "voice"]);
export const PRIMARY_IDS = ["meetingFixed", "positiveOutcome", "conversationReach", "callbackFixed"] as const;
export const GUARDRAIL_IDS = ["fakeMeetings","earlyDrop","doNotCall","botLooping","sellerHadToRepeat","unansweredQuestions","systemDroppedCalls","slowReplies","talkOver"] as const;
export const SECONDARY_IDS = ["reach40s","onlineMeeting","callbackRequested","busyCallLater","locationConfirmed","meetingFixed","inPersonMeeting","callbackFixed","notInterested","callbackWithoutTime","callsUnder20s","hangupAfterIntro","hangupMidPitch","medianCallSeconds"] as const;
// Staged-rollout / A-B contract (PM spec). Standalone: depends only on zod and src/spec.ts constants.

const slot = versionSlotSchema;

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
  startPct: z.number(),
  maxLengthDays: z.number(),
  requirePmApproval: z.boolean(),
  minStageHours: z.number(),
  cooldownHours: z.number(),
  holdbackPct: z.number(),
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
  windowStart: isoDate.optional(), // default: now. A future start leaves the run "scheduled"
  windowEnd: isoDate.optional(), // hard end of the experiment window
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
  stages: z.array(z.number()), // ramp stages (treatment %)
  stagePct: z.number(), // treatment % in force (holdback phase: 100 - holdbackPct)
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
  pct: z.coerce.number().min(0).max(100).default(10),
});
export const balanceSellerSchema = z.object({
  glid: z.union([z.number().int().nonnegative(), z.string().regex(/^\d{1,20}$/)]),
  leadType: z.string().min(1).max(40),
  firstCall: z.boolean(),
});
export const balanceCheckRequestSchema = z.object({
  pct: z.number().min(1).max(100),
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
  approveAtFinalGate: z.boolean().default(true), // simulate the PM approval click at 50 -> 100
  controlSlot: slot.default("A"),
  challengerSlot: slot.default("B"),
  seed: z.number().int().default(1),
});
export type SimulationRequest = z.infer<typeof simulationRequestSchema>;

export const simulationResultSchema = z.object({
  simulated: z.literal(true),
  notice: z.string(),
  scenario: simulationRequestSchema.shape.scenario,
  truth: z.object({ controlPct: z.number(), treatmentPct: z.number() }),
  timeline: z.array(
    z.object({
      at: z.string(),
      stage: z.number(),
      action: z.string(),
      trigger: z.string(),
      liftPts: z.number().nullable(),
      lambdaBenefit: z.number(),
      lambdaHarm: z.number(),
      reason: z.string(),
    }),
  ),
  finalStatus: rolloutStatusSchema,
  finalStagePct: z.number(),
  verdict: rolloutVerdictSchema.nullable(),
  report: rolloutReportSchema,
});
export type SimulationResult = z.infer<typeof simulationResultSchema>;
export type RolloutState = z.infer<typeof rolloutStateSchema>;
export type RolloutReport = z.infer<typeof rolloutReportSchema>;
export type SecondaryResult = z.infer<typeof secondaryResultSchema>;
export type RolloutVerdict = z.infer<typeof rolloutVerdictSchema>;
export const rolloutRunListSchema = z.object({ items: z.array(rolloutRunSchema) });
export const rolloutDecisionListSchema = z.object({ items: z.array(rolloutDecisionSchema) });
