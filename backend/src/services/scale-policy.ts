// Pure scale-up / scale-down policy, ported from app/src/components/vani/scale-policy.ts
// (copied, not imported across packages). The simulator is replaced by real batches from calls.
import type { RiskAppetite, TrafficSplit, VersionSlot } from "../contract";
import {
  DEFAULT_ALPHA,
  DEFAULT_MIN_TRIALS,
  initialState,
  sequentialUpdate,
  type SequentialResult,
  type SequentialState,
} from "./sequential-test";

export const versionSlots: VersionSlot[] = ["A", "B", "C"];

// Percentage points of traffic moved per scale-up step.
export const RISK_STEPS: Record<RiskAppetite, number> = {
  conservative: 1,
  moderate: 2.5,
  fast: 10,
};
export const INITIAL_TRAFFIC: TrafficSplit = { A: 50, B: 25, C: 25 };
export const DEFAULT_THRESHOLD_PCT = 12;
export const BASELINE: VersionSlot = "A";

// The baseline (control) never drops below this share, so there is always something to compare to.
export const BASELINE_FLOOR = 10;

const round1 = (n: number) => Math.round(n * 10) / 10;

export type Rates = Partial<Record<VersionSlot, number>>;

// Moves up to `step` points to `id`, always taking from the worst-performing version first
// (lowest Meeting Fixed rate; versions with no rate yet are taken from last). The baseline gives
// traffic too but never below BASELINE_FLOOR. Baseline itself is never scaled up.
export function applyScaleUp(
  traffic: TrafficSplit,
  id: VersionSlot,
  step: number,
  rates: Rates = {},
): TrafficSplit {
  if (id === BASELINE) return traffic;
  const spare = (v: VersionSlot) =>
    Math.max(0, traffic[v] - (v === BASELINE ? BASELINE_FLOOR : 0));
  const donors = versionSlots
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
export function ratesFrom(evidence: Record<VersionSlot, Evidence>): Rates {
  const rates: Rates = {};
  versionSlots.forEach((v) => {
    const { trials, successes } = evidence[v].below;
    if (trials > 0) rates[v] = successes / trials;
  });
  return rates;
}

// Returns all of `id`'s traffic to the baseline.
export function applyScaleDown(traffic: TrafficSplit, id: VersionSlot): TrafficSplit {
  if (id === BASELINE) return traffic;
  return { ...traffic, [BASELINE]: round1(traffic[BASELINE] + traffic[id]), [id]: 0 };
}

export type Evidence = {
  below: SequentialResult | SequentialState;
  above: SequentialResult | SequentialState;
};
export type Batch = { trials: number; successes: number };
export type ScaleEvent = {
  kind: "scale-up" | "scale-down";
  version: VersionSlot;
  trafficBefore: number;
  trafficAfter: number;
  pValue: number;
  logLR: number;
  trials: number;
  successes: number;
};
export type TickConfig = {
  thresholdPct: number;
  stepPoints: number;
  autoscale: boolean;
  alpha?: number;
  minTrials?: number;
};
export type TickInput = {
  traffic: TrafficSplit;
  evidence: Record<VersionSlot, Evidence>;
  pending: Record<VersionSlot, Batch>;
  config: TickConfig;
};
export type TickOutput = {
  traffic: TrafficSplit;
  evidence: Record<VersionSlot, Evidence>;
  pending: Record<VersionSlot, Batch>;
  events: ScaleEvent[];
};

export const freshEvidence = (): Evidence => ({ below: initialState(), above: initialState() });
export const emptyBatch = (): Batch => ({ trials: 0, successes: 0 });
export const perVersion = <T>(make: () => T): Record<VersionSlot, T> => ({
  A: make(),
  B: make(),
  C: make(),
});

// One evaluation: feed each version's pending batch into both mSPRT tests; with autoscale on,
// scale a version DOWN when its rate is reliably below the threshold, UP when reliably above.
// After acting on a version its evidence restarts, so each action needs fresh always-valid evidence.
export function evaluateTick(input: TickInput): TickOutput {
  const { config } = input;
  const threshold = config.thresholdPct / 100;
  const alpha = config.alpha ?? DEFAULT_ALPHA;
  const minTrials = config.minTrials ?? DEFAULT_MIN_TRIALS;
  let traffic = input.traffic;
  const evidence = { ...input.evidence };
  const events: ScaleEvent[] = [];

  versionSlots.forEach((id) => {
    const batch = input.pending[id];
    if (batch.trials === 0) return;
    const opts = { threshold, alpha, minTrials };
    const below = sequentialUpdate(evidence[id].below, batch, { ...opts, direction: "below" });
    const above = sequentialUpdate(evidence[id].above, batch, { ...opts, direction: "above" });
    evidence[id] = { below, above };
    if (!config.autoscale || id === BASELINE) return;
    const before = traffic[id];
    if (below.decision === "reject" && before > 0) {
      traffic = applyScaleDown(traffic, id);
      events.push(eventOf("scale-down", id, before, traffic[id], below));
      evidence[id] = freshEvidence();
    } else if (above.decision === "reject") {
      const next = applyScaleUp(traffic, id, config.stepPoints, ratesFrom(evidence));
      if (next[id] === before) return; // nothing left to take from any other version
      traffic = next;
      events.push(eventOf("scale-up", id, before, traffic[id], above));
      evidence[id] = freshEvidence();
    }
  });

  return { traffic, evidence, pending: perVersion(emptyBatch), events };
}

function eventOf(
  kind: ScaleEvent["kind"],
  version: VersionSlot,
  trafficBefore: number,
  trafficAfter: number,
  r: SequentialResult,
): ScaleEvent {
  return {
    kind,
    version,
    trafficBefore,
    trafficAfter,
    pValue: r.pValue,
    logLR: r.logLR,
    trials: r.trials,
    successes: r.successes,
  };
}
