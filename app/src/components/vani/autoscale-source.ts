// Data source for the Autoscale panel: the real backend when reachable, otherwise the synthetic
// in-browser simulation (scale-policy.ts). Both are normalised to one `AutoscaleView`.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  autoscaleStateSchema,
  decisionRecordSchema,
  tickResultSchema,
  type DecisionRecord,
} from "@/lib/api-contract";
import { z } from "zod/v4";
import { pushNotification } from "./notifications";
import { createRng, versionIds, type VersionId } from "./performance-data";
import {
  INITIAL_TRAFFIC,
  TRUE_RATE,
  CALLS_PER_TRAFFIC_POINT,
  createAutoscaleState,
  simulateBatch,
  stepAutoscale,
  type AutoscaleEvent,
  type AutoscaleState,
  type RiskAppetite,
  type TrafficSplit,
} from "./scale-policy";

export type Evidence = { trials: number; pValue: number; lead: "above" | "below" };
export type AutoscaleView = {
  traffic: TrafficSplit;
  totals: Record<VersionId, { calls: number; successes: number }>;
  evidence: Record<VersionId, Evidence | null>;
  events: AutoscaleEvent[];
};
export type AutoscaleSettings = {
  thresholdPct: number;
  autoscale: boolean;
  riskAppetite: RiskAppetite;
  stepPoints: number;
};
export type SourceMode = "probing" | "backend" | "synthetic";

const TICK_MS = 800;
const REPROBE_EVERY = 15;
const fmtPoints = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} pp`;

function announce(event: AutoscaleEvent, thresholdPct: number, notifyLocally: boolean) {
  const down = event.kind === "scale-down";
  const title = down
    ? `Version ${event.version} is being scaled down now`
    : `Version ${event.version} scaled up to ${fmtPoints(event.trafficAfter)}`;
  const detail = down
    ? `Meeting Fixed rate stayed below ${thresholdPct}% (mSPRT p = ${event.pValue.toFixed(3)}, ${event.calls} calls). Traffic returned to A.`
    : `Meeting Fixed rate above ${thresholdPct}% (mSPRT p = ${event.pValue.toFixed(3)}, ${event.calls} calls).`;
  if (notifyLocally) pushNotification({ title, detail, to: "/scale-up", source: "autoscale" });
  if (down) toast.warning(title, { description: detail });
  else toast.success(title);
}

function viewFromSimulation(state: AutoscaleState): AutoscaleView {
  const evidence = {} as Record<VersionId, Evidence | null>;
  versionIds.forEach((id) => {
    const { below, above } = state.evidence[id];
    if (id === "A" || below.trials === 0) {
      evidence[id] = null;
      return;
    }
    const lead = above.maxLogLR > below.maxLogLR ? "above" : "below";
    const shown = lead === "above" ? above : below;
    evidence[id] = { trials: shown.trials, pValue: Math.min(1, Math.exp(-shown.maxLogLR)), lead };
  });
  const totals = {} as AutoscaleView["totals"];
  versionIds.forEach((id) => {
    totals[id] = { calls: state.totals[id].calls, successes: state.totals[id].successes };
  });
  return { traffic: state.traffic, totals, evidence, events: state.events };
}

const decisionsSchema = z.object({ items: z.array(decisionRecordSchema) });
const toEvent = (d: DecisionRecord): AutoscaleEvent => ({
  kind: d.decision,
  version: d.version,
  at: Date.parse(d.at) || Date.now(),
  trafficBefore: d.trafficBefore,
  trafficAfter: d.trafficAfter,
  pValue: d.pValue,
  calls: d.trials,
});

async function backendView(): Promise<{ view: AutoscaleView; ids: string[] }> {
  const state = await api("/autoscale/state", { schema: autoscaleStateSchema });
  const decisions = await api("/autoscale/decisions?limit=20", { schema: decisionsSchema });
  const evidence = {} as Record<VersionId, Evidence | null>;
  const totals = {} as AutoscaleView["totals"];
  versionIds.forEach((id) => {
    const e = state.evidence[id];
    const below = e?.below.pValue ?? 1;
    const above = e?.above.pValue ?? 1;
    const lead = above < below ? "above" : "below";
    evidence[id] =
      id === "A" || !e || e.below.trials === 0
        ? null
        : { trials: e.below.trials, pValue: Math.min(above, below), lead };
    totals[id] = {
      calls: state.totals[id]?.trials ?? 0,
      successes: state.totals[id]?.successes ?? 0,
    };
  });
  return {
    view: { traffic: state.traffic, totals, evidence, events: decisions.items.map(toEvent) },
    ids: decisions.items.map((d) => d.id),
  };
}

export function useAutoscaleSource(
  settings: AutoscaleSettings,
  running: boolean,
  simulateOutcomes: boolean,
  onRemoteSettings: (s: AutoscaleSettings) => void,
) {
  const [sim, setSim] = useState<AutoscaleState>(() => createAutoscaleState());
  const [remote, setRemote] = useState<AutoscaleView | null>(null);
  const [mode, setMode] = useState<SourceMode>("probing");
  const cfg = useRef(settings);
  cfg.current = settings;
  const simRef = useRef(sim);
  const rng = useRef(createRng(2026));
  const modeRef = useRef<SourceMode>("probing");
  const seen = useRef<Set<string> | null>(null);
  const ticks = useRef(0);
  const pulled = useRef(false);
  const inject = useRef(simulateOutcomes);
  inject.current = simulateOutcomes;

  useEffect(() => {
    if (!running) return;
    const runSynthetic = () => {
      const prev = simRef.current;
      const next = stepAutoscale(prev, rng.current, cfg.current, Date.now());
      simRef.current = next;
      setSim(next);
      next.events
        .slice(0, Math.max(0, next.events.length - prev.events.length))
        .forEach((e) => announce(e, cfg.current.thresholdPct, true));
    };
    const runBackend = async () => {
      if (!pulled.current) {
        pulled.current = true;
        const remoteSettings = await api("/autoscale/settings");
        onRemoteSettings(remoteSettings as AutoscaleSettings);
        cfg.current = remoteSettings as AutoscaleSettings;
      }
      const current = await backendView();
      // Synthetic outcomes are demo-only: they reach the backend only when explicitly enabled.
      if (inject.current) await Promise.all(
        versionIds.map((id) => {
          const calls = Math.round(current.view.traffic[id] * CALLS_PER_TRAFFIC_POINT);
          if (calls === 0) return Promise.resolve();
          const successes = simulateBatch(rng.current, calls, TRUE_RATE[id]);
          return api("/autoscale/outcomes", {
            method: "POST",
            body: { version: id, trials: calls, successes },
          });
        }),
      );
      await api("/autoscale/tick", { method: "POST", schema: tickResultSchema });
      const after = await backendView();
      if (seen.current === null) seen.current = new Set(after.ids);
      after.view.events.forEach((e, i) => {
        const id = after.ids[i] as string;
        if (!seen.current?.has(id)) {
          seen.current?.add(id);
          announce(e, cfg.current.thresholdPct, false);
        }
      });
      setRemote(after.view);
    };
    const step = async () => {
      ticks.current += 1;
      if (modeRef.current === "synthetic" && ticks.current % REPROBE_EVERY !== 0) {
        runSynthetic();
        return;
      }
      try {
        await runBackend();
        modeRef.current = "backend";
        setMode("backend");
      } catch {
        if (modeRef.current !== "synthetic") {
          modeRef.current = "synthetic";
          setMode("synthetic");
        }
        pulled.current = false;
        runSynthetic();
      }
    };
    const timer = setInterval(() => void step(), TICK_MS);
    return () => clearInterval(timer);
  }, [running, onRemoteSettings]);

  // Push control changes to the backend (the backend owns the settings once it is online).
  useEffect(() => {
    if (mode !== "backend") return;
    void api("/autoscale/settings", {
      method: "PUT",
      body: {
        autoscale: settings.autoscale,
        riskAppetite: settings.riskAppetite,
        thresholdPct: settings.thresholdPct,
      },
    }).catch(() => toast.error("Autoscale settings were not saved: backend rejected the update."));
  }, [mode, settings.autoscale, settings.riskAppetite, settings.thresholdPct]);

  const reset = () => {
    rng.current = createRng(2026);
    simRef.current = createAutoscaleState();
    setSim(simRef.current);
    if (modeRef.current === "backend") {
      void api("/traffic", { method: "PUT", body: INITIAL_TRAFFIC }).catch(() =>
        toast.error("Traffic reset failed: backend unreachable."),
      );
    }
  };

  const view = mode === "backend" && remote ? remote : viewFromSimulation(sim);
  return { view, mode, reset };
}
