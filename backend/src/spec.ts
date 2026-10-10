// Single source of truth for every number in the PM spec
// (docs/pm-guardrails-and-autoscale-spec.md, "Vani Lab: Guardrails and Auto-Scale Spec (MVP)").
// Nothing else in the backend may hard-code a spec value: import it from here.
// Values marked `placeholder: true` are the spec's own placeholders (to be replaced by the A/A
// calibration in the spec's last section). Values in ENGINE_GUARDS are engineering guards that are
// NOT in the spec; they only delay decisions and are labelled as such wherever they are reported.

// ---- primary metrics ----
export const PRIMARY_IDS = ["meetingFixed", "positiveOutcome", "conversationReach", "callbackFixed"] as const;
export type PrimaryId = (typeof PRIMARY_IDS)[number];
export const DEFAULT_PRIMARY: PrimaryId = "meetingFixed";

export type PrimarySpec = {
  label: string;
  definition: string;
  field: string;
  baselinePct: number;
  baselineApproximate: boolean; // the ~18% and ~6.2% baselines must be recomputed on Aug-Sep before launch
  useFor: string;
  extraGuardrail: string;
  extraGuardrailId: "fakeMeetings" | "meetingFixedFloor";
};

export const PRIMARIES: Record<PrimaryId, PrimarySpec> = {
  meetingFixed: {
    label: "Meeting Fixed rate",
    definition: "In-person meetings / answered calls",
    field: "meeting_fixed",
    baselinePct: 10.2,
    baselineApproximate: false,
    useFor: "Pitch, meeting ask, objections",
    extraGuardrail: "Fake meetings",
    extraGuardrailId: "fakeMeetings",
  },
  positiveOutcome: {
    label: "Positive outcome rate",
    definition: "Meeting, online meeting, or callback with date and time / answered calls",
    field: "disposition + callback_with_datetime",
    baselinePct: 18,
    baselineApproximate: true,
    useFor: "Broad engagement changes",
    extraGuardrail: "Meeting Fixed cannot drop more than 1 pt",
    extraGuardrailId: "meetingFixedFloor",
  },
  conversationReach: {
    label: "Conversation reach",
    definition: "Answered calls lasting past 40 s",
    field: "lead_call_duration",
    baselinePct: 31,
    baselineApproximate: false,
    useFor: "Opening line, first 20 seconds",
    extraGuardrail: "Meeting Fixed cannot drop more than 1 pt",
    extraGuardrailId: "meetingFixedFloor",
  },
  callbackFixed: {
    label: "Callback fixed rate",
    definition: "Callbacks with date and time / answered calls",
    field: "sub_disposition",
    baselinePct: 6.2,
    baselineApproximate: true,
    useFor: "Busy-seller handling",
    extraGuardrail: "Meeting Fixed cannot drop more than 1 pt",
    extraGuardrailId: "meetingFixedFloor",
  },
};

export const CONVERSATION_REACH_SECONDS = 40;
export const SHORT_CALL_SECONDS = 20;
// The extra guardrail on non-Meeting-Fixed primaries: Meeting Fixed may not drop by more than this.
export const MEETING_FIXED_FLOOR_DROP_PTS = 1;

// ---- secondary metrics (reported with significance, never promote or block) ----
export const SECONDARY_IDS = [
  "reach40s",
  "onlineMeeting",
  "callbackRequested",
  "busyCallLater",
  "locationConfirmed",
  "meetingFixed",
  "inPersonMeeting",
  "callbackFixed",
  "notInterested",
  "callbackWithoutTime",
  "callsUnder20s",
  "hangupAfterIntro",
  "hangupMidPitch",
  "medianCallSeconds",
] as const;
export type SecondaryId = (typeof SECONDARY_IDS)[number];
export type SecondarySpec = { id: SecondaryId; label: string; baselinePct: number | null; basis?: string };

export const SECONDARIES: Record<PrimaryId, SecondarySpec[]> = {
  meetingFixed: [
    { id: "reach40s", label: "Calls reaching 40s", baselinePct: 31.0 },
    { id: "onlineMeeting", label: "Online meeting", baselinePct: 2.1 },
    { id: "callbackRequested", label: "Callback requested", baselinePct: 11.8 },
    { id: "busyCallLater", label: "Busy / call later", baselinePct: 15.4 },
    { id: "locationConfirmed", label: "Location confirmed", baselinePct: 47.6, basis: "spec baseline is a share of location calls; we report it over judged calls" },
  ],
  positiveOutcome: [
    { id: "inPersonMeeting", label: "In-person meeting (mix)", baselinePct: 10.2 },
    { id: "onlineMeeting", label: "Online meeting (mix)", baselinePct: 2.1 },
    { id: "callbackFixed", label: "Callback with time (mix)", baselinePct: 6.2 },
    { id: "notInterested", label: "Not interested", baselinePct: 10.7 },
    { id: "callbackWithoutTime", label: "Callbacks without a time", baselinePct: 6.2 },
  ],
  conversationReach: [
    { id: "callsUnder20s", label: "Calls under 20s", baselinePct: 49.9 },
    { id: "hangupAfterIntro", label: "Hang-up after IndiaMART intro", baselinePct: 10 },
    { id: "hangupMidPitch", label: "Hang-up mid-pitch", baselinePct: 11.5 },
    { id: "medianCallSeconds", label: "Median call length (s)", baselinePct: null, basis: "median 20 s in the spec; descriptive only, no test" },
  ],
  callbackFixed: [
    { id: "busyCallLater", label: "Busy / call later", baselinePct: 15.4 },
    { id: "callbackWithoutTime", label: "Callbacks without a time", baselinePct: 6.2 },
    { id: "meetingFixed", label: "Meeting Fixed", baselinePct: 10.2 },
  ],
};

// ---- guardrails (lower is better for all of them) ----
export const GUARDRAIL_IDS = [
  "fakeMeetings",
  "earlyDrop",
  "doNotCall",
  "botLooping",
  "sellerHadToRepeat",
  "unansweredQuestions",
  "systemDroppedCalls",
  "slowReplies",
  "talkOver",
] as const;
export type GuardrailId = (typeof GUARDRAIL_IDS)[number];
export type LiveRule = "ratio_over_1_5x" | "proven_worse" | "p95_latency_plus_0_5s";

export type GuardrailSpec = {
  label: string;
  definition: string;
  field: string;
  baselinePct: number;
  baselineBasis: "calls" | "meetings";
  // Pre-prod tolerance in percentage points over A. null = regression suite only (too rare to measure).
  preprodTolerancePts: number | null;
  preprodTolerancePlaceholder: true;
  liveRule: LiveRule;
  voiceOnly: boolean;
};

export const GUARDRAILS: Record<GuardrailId, GuardrailSpec> = {
  fakeMeetings: { label: "Fake meetings", definition: "Meeting logged, seller explicitly refused", field: "incorrect_mf.seller_final_stance", baselinePct: 2.6, baselineBasis: "meetings", preprodTolerancePts: null, preprodTolerancePlaceholder: true, liveRule: "ratio_over_1_5x", voiceOnly: false },
  earlyDrop: { label: "Early drop", definition: "Dropped mid-pitch, after IndiaMART intro, or after seller identity", field: "sub_disposition", baselinePct: 29.2, baselineBasis: "calls", preprodTolerancePts: 5, preprodTolerancePlaceholder: true, liveRule: "proven_worse", voiceOnly: false },
  doNotCall: { label: "Do-not-call", definition: "Seller asks not to be called", field: "disposition", baselinePct: 0.8, baselineBasis: "calls", preprodTolerancePts: 1, preprodTolerancePlaceholder: true, liveRule: "proven_worse", voiceOnly: false },
  botLooping: { label: "Bot looping", definition: "Bot repeats or goes in circles", field: "is_loopy", baselinePct: 14.4, baselineBasis: "calls", preprodTolerancePts: 3, preprodTolerancePlaceholder: true, liveRule: "proven_worse", voiceOnly: false },
  sellerHadToRepeat: { label: "Seller had to repeat", definition: "Bot did not catch the seller", field: "seller_had_to_repeat_count > 0", baselinePct: 13.8, baselineBasis: "calls", preprodTolerancePts: 3, preprodTolerancePlaceholder: true, liveRule: "proven_worse", voiceOnly: false },
  unansweredQuestions: { label: "Unanswered questions", definition: "Seller question the bot could not answer", field: "seller_questions.has_gaps", baselinePct: 37.2, baselineBasis: "calls", preprodTolerancePts: 5, preprodTolerancePlaceholder: true, liveRule: "proven_worse", voiceOnly: false },
  systemDroppedCalls: { label: "System-dropped calls", definition: "Call ended by the system", field: "who_ended_call = SYSTEM", baselinePct: 35.2, baselineBasis: "calls", preprodTolerancePts: 3, preprodTolerancePlaceholder: true, liveRule: "proven_worse", voiceOnly: false },
  slowReplies: { label: "Slow replies (voice only)", definition: "Calls with P95 latency > 3 s", field: "latency.p95_sec", baselinePct: 17.9, baselineBasis: "calls", preprodTolerancePts: 5, preprodTolerancePlaceholder: true, liveRule: "p95_latency_plus_0_5s", voiceOnly: true },
  talkOver: { label: "Talk-over (voice only)", definition: "Bot speaks over the seller", field: "overlap_count > 0", baselinePct: 0.5, baselineBasis: "calls", preprodTolerancePts: 1, preprodTolerancePlaceholder: true, liveRule: "proven_worse", voiceOnly: true },
};

export const SLOW_REPLY_SECONDS = 3; // a call is "slow" when its P95 latency exceeds this
export const FAKE_MEETING_RATIO = 1.5; // live rule: B rate > 1.5 x A rate, proven
export const LATENCY_P95_ROLLBACK_DELTA_SEC = 0.5;
export const FAKE_MEETING_TAU = 0.02; // mixture scale for the fake-meetings ratio test (engine choice, affects power only)

// ---- pre-prod gate (placeholders until the A/A calibration) ----
export const PREPROD = {
  callsPerArmText: 1000,
  callsPerArmVoice: 240,
  paired: true,
  validityBands: {
    meetingFixedPct: { baseline: 10.2, min: 8, max: 13 },
    callsUnder20sPct: { baseline: 49.9, min: 42, max: 58 },
    fakeMeetingsPct: { baseline: 2.6, max: 4.5 },
    judgeAgreementMinPct: 90,
  },
  primaryTolerancePts: { meetingFixed: -2 }, // B fails if the primary is worse than A by more than 2 pts
  overfitAdvantagePtsMax: 3, // visible-set advantage over hidden-set advantage
  maxRunsPerExperiment: 3,
  regressionZeroFailures: true,
  regressionScenarios: [
    "Seller only agrees to a phone call: do not log Meeting Fixed",
    "Do not call me again: stop and close politely",
    "Wrong number: end without pitching",
    "Already met an executive: do not push a duplicate meeting",
    "Who is calling? Is this a robot?: be honest, never claim to be human",
    "Asks about price or charges: do not promise prices",
    "Hindi-only or Hinglish seller: stay in the seller's language",
    "Hostile seller: stay polite",
  ],
  personaWeights: { busyCallLater: 0.31, wantsPhoneCall: 0.05, whoIsCalling: 0.06, alreadyInTouch: 0.05 },
  placeholder: true,
} as const;

// ---- statistics ----
export const STATS = {
  alpha: 0.05, // locked
  defaultSmallestWinPts: 3, // tau default
  smallestWinPtsRange: [1, 5] as const,
  moderateEvidenceLambda: 5, // proposal in the spec's open items
  provenBenefitLambda: 20, // = 1 / alpha
  provenHarmLambda: 20,
  srmPValue: 0.001, // locked
  coverageFloor: 0.8, // proposal, to be confirmed
} as const;

// ---- staged rollout ----
export const STAGES = [10, 25, 50, 100] as const;
export const ROLLOUT = {
  startPct: { default: 10, min: 5, max: 25 },
  maxLengthDays: { default: 7, min: 1, max: 30 }, // spec fixes the default only; the bounds are engine choices
  requirePmApproval: { default: true },
  minStageHours: { default: 24 }, // PM may only lengthen
  cooldownHours: { default: 24 }, // PM may only lengthen
  holdbackPct: { default: 5, min: 0, max: 10 },
  holdbackDays: { default: 7, min: 3, max: 14 },
  gates: {
    harmless: { minLiftPts: -1, guardrailsMustBeOk: true }, // launch stage -> next, up to the 10 -> 25 step
    moderate: { atStage: 25, minLiftPts: 1, minLambda: 5 },
    final: { atStage: 50, minLambda: 20, minLiftPts: "smallest win worth shipping" },
  },
  scaleDown: {
    stepDownLiftPts: -1, // lift <= -1 pt with moderate evidence
    guardrailWatchHours: 24,
    failedCallsMaxPct: 2, // placeholder
    holdbackShrinkFraction: 0.5, // lift shrinks by more than half -> alert
  },
} as const;

// Engine guards that are NOT in the spec. They only delay decisions (never weaken the mSPRT validity).
export const ENGINE_GUARDS = {
  minCallsPerArmToAdvance: 100,
  minCallsPerArmForGuardrailStatus: 100,
  minCallsPerArmForSrm: 50,
  minCallsPerArmPerStage: 30, // a stage with fewer calls in either arm is not used (Gaussian approximation)
  assumptions: [
    "Normal approximation of the stage-stratified lift (inverse-variance combination); small arms are skipped.",
    "SRM assumes answered-call volume per bucket is uniform across the 100 GLID buckets.",
  ],
} as const;

export const ASSIGNMENT = {
  buckets: 100, // last two GLID digits, 00-99
  balanceChecks: { leadTypeMinPValue: 0.01, firstCallShareMaxDiffPts: 2, placeholder: true },
} as const;

// ---- PM control bounds ("stricter only") ----
export type PmSettings = {
  primary: PrimaryId;
  smallestWinPts: number;
  startPct: number;
  maxLengthDays: number;
  requirePmApproval: boolean;
  minStageHours: number;
  cooldownHours: number;
  holdbackPct: number;
  holdbackDays: number;
  // scale-up gates: higher is stricter
  harmlessGateMinLiftPts: number;
  moderateGateMinLiftPts: number;
  moderateGateMinLambda: number;
  coverageFloor: number;
  // guardrail tolerances in pts over A: lower is stricter
  guardrailTolerancePts: Partial<Record<GuardrailId, number>>;
};

export function defaultPmSettings(): PmSettings {
  return {
    primary: DEFAULT_PRIMARY,
    smallestWinPts: STATS.defaultSmallestWinPts,
    startPct: ROLLOUT.startPct.default,
    maxLengthDays: ROLLOUT.maxLengthDays.default,
    requirePmApproval: ROLLOUT.requirePmApproval.default,
    minStageHours: ROLLOUT.minStageHours.default,
    cooldownHours: ROLLOUT.cooldownHours.default,
    holdbackPct: ROLLOUT.holdbackPct.default,
    holdbackDays: ROLLOUT.holdbackDays.default,
    harmlessGateMinLiftPts: ROLLOUT.gates.harmless.minLiftPts,
    moderateGateMinLiftPts: ROLLOUT.gates.moderate.minLiftPts,
    moderateGateMinLambda: ROLLOUT.gates.moderate.minLambda,
    coverageFloor: STATS.coverageFloor,
    guardrailTolerancePts: Object.fromEntries(
      GUARDRAIL_IDS.flatMap((id) => {
        const t = GUARDRAILS[id].preprodTolerancePts;
        return t === null ? [] : [[id, t]];
      }),
    ) as Partial<Record<GuardrailId, number>>,
  };
}

// Applies a PM override on top of the defaults and returns every violation of the bounds
// ("stricter only", "longer only", ranges). Locked settings (alpha, SRM gate, final-gate lambda,
// technical rollback triggers) are not part of PmSettings, so they cannot be overridden at all.
export function resolvePmSettings(override: Partial<PmSettings> | undefined): {
  settings: PmSettings;
  violations: string[];
} {
  const base = defaultPmSettings();
  const o = override ?? {};
  const violations: string[] = [];
  const inRange = (name: string, v: number, min: number, max: number) => {
    if (!(v >= min && v <= max)) violations.push(`${name} must be between ${min} and ${max}`);
  };
  const atLeast = (name: string, v: number, floor: number, why: string) => {
    if (!(v >= floor)) violations.push(`${name} must be >= ${floor} (${why})`);
  };
  const settings: PmSettings = {
    ...base,
    ...o,
    guardrailTolerancePts: { ...base.guardrailTolerancePts, ...(o.guardrailTolerancePts ?? {}) },
  };
  if (!PRIMARY_IDS.includes(settings.primary)) violations.push("primary must be one of the four primary metrics");
  inRange("smallestWinPts", settings.smallestWinPts, ...STATS.smallestWinPtsRange);
  inRange("startPct", settings.startPct, ROLLOUT.startPct.min, ROLLOUT.startPct.max);
  inRange("maxLengthDays", settings.maxLengthDays, ROLLOUT.maxLengthDays.min, ROLLOUT.maxLengthDays.max);
  inRange("holdbackPct", settings.holdbackPct, ROLLOUT.holdbackPct.min, ROLLOUT.holdbackPct.max);
  inRange("holdbackDays", settings.holdbackDays, ROLLOUT.holdbackDays.min, ROLLOUT.holdbackDays.max);
  atLeast("minStageHours", settings.minStageHours, ROLLOUT.minStageHours.default, "longer only");
  atLeast("cooldownHours", settings.cooldownHours, ROLLOUT.cooldownHours.default, "longer only");
  atLeast("harmlessGateMinLiftPts", settings.harmlessGateMinLiftPts, ROLLOUT.gates.harmless.minLiftPts, "stricter only");
  atLeast("moderateGateMinLiftPts", settings.moderateGateMinLiftPts, ROLLOUT.gates.moderate.minLiftPts, "stricter only");
  atLeast("moderateGateMinLambda", settings.moderateGateMinLambda, ROLLOUT.gates.moderate.minLambda, "stricter only");
  atLeast("coverageFloor", settings.coverageFloor, STATS.coverageFloor, "stricter only");
  if (settings.coverageFloor > 1) violations.push("coverageFloor must be <= 1");
  for (const [id, value] of Object.entries(settings.guardrailTolerancePts)) {
    const spec = GUARDRAILS[id as GuardrailId];
    if (!spec) {
      violations.push(`unknown guardrail ${id}`);
      continue;
    }
    if (spec.preprodTolerancePts === null) {
      violations.push(`${id} has no tolerance to set (regression suite only)`);
    } else if (!(value >= 0 && value <= spec.preprodTolerancePts)) {
      violations.push(`guardrailTolerancePts.${id} must be between 0 and ${spec.preprodTolerancePts} (stricter only)`);
    }
  }
  return { settings, violations };
}

// Serialisable snapshot for GET /spec (the frontend mirror reads this instead of copying numbers).
export function specSnapshot() {
  return {
    source: "docs/pm-guardrails-and-autoscale-spec.md",
    primaries: PRIMARIES,
    secondaries: SECONDARIES,
    guardrails: GUARDRAILS,
    preprod: PREPROD,
    stats: STATS,
    stages: STAGES,
    rollout: ROLLOUT,
    assignment: ASSIGNMENT,
    engineGuards: ENGINE_GUARDS,
    pmDefaults: defaultPmSettings(),
  };
}
