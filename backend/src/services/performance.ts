import { bucketOf } from "./assignment";
import { randomInt } from "node:crypto";
import type {
  AuditRecord,
  CallIngest,
  CallRecord,
  KpiKey,
  MetricKey,
  VersionMetrics,
  VersionSlot,
} from "../contract";
import { kpiKeys } from "../contract";
import { newId } from "../lib/http";
import type { Repos } from "../repos";
import type { AutoscaleService } from "./autoscale";
import { overallFor, type RubricService } from "./rubric";
import { versionSlots } from "./scale-policy";

export const COHORT_COUNT = 10;
const GLID_TAIL = 5;

type Scores = Record<MetricKey, number>;
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (num: number, den: number): number | null =>
  den === 0 ? null : Math.round((num / den) * 1000) / 10;
const diff1 = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : round1(a - b);

// Raw GLIDs are never stored: only the cohort digit and the last 5 digits.
export function maskGlid(glid: number | string): { glidLast5: string; cohort: number } {
  const s = String(glid);
  return { glidLast5: s.slice(-GLID_TAIL), cohort: Number(s.slice(-1)) };
}

const SYNTHETIC_GLID_MAX = 10_000_000_000;
const syntheticGlid = (): string => String(randomInt(0, SYNTHETIC_GLID_MAX)).padStart(10, "0");

function meanScores(calls: CallRecord[]): Scores | null {
  const scored = calls.filter((c) => c.scores);
  if (scored.length === 0) return null;
  const out = { overall: 0 } as Scores;
  (["overall", ...kpiKeys] as MetricKey[]).forEach((k) => {
    out[k] = round1(scored.reduce((s, c) => s + (c.scores as Scores)[k], 0) / scored.length);
  });
  return out;
}

// Rates use only calls that carry boolean outcomes (calls created from audits have scores only).
export function versionMetricsOf(version: VersionSlot, calls: CallRecord[]): VersionMetrics {
  const n = calls.length;
  const withOutcome = calls.filter((c) => c.outcome);
  const m = withOutcome.length;
  const count = (f: (o: NonNullable<CallRecord["outcome"]>) => boolean) =>
    withOutcome.filter((c) => c.outcome && f(c.outcome)).length;
  return {
    version,
    calls: n,
    outcomeCalls: m,
    meetingFixedPct: pct(count((o) => o.meetingFixed), m),
    avgDurationSec: n === 0 ? null : round1(calls.reduce((s, c) => s + c.durationSec, 0) / n),
    answerPct: pct(count((o) => o.answered), m),
    locationConfirmedPct: pct(count((o) => o.locationConfirmed), m),
    callbackRequestedPct: pct(count((o) => o.callbackRequested), m),
    units: { pct: "percent of calls with a boolean outcome", avgDurationSec: "seconds" },
  };
}

export function createPerformanceService(
  repos: Repos,
  rubricSvc: RubricService,
  autoscale: AutoscaleService,
) {
  const byVersion = (calls: CallRecord[], v: VersionSlot) => calls.filter((c) => c.version === v);

  return {
    async ingest(input: CallIngest): Promise<CallRecord> {
      const rubric = await rubricSvc.get();
      const { glidLast5, cohort } = maskGlid(input.glid);
      const run = input.experimentId ? await repos.rollouts.getRun(input.experimentId) : undefined;
      const record: CallRecord = {
        id: newId("call"),
        glidLast5,
        cohort,
        version: input.version,
        at: input.at ?? Date.now(),
        durationSec: input.durationSec,
        outcome: input.outcome,
        source: "ingest",
        bucket: bucketOf(input.glid),
        ...(input.channel ? { channel: input.channel } : {}),
        ...(input.failed ? { failed: true } : {}),
        ...(input.evaluator ? { evaluator: input.evaluator } : {}),
        ...(run ? { experimentId: run.experimentId, stage: run.stagePct } : {}),
        ...(input.scores
          ? { scores: { ...input.scores, overall: overallFor(input.scores, rubric) } }
          : {}),
      };
      await repos.calls.add(record);
      await autoscale.recordOutcome(input.version, 1, input.outcome.meetingFixed ? 1 : 0);
      return record;
    },

    // Called when an audit completes: stores a score-only call (no boolean outcome, so no autoscale
    // evidence: deriving a meeting-fixed yes/no from an LLM score would be a heuristic).
    async ingestAudited(
      audit: AuditRecord,
      rawGlid?: number | string,
    ): Promise<CallRecord | undefined> {
      if (!audit.kpis || audit.overall === undefined) return undefined;
      const glid = rawGlid ?? syntheticGlid();
      const { glidLast5, cohort } = maskGlid(glid);
      return repos.calls.add({
        id: newId("call"),
        glidLast5,
        cohort,
        version: audit.version,
        at: Date.now(),
        durationSec: audit.durationSec,
        scores: { ...audit.kpis, overall: audit.overall },
        source: "audit",
      });
    },

    async recent(limit: number, since?: number): Promise<CallRecord[]> {
      const all = (await repos.calls.list()).filter((c) => since === undefined || c.at > since);
      return all.sort((a, b) => b.at - a.at).slice(0, limit);
    },

    async versionMetrics(): Promise<VersionMetrics[]> {
      const calls = await repos.calls.list();
      return versionSlots.map((v) => versionMetricsOf(v, byVersion(calls, v)));
    },

    async cohorts() {
      const calls = await repos.calls.list();
      return Array.from({ length: COHORT_COUNT }, (_, digit) => {
        const inCohort = calls.filter((c) => c.cohort === digit);
        const perVersion: Partial<Record<VersionSlot, { calls: number; scores: Scores | null }>> = {};
        versionSlots.forEach((v) => {
          const vc = byVersion(inCohort, v);
          if (vc.length > 0) perVersion[v] = { calls: vc.length, scores: meanScores(vc) };
        });
        return {
          digit,
          calls: inCohort.length,
          lastCallAt: inCohort.reduce((m, c) => Math.max(m, c.at), 0),
          byVersion: perVersion,
        };
      });
    },

    async leaderboard(sort: MetricKey, order: "asc" | "desc") {
      const calls = await repos.calls.list();
      const rows = versionSlots.map((v) => ({
        version: v,
        calls: byVersion(calls, v).length,
        scores: meanScores(byVersion(calls, v)),
      }));
      const key = (r: (typeof rows)[number]) => r.scores?.[sort] ?? Number.NEGATIVE_INFINITY;
      rows.sort((a, b) => (order === "desc" ? key(b) - key(a) : key(a) - key(b)));
      return rows.map((r, i) => ({ rank: i + 1, ...r }));
    },

    async verdict() {
      const [metrics, rubric] = await Promise.all([this.versionMetrics(), rubricSvc.get()]);
      const base = metrics.find((m) => m.version === "A") as VersionMetrics;
      return {
        primaryMetric: rubric.primaryMetric as KpiKey,
        baseline: "A" as const,
        versions: metrics.map((m) => ({
          ...m,
          deltaVsBaseline: {
            meetingFixedPp: diff1(m.meetingFixedPct, base.meetingFixedPct),
            avgDurationSec: diff1(m.avgDurationSec, base.avgDurationSec),
            answerPp: diff1(m.answerPct, base.answerPct),
            locationConfirmedPp: diff1(m.locationConfirmedPct, base.locationConfirmedPct),
            callbackRequestedPp: diff1(m.callbackRequestedPct, base.callbackRequestedPct),
          },
        })),
        note: "Inputs only. Scale decisions come from the mSPRT autoscale log, not from this endpoint.",
      };
    },
  };
}
export type PerformanceService = ReturnType<typeof createPerformanceService>;
