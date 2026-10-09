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

const round1 = (n: number) => Math.round(n * 10) / 10;

// Moves up to `step` points from the baseline to `id`. Baseline itself is never scaled up.
export function applyScaleUp(traffic: TrafficSplit, id: VersionSlot, step: number): TrafficSplit {
  if (id === BASELINE) return traffic;
  const moved = Math.min(step, traffic[BASELINE]);
  return {
    ...traffic,
    [BASELINE]: round1(traffic[BASELINE] - moved),
    [id]: round1(traffic[id] + moved),
  };
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
      const next = applyScaleUp(traffic, id, config.stepPoints);
      if (next[id] === before) return; // nothing left to move from the baseline
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
