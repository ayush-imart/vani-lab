// Live feed for the Performance page: real backend metrics when reachable, otherwise the synthetic
// in-browser feed. While online it also posts synthetic finished calls so the backend has data to show.
import { useEffect, useRef, useState } from "react";
import { z } from "zod/v4";
import { api } from "@/lib/api";
import { cohortRecordSchema, versionMetricsSchema } from "@/lib/api-contract";
import {
  KPI_SNAPSHOT,
  createInitialFeed,
  createRng,
  nextCall,
  recordCall,
  type CohortRecord,
  type KpiKey,
  type VersionId,
} from "./performance-data";
import { TRUE_RATE } from "./scale-policy";

export type KpiTable = Record<VersionId, Record<KpiKey, number>>;
export type FeedMode = "probing" | "backend" | "synthetic";

const LIVE_INTERVAL_MS = 2600;
const MAX_KNOWN_GLIDS = 500;
const cohortsSchema = z.object({ items: z.array(cohortRecordSchema) });
const metricsSchema = z.object({ items: z.array(versionMetricsSchema) });
const ANSWER_RATE = 0.7;
const LOCATION_RATE = 0.6;
const CALLBACK_RATE = 0.08;
const BASE_DURATION_SEC = 60;
const DURATION_SPREAD_SEC = 30;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function useLiveFeed(isPaused: boolean) {
  const [feed, setFeed] = useState<CohortRecord[]>(() => createInitialFeed());
  const [kpis, setKpis] = useState<KpiTable>(KPI_SNAPSHOT);
  const [mode, setMode] = useState<FeedMode>("probing");
  const glids = useRef<number[]>([]);

  useEffect(() => {
    if (isPaused) return;
    const rng = createRng(Date.now());
    let online = false;

    const syntheticStep = () => {
      const call = nextCall(rng, glids.current, Date.now());
      glids.current = [...glids.current, call.glid].slice(-MAX_KNOWN_GLIDS);
      setFeed((current) => recordCall(current, call));
    };
    const backendStep = async () => {
      const call = nextCall(rng, glids.current, Date.now());
      glids.current = [...glids.current, call.glid].slice(-MAX_KNOWN_GLIDS);
      const { overall: _overall, ...scores } = call.scores;
      await api("/calls", {
        method: "POST",
        body: {
          glid: call.glid,
          version: call.version,
          at: call.at,
          durationSec: BASE_DURATION_SEC + Math.round(rng() * DURATION_SPREAD_SEC),
          outcome: {
            answered: rng() < ANSWER_RATE,
            meetingFixed: rng() < TRUE_RATE[call.version],
            locationConfirmed: rng() < LOCATION_RATE,
            callbackRequested: rng() < CALLBACK_RATE,
          },
          scores,
        },
      });
      const cohorts = await api("/metrics/cohorts", { schema: cohortsSchema });
      const metrics = await api("/metrics/versions", { schema: metricsSchema });
      setFeed(
        cohorts.items.map((c) => {
          const byVersion: CohortRecord["byVersion"] = {};
          (["A", "B", "C"] as const).forEach((id) => {
            const v = c.byVersion[id];
            if (v?.scores) byVersion[id] = { calls: v.calls, scores: v.scores };
          });
          return { digit: c.digit, calls: c.calls, lastCallAt: c.lastCallAt, byVersion };
        }),
      );
      setKpis((prev) => {
        const next = { ...prev };
        metrics.items.forEach((m) => {
          if (m.calls === 0) return;
          next[m.version] = {
            meetingFixed: round1(m.meetingFixedPct),
            callDuration: Math.round(m.avgDurationSec),
            answerRate: round1(m.answerPct),
            locationConfirmed: round1(m.locationConfirmedPct),
            callbackRequested: round1(m.callbackRequestedPct),
          };
        });
        return next;
      });
    };
    const step = async () => {
      try {
        await backendStep();
        online = true;
        setMode("backend");
      } catch {
        if (online || mode !== "synthetic") setMode("synthetic");
        online = false;
        syntheticStep();
      }
    };
    void step();
    const timer = setInterval(() => void step(), LIVE_INTERVAL_MS);
    return () => clearInterval(timer);
    // `mode` is only read to avoid redundant state writes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused]);

  return { feed, kpis, mode };
}
