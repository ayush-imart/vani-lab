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

export const auditStatusSchema = z.enum(["running", "done", "error", "cancelled"]);
export const auditRecordSchema = z.object({
  id: z.string(),
  version: versionSlotSchema,
  status: auditStatusSchema,
  transcript: z.array(transcriptTurnSchema),
  durationSec: z.number(),
  answered: z.boolean(),
  kpis: kpiScoresSchema.optional(),
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
  meetingFixedPct: z.number(),
  avgDurationSec: z.number(),
  answerPct: z.number(),
  locationConfirmedPct: z.number(),
  callbackRequestedPct: z.number(),
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
