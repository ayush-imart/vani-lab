// Traffic split, autoscale settings, mSPRT evidence state and the auditable decision log.
import type { DecisionRecord, RiskAppetite, TrafficSplit, VersionSlot } from "../contract";
import type { SequentialResult, SequentialState } from "../services/sequential-test";
import type { CollectionFactory } from "./collection";

const CURRENT = "current";

export type SettingsDoc = {
  autoscale: boolean;
  riskAppetite: RiskAppetite;
  thresholdPct: number;
};
export type Batch = { trials: number; successes: number };
export type Evidence = {
  below: SequentialResult | SequentialState;
  above: SequentialResult | SequentialState;
};
export type StateDoc = {
  evidence: Record<VersionSlot, Evidence>;
  pending: Record<VersionSlot, Batch>;
  totals: Record<VersionSlot, Batch>;
};

export interface TrafficRepo {
  getTraffic(): Promise<TrafficSplit | undefined>;
  saveTraffic(split: TrafficSplit): Promise<void>;
  getSettings(): Promise<SettingsDoc | undefined>;
  saveSettings(settings: SettingsDoc): Promise<void>;
  getState(): Promise<StateDoc | undefined>;
  saveState(state: StateDoc): Promise<void>;
  addDecision(decision: DecisionRecord): Promise<void>;
  listDecisions(): Promise<DecisionRecord[]>; // oldest first
}

export function createTrafficRepo(make: CollectionFactory): TrafficRepo {
  const traffic = make<TrafficSplit & { id: string }>("traffic_allocations");
  const settings = make<SettingsDoc & { id: string }>("autoscale_settings");
  const state = make<StateDoc & { id: string }>("autoscale_state");
  const decisions = make<DecisionRecord>("autoscale_decisions");
  return {
    getTraffic: async () => {
      const row = await traffic.get(CURRENT);
      return row ? { A: row.A, B: row.B, C: row.C } : undefined;
    },
    saveTraffic: async (split) => void (await traffic.put({ ...split, id: CURRENT })),
    getSettings: async () => {
      const row = await settings.get(CURRENT);
      return row
        ? { autoscale: row.autoscale, riskAppetite: row.riskAppetite, thresholdPct: row.thresholdPct }
        : undefined;
    },
    saveSettings: async (value) => void (await settings.put({ ...value, id: CURRENT })),
    getState: async () => {
      const row = await state.get(CURRENT);
      return row ? { evidence: row.evidence, pending: row.pending, totals: row.totals } : undefined;
    },
    saveState: async (value) => void (await state.put({ ...value, id: CURRENT })),
    addDecision: async (d) => void (await decisions.put(d)),
    listDecisions: () => decisions.list(),
  };
}
