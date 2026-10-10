// Groups calls by traffic stage and arm into the (n, x) counts the two-sample mSPRT needs.
import type { CallRecord } from "../contract";
import type { StageCounts } from "../stats/msprt-two-sample";

export type ArmPicker = (call: CallRecord) => boolean; // true = treatment arm

export function stageCounts(
  calls: readonly CallRecord[],
  isTreatment: ArmPicker,
  value: (call: CallRecord) => boolean | null | undefined,
): StageCounts[] {
  const byStage = new Map<number, StageCounts>();
  for (const call of calls) {
    const v = value(call);
    if (v === null || v === undefined) continue;
    const stage = call.stage ?? 0;
    const prev = byStage.get(stage) ?? { stage, control: { n: 0, x: 0 }, treatment: { n: 0, x: 0 } };
    const arm = isTreatment(call) ? "treatment" : "control";
    byStage.set(stage, {
      ...prev,
      [arm]: { n: prev[arm].n + 1, x: prev[arm].x + (v ? 1 : 0) },
    });
  }
  return [...byStage.values()].sort((a, b) => a.stage - b.stage);
}
