import type { DecisionRecord, TrafficSplit, VersionSlot } from "../contract";
import { badRequest } from "../lib/errors";
import { newId, nowIso } from "../lib/http";
import { log } from "../lib/logger";
import type { Repos } from "../repos";
import type { SettingsDoc, StateDoc } from "../repos/traffic";
import type { NotificationService } from "./notifications";
import {
  DEFAULT_THRESHOLD_PCT,
  INITIAL_TRAFFIC,
  RISK_STEPS,
  emptyBatch,
  evaluateTick,
  freshEvidence,
  perVersion,
} from "./scale-policy";
import { DEFAULT_ALPHA, DEFAULT_MIN_TRIALS } from "./sequential-test";

const SPLIT_TOLERANCE = 0.01;
const DEFAULT_SETTINGS: SettingsDoc = {
  autoscale: true,
  riskAppetite: "moderate",
  thresholdPct: DEFAULT_THRESHOLD_PCT,
};

const withStep = (s: SettingsDoc) => ({ ...s, stepPoints: RISK_STEPS[s.riskAppetite] });
const freshState = (): StateDoc => ({
  evidence: perVersion(freshEvidence),
  pending: perVersion(emptyBatch),
  totals: perVersion(emptyBatch),
});

export function createAutoscaleService(repos: Repos, notifications: NotificationService) {
  let lock: Promise<unknown> = Promise.resolve();
  // Serialise read-modify-write cycles on the shared evidence state.
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = lock.then(fn, fn);
    lock = next.catch(() => undefined);
    return next;
  };

  const getTraffic = async (): Promise<TrafficSplit> =>
    (await repos.traffic.getTraffic()) ?? INITIAL_TRAFFIC;
  const getSettings = async (): Promise<SettingsDoc> =>
    (await repos.traffic.getSettings()) ?? DEFAULT_SETTINGS;
  const getState = async (): Promise<StateDoc> => (await repos.traffic.getState()) ?? freshState();

  return {
    getTraffic,

    async setTraffic(split: TrafficSplit): Promise<TrafficSplit> {
      const sum = split.A + split.B + split.C;
      if (Math.abs(sum - 100) > SPLIT_TOLERANCE) {
        throw badRequest(`Traffic must sum to 100 (got ${sum})`);
      }
      await repos.traffic.saveTraffic(split);
      return split;
    },

    async getSettings() {
      return withStep(await getSettings());
    },

    async updateSettings(patch: { [K in keyof SettingsDoc]?: SettingsDoc[K] | undefined }) {
      const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const next: SettingsDoc = { ...(await getSettings()), ...defined };
      await repos.traffic.saveSettings(next);
      return withStep(next);
    },

    // Adds Meeting Fixed evidence for a version; it is evaluated on the next tick.
    recordOutcome(version: VersionSlot, trials: number, successes: number): Promise<void> {
      if (successes > trials) throw badRequest("successes cannot exceed trials");
      return exclusive(async () => {
        const state = await getState();
        const add = (b: { trials: number; successes: number }) => ({
          trials: b.trials + trials,
          successes: b.successes + successes,
        });
        await repos.traffic.saveState({
          ...state,
          pending: { ...state.pending, [version]: add(state.pending[version]) },
          totals: { ...state.totals, [version]: add(state.totals[version]) },
        });
      });
    },

    tick(): Promise<{ traffic: TrafficSplit; decisions: DecisionRecord[] }> {
      return exclusive(async () => {
        const [traffic, settings, state] = await Promise.all([getTraffic(), getSettings(), getState()]);
        const out = evaluateTick({
          traffic,
          evidence: state.evidence,
          pending: state.pending,
          config: { ...settings, stepPoints: RISK_STEPS[settings.riskAppetite] },
        });
        await repos.traffic.saveState({ ...state, evidence: out.evidence, pending: out.pending });
        const decisions: DecisionRecord[] = out.events.map((e) => ({
          id: newId("dec"),
          at: nowIso(),
          version: e.version,
          decision: e.kind,
          trafficBefore: e.trafficBefore,
          trafficAfter: e.trafficAfter,
          pValue: e.pValue,
          logLR: e.logLR,
          trials: e.trials,
          successes: e.successes,
          alpha: DEFAULT_ALPHA,
          thresholdPct: settings.thresholdPct,
          method: "mSPRT",
        }));
        if (decisions.length > 0) await repos.traffic.saveTraffic(out.traffic);
        for (const d of decisions) {
          await repos.traffic.addDecision(d);
          if (d.decision === "scale-down") {
            await notifications.notify({
              kind: "scale-down",
              version: d.version,
              title: `Version ${d.version} scaled down`,
              body: `Meeting Fixed rate reliably below ${d.thresholdPct}% (p=${d.pValue.toFixed(4)}, ${d.successes}/${d.trials} calls). Traffic returned to A.`,
            });
          }
        }
        return { traffic: out.traffic, decisions };
      });
    },

    async state() {
      const [traffic, settings, state] = await Promise.all([getTraffic(), getSettings(), getState()]);
      return {
        traffic,
        settings: withStep(settings),
        alpha: DEFAULT_ALPHA,
        minTrials: DEFAULT_MIN_TRIALS,
        evidence: state.evidence,
        pending: state.pending,
        totals: state.totals,
      };
    },

    async decisions(limit: number): Promise<DecisionRecord[]> {
      return (await repos.traffic.listDecisions()).reverse().slice(0, limit);
    },

    // Local-dev scheduler; returns a stop function. Production would use a cron / queue instead.
    startScheduler(everyMs: number): () => void {
      if (everyMs <= 0) return () => undefined;
      const timer = setInterval(() => {
        this.tick().catch((err: unknown) =>
          log.error("autoscale tick failed", { error: err instanceof Error ? err.message : "unknown" }),
        );
      }, everyMs);
      timer.unref();
      return () => clearInterval(timer);
    },
  };
}
export type AutoscaleService = ReturnType<typeof createAutoscaleService>;
