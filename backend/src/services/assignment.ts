// Assignment by the final GLID digit (bucket 0-9). Each terminal digit is one 10% unit:
// at 10% only GLIDs ending in 0 hear treatment; at 20%, endings 0 and 1 do. The treatment
// set only grows as rollout advances, so a seller who heard B keeps hearing B.
import { chiSquareSurvival } from "../stats/normal";
import { ASSIGNMENT } from "../spec";

export const BUCKET_COUNT = ASSIGNMENT.buckets;

export function bucketOf(glid: number | string): number {
  const digits = String(glid);
  if (!/^\d+$/.test(digits)) throw new RangeError("GLID must be digits only");
  return Number(digits.slice(-1));
}

export const isTreatmentBucket = (bucket: number, treatmentPct: number): boolean => bucket < treatmentPct / 10;
export const armFor = (bucket: number, treatmentPct: number): "treatment" | "control" =>
  isTreatmentBucket(bucket, treatmentPct) ? "treatment" : "control";

// The terminal-digit units that hear the treatment at `treatmentPct` (e.g. 20 -> [0, 1]).
export const treatmentBuckets = (treatmentPct: number): number[] =>
  Array.from({ length: BUCKET_COUNT }, (_, b) => b).filter((b) => isTreatmentBucket(b, treatmentPct));

export type BalanceSeller = { glid: number | string; leadType: string; firstCall: boolean };
export type BalanceResult = {
  treatmentPct: number;
  treatmentBuckets: string; // e.g. "0" at 10%, "0-1" at 20%
  nTreatment: number;
  nControl: number;
  leadType: { chiSquare: number; df: number; pValue: number | null; shares: Record<string, { treatment: number; control: number }> };
  firstCallShare: { treatment: number | null; control: number | null; diffPts: number | null };
  balanced: boolean;
  reasons: string[];
  criteria: typeof ASSIGNMENT.balanceChecks;
};

const label = (n: number) => String(n);

// Balance check at launch: the chosen buckets must look alike on lead type and first-call share.
// Criteria are the (placeholder) ones in spec.ts: lead-type chi-square p >= 0.01, first-call share
// within 2 pts. This is a documented rule, not a fitted heuristic; it reports the numbers behind it.
export function balanceCheck(sellers: readonly BalanceSeller[], treatmentPct: number): BalanceResult {
  const rows = sellers.map((s) => ({ ...s, arm: armFor(bucketOf(s.glid), treatmentPct) }));
  const treatment = rows.filter((r) => r.arm === "treatment");
  const control = rows.filter((r) => r.arm === "control");
  const types = [...new Set(rows.map((r) => r.leadType))].sort();
  const count = (arm: typeof rows, t: string) => arm.filter((r) => r.leadType === t).length;
  const shares = Object.fromEntries(
    types.map((t) => [
      t,
      {
        treatment: treatment.length > 0 ? count(treatment, t) / treatment.length : 0,
        control: control.length > 0 ? count(control, t) / control.length : 0,
      },
    ]),
  );
  let chiSquare = 0;
  if (treatment.length > 0 && control.length > 0) {
    for (const t of types) {
      const total = count(rows, t);
      const expT = (total * treatment.length) / rows.length;
      const expC = total - expT;
      if (expT > 0) chiSquare += (count(treatment, t) - expT) ** 2 / expT;
      if (expC > 0) chiSquare += (count(control, t) - expC) ** 2 / expC;
    }
  }
  const df = Math.max(0, types.length - 1);
  const pValue = df === 0 || treatment.length === 0 || control.length === 0 ? null : chiSquareSurvival(chiSquare, df);
  const share = (arm: typeof rows) => (arm.length === 0 ? null : arm.filter((r) => r.firstCall).length / arm.length);
  const firstT = share(treatment);
  const firstC = share(control);
  const diffPts = firstT === null || firstC === null ? null : (firstT - firstC) * 100;
  const reasons: string[] = [];
  if (treatment.length === 0 || control.length === 0) reasons.push("one arm has no sellers");
  if (pValue !== null && pValue < ASSIGNMENT.balanceChecks.leadTypeMinPValue) {
    reasons.push(`lead-type mix differs between arms (chi-square p=${pValue.toFixed(4)})`);
  }
  if (diffPts !== null && Math.abs(diffPts) > ASSIGNMENT.balanceChecks.firstCallShareMaxDiffPts) {
    reasons.push(`first-call share differs by ${diffPts.toFixed(1)} pts`);
  }
  return {
    treatmentPct,
    treatmentBuckets: treatmentPct > 0 ? (treatmentPct === 10 ? label(0) : `${label(0)}-${label(Math.min(9, treatmentPct / 10 - 1))}`) : "none",
    nTreatment: treatment.length,
    nControl: control.length,
    leadType: { chiSquare, df, pValue, shares },
    firstCallShare: { treatment: firstT, control: firstC, diffPts },
    balanced: reasons.length === 0,
    reasons,
    criteria: ASSIGNMENT.balanceChecks,
  };
}
