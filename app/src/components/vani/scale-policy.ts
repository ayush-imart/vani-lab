// Pure scale-up / scale-down policy for the Scale-up page (synthetic data only).
// A backend replaces `simulateBatch`; the traffic and risk rules stay the same.
import {
  DEFAULT_ALPHA,
  initialState,
  sequentialUpdate,
  type SequentialResult,
  type SequentialState,
} from "./sequential-test";
import { versionIds, type Rng, type VersionId } from "./performance-data";

export type RiskAppetite = "conservative" | "moderate" | "fast";
export type TrafficSplit = Record<VersionId, number>;

// Percentage points of traffic moved per scale-up step.
// Conservative was listed as +5 in the brief but "decide by yourself": +1 keeps conservative < moderate < fast.
export const RISK_STEPS: Record<RiskAppetite, number> = {
  conservative: 1,
  moderate: 2.5,
  fast: 10,
};
export const RISK_LABELS: Record<RiskAppetite, string> = {
  conservative: "Conservative",
  moderate: "Moderate",
  fast: "Fast",
};
export const riskAppetites = Object.keys(RISK_STEPS) as RiskAppetite[];

export const INITIAL_TRAFFIC: TrafficSplit = { A: 50, B: 25, C: 25 };
export const DEFAULT_THRESHOLD_PCT = 12;
export const BASELINE: VersionId = "A";
// Synthetic "true" Meeting Fixed rates used by the simulator (match the sample on the pipeline data).
export const TRUE_RATE: Record<VersionId, number> = { A: 0.115, B: 0.132, C: 0.098 };

// The baseline (control) never drops below this share, so there is always something to compare to.
export const BASELINE_FLOOR = 10;

const round1 = (n: number) => Math.round(n * 10) / 10;

export type Rates = Partial<Record<VersionId, number>>;

// Moves up to `step` points to `id`, always taking from the worst-performing version first
// (lowest Meeting Fixed rate; versions with no rate yet are taken from last). The baseline gives
// traffic too but never below BASELINE_FLOOR. Baseline itself is never scaled up.
export function applyScaleUp(
  traffic: TrafficSplit,
  id: VersionId,
  step: number,
  rates: Rates = {},
): TrafficSplit {
  if (id === BASELINE) return traffic;
  const spare = (v: VersionId) =>
    Math.max(0, traffic[v] - (v === BASELINE ? BASELINE_FLOOR : 0));
  const donors = versionIds
    .filter((v) => v !== id && spare(v) > 0)
    .sort((a, b) => (rates[a] ?? Infinity) - (rates[b] ?? Infinity));
  let left = step;
  const next = { ...traffic };
  donors.forEach((v) => {
    const moved = Math.min(left, spare(v));
    next[v] = round1(next[v] - moved);
    left -= moved;
  });
  return { ...next, [id]: round1(traffic[id] + (step - left)) };
}

// Meeting Fixed rate seen since the version's evidence last restarted (undefined with no calls).
export function ratesFrom(evidence: Record<VersionId, VersionEvidence>): Rates {
  const rates: Rates = {};
  versionIds.forEach((v) => {
    const { trials, successes } = evidence[v].below;
    if (trials > 0) rates[v] = successes / trials;
  });
  return rates;
}

// Returns all of `id`'s traffic to the baseline.
export function applyScaleDown(traffic: TrafficSplit, id: VersionId): TrafficSplit {
  if (id === BASELINE) return traffic;
  return { ...traffic, [BASELINE]: round1(traffic[BASELINE] + traffic[id]), [id]: 0 };
}

export function simulateBatch(rng: Rng, calls: number, rate: number): number {
  let successes = 0;
  for (let i = 0; i < calls; i += 1) if (rng() < rate) successes += 1;
  return successes;
}

// ---- Autoscale simulation step (pure; the page owns the timer and the RNG) ----
export const CALLS_PER_TRAFFIC_POINT = 6;

export type VersionEvidence = {
  below: SequentialResult | SequentialState;
  above: SequentialResult | SequentialState;
};
export type AutoscaleEvent = {
  kind: "scale-up" | "scale-down";
  version: VersionId;
  at: number;
  trafficBefore: number;
  trafficAfter: number;
  pValue: number;
  calls: number;
};
export type AutoscaleState = {
  traffic: TrafficSplit;
  evidence: Record<VersionId, VersionEvidence>;
  totals: Record<VersionId, { calls: number; successes: number }>;
  events: AutoscaleEvent[];
  tick: number;
};
export type AutoscaleConfig = {
  thresholdPct: number;
  stepPoints: number;
  autoscale: boolean;
  alpha?: number;
};

const freshEvidence = (): VersionEvidence => ({ below: initialState(), above: initialState() });

export function createAutoscaleState(): AutoscaleState {
  const make = <T>(f: () => T) => ({ A: f(), B: f(), C: f() }) as Record<VersionId, T>;
  return {
    traffic: INITIAL_TRAFFIC,
    evidence: make(freshEvidence),
    totals: make(() => ({ calls: 0, successes: 0 })),
    events: [],
    tick: 0,
  };
}

// One tick: collect calls per version by traffic share, update both mSPRT tests, and (autoscale on)
// scale a version DOWN when its Meeting Fixed rate is below the threshold, UP when above it.
// After acting on a version its evidence restarts, so each action needs fresh always-valid evidence.
export function stepAutoscale(
  state: AutoscaleState,
  rng: Rng,
  config: AutoscaleConfig,
  now: number,
): AutoscaleState {
  const threshold = config.thresholdPct / 100;
  const alpha = config.alpha ?? DEFAULT_ALPHA;
  let traffic = state.traffic;
  const evidence = { ...state.evidence };
  const totals = { ...state.totals };
  const events = [...state.events];

  versionIds.forEach((id) => {
    const calls = Math.round(state.traffic[id] * CALLS_PER_TRAFFIC_POINT);
    if (calls === 0) return;
    const batch = { trials: calls, successes: simulateBatch(rng, calls, TRUE_RATE[id]) };
    totals[id] = {
      calls: totals[id].calls + batch.trials,
      successes: totals[id].successes + batch.successes,
    };
    const below = sequentialUpdate(evidence[id].below, batch, {
      threshold,
      direction: "below",
      alpha,
    });
    const above = sequentialUpdate(evidence[id].above, batch, {
      threshold,
      direction: "above",
      alpha,
    });
    evidence[id] = { below, above };
    if (!config.autoscale || id === BASELINE) return;
    const before = traffic[id];
    if (below.decision === "reject" && before > 0) {
      traffic = applyScaleDown(traffic, id);
      events.unshift({
        kind: "scale-down",
        version: id,
        at: now,
        trafficBefore: before,
        trafficAfter: traffic[id],
        pValue: below.pValue,
        calls: below.trials,
      });
      evidence[id] = freshEvidence();
    } else if (above.decision === "reject") {
      traffic = applyScaleUp(traffic, id, config.stepPoints, ratesFrom(evidence));
      events.unshift({
        kind: "scale-up",
        version: id,
        at: now,
        trafficBefore: before,
        trafficAfter: traffic[id],
        pValue: above.pValue,
        calls: above.trials,
      });
      evidence[id] = freshEvidence();
    }
  });

  return { traffic, evidence, totals, events: events.slice(0, 20), tick: state.tick + 1 };
}
