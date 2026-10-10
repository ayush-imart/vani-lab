// Validity gates, checked BEFORE any rollout decision (spec "Validity gates"):
//   split check (SRM): chi-square p < 0.001 per stage -> pause and freeze traffic, alert the PM
//   outcome coverage:  share of calls with judge output below the floor -> hold decisions
import type { CallRecord } from "../contract";
import { srmCheck, type SrmResult } from "../stats/srm";
import { ENGINE_GUARDS, STATS } from "../spec";
import type { ArmPicker } from "./stage-counts";

export type CoverageResult = { judged: number; total: number; share: number | null; floor: number; ok: boolean };

export function coverageCheck(judged: number, total: number, floor: number): CoverageResult {
  const share = total === 0 ? null : judged / total;
  return { judged, total, share, floor, ok: share === null || share >= floor };
}

// SRM over all calls of the experiment (judged or not): the split must not depend on judge lag.
export function splitCheck(calls: readonly CallRecord[], isTreatment: ArmPicker): SrmResult {
  const byStage = new Map<number, { nControl: number; nTreatment: number }>();
  for (const c of calls) {
    const stage = c.stage ?? 0;
    const prev = byStage.get(stage) ?? { nControl: 0, nTreatment: 0 };
    byStage.set(stage, isTreatment(c) ? { ...prev, nTreatment: prev.nTreatment + 1 } : { ...prev, nControl: prev.nControl + 1 });
  }
  const stages = [...byStage.entries()]
    .filter(([stage]) => stage > 0)
    .sort(([a], [b]) => a - b)
    .map(([stage, n]) => ({ stage, treatmentShare: stage / 100, ...n }));
  return srmCheck(stages, STATS.srmPValue, ENGINE_GUARDS.minCallsPerArmForSrm);
}
