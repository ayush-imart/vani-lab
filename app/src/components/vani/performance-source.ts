// Read-only performance data source. This module never creates or submits call records.
import { useEffect, useState } from "react";
import { z } from "zod/v4";
import { api } from "@/lib/api";
import { getExperimentId, withExperiment } from "@/lib/experiment-scope";
import { callRecordSchema, cohortRecordSchema, versionMetricsSchema } from "@/lib/api-contract";
import {
  createEmptyCohorts,
  createInitialFeed,
  createRng,
  KPI_SNAPSHOT,
  nextCall,
  recordCall,
  versionIds,
  type CohortRecord,
  type KpiKey,
  type VersionId,
} from "./performance-data";

export type KpiTable = Record<VersionId, Record<KpiKey, number | null>>;
export type FeedMode = "probing" | "backend" | "simulated";
const REFRESH_MS = 10_000;
const DEMO_TICK_MS = 3_000;
const cohortsSchema = z.object({ items: z.array(cohortRecordSchema) });
const metricsSchema = z.object({ items: z.array(versionMetricsSchema) });
const callsSchema = z.object({ items: z.array(callRecordSchema) });
const EMPTY_KPIS: KpiTable = {
  A: { meetingFixed: null, callDuration: null, answerRate: null, locationConfirmed: null, callbackRequested: null },
  B: { meetingFixed: null, callDuration: null, answerRate: null, locationConfirmed: null, callbackRequested: null },
  C: { meetingFixed: null, callDuration: null, answerRate: null, locationConfirmed: null, callbackRequested: null },
};
const round1 = (n: number) => Math.round(n * 10) / 10;

function seedFor(experimentId: string | null): number {
  if (!experimentId) return 2026;
  return [...experimentId].reduce((seed, char) => (seed * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function demoGlids(seed: number): Record<VersionId, string[]> {
  return Object.fromEntries(
    versionIds.map((id, slot) => [
      id,
      Array.from({ length: 8 }, (_, index) => {
        const prefix = String((seed + slot * 104729 + index * 7919) % 10_000).padStart(4, "0");
        // The final digit is the GLID cohort key; each terminal digit represents one 10% unit.
        return `${prefix}${index}`;
      }),
    ]),
  ) as Record<VersionId, string[]>;
}

export function useLiveFeed(isPaused: boolean) {
  const [feed, setFeed] = useState<CohortRecord[]>(createEmptyCohorts);
  const [kpis, setKpis] = useState<KpiTable>(EMPTY_KPIS);
  const [glidsByVersion, setGlidsByVersion] = useState<Record<VersionId, string[]>>({ A: [], B: [], C: [] });
  const [mode, setMode] = useState<FeedMode>("probing");
  useEffect(() => {
    if (isPaused) return;
    let active = true;
    let simulating = false;
    const experimentId = getExperimentId();
    const seed = seedFor(experimentId);
    let demoFeed = createInitialFeed(seed, Date.now());
    let rng = createRng(seed + 1);
    let demoIds = demoGlids(seed);
    const glids = Object.values(demoIds).flat().map((tail) => Number(`10000${tail}`));
    const showDemo = () => {
      if (!active) return;
      setFeed(demoFeed);
      setKpis(KPI_SNAPSHOT);
      setGlidsByVersion(demoIds);
      setMode("simulated");
    };
    const refresh = async () => {
      try {
        const [cohorts, metrics, calls] = await Promise.all([
          api(withExperiment("/metrics/cohorts", experimentId), { schema: cohortsSchema }),
          api(withExperiment("/metrics/versions", experimentId), { schema: metricsSchema }),
          api(withExperiment("/calls?limit=1000", experimentId), { schema: callsSchema }),
        ]);
        if (!active) return;
        if (!metrics.items.some((metric) => metric.calls > 0)) {
          simulating = true;
          showDemo();
          return;
        }
        const nextFeed = createEmptyCohorts().map((empty) => {
          const cohort = cohorts.items.find((item) => item.digit === empty.digit);
          if (!cohort) return empty;
          const byVersion: CohortRecord["byVersion"] = {};
          versionIds.forEach((id) => {
            const value = cohort.byVersion[id];
            if (value?.scores) byVersion[id] = { calls: value.calls, scores: value.scores };
          });
          return { digit: cohort.digit, calls: cohort.calls, lastCallAt: cohort.lastCallAt, byVersion };
        });
        const nextKpis: KpiTable = { ...EMPTY_KPIS };
        metrics.items.forEach((metric) => {
          nextKpis[metric.version] = {
            meetingFixed: metric.meetingFixedPct === null ? null : round1(metric.meetingFixedPct),
            callDuration: metric.avgDurationSec === null ? null : Math.round(metric.avgDurationSec),
            answerRate: metric.answerPct === null ? null : round1(metric.answerPct),
            locationConfirmed: metric.locationConfirmedPct === null ? null : round1(metric.locationConfirmedPct),
            callbackRequested: metric.callbackRequestedPct === null ? null : round1(metric.callbackRequestedPct),
          };
        });
        const nextGlids: Record<VersionId, string[]> = { A: [], B: [], C: [] };
        calls.items.forEach((call) => nextGlids[call.version].push(call.glidLast5));
        simulating = false;
        setFeed(nextFeed);
        setKpis(nextKpis);
        setGlidsByVersion(nextGlids);
        setMode("backend");
      } catch {
        simulating = true;
        showDemo();
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const demoTimer = window.setInterval(() => {
      if (!simulating) return;
      const call = nextCall(rng, glids, Date.now());
      demoFeed = recordCall(demoFeed, call);
      demoIds = {
        ...demoIds,
        [call.version]: [`${String(call.glid).slice(-5)}`, ...demoIds[call.version]].slice(0, 8),
      };
      showDemo();
    }, DEMO_TICK_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(demoTimer);
    };
  }, [isPaused]);
  return { feed, kpis, glidsByVersion, mode };
}
