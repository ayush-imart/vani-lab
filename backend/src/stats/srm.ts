// Sample-ratio-mismatch (SRM) check: chi-square of observed vs configured split per stage.
import { chiSquareSurvival } from "./normal";

export type SrmStage = { stage: number; treatmentShare: number; nControl: number; nTreatment: number };
export type SrmResult = {
  method: string;
  threshold: number;
  chiSquare: number;
  df: number;
  pValue: number | null; // null = not enough data to test
  failed: boolean;
  stages: {
    stage: number;
    expectedTreatmentShare: number;
    observedTreatmentShare: number;
    nControl: number;
    nTreatment: number;
    chiSquare: number;
  }[];
};

export function srmCheck(stages: readonly SrmStage[], threshold: number, minPerStage: number): SrmResult {
  const rows = stages
    .filter((s) => s.nControl + s.nTreatment >= minPerStage && s.treatmentShare > 0 && s.treatmentShare < 1)
    .map((s) => {
      const total = s.nControl + s.nTreatment;
      const expTreatment = total * s.treatmentShare;
      const expControl = total - expTreatment;
      const chi = (s.nTreatment - expTreatment) ** 2 / expTreatment + (s.nControl - expControl) ** 2 / expControl;
      return {
        stage: s.stage,
        expectedTreatmentShare: s.treatmentShare,
        observedTreatmentShare: s.nTreatment / total,
        nControl: s.nControl,
        nTreatment: s.nTreatment,
        chiSquare: chi,
      };
    });
  const chiSquare = rows.reduce((a, r) => a + r.chiSquare, 0);
  const df = rows.length;
  const pValue = df === 0 ? null : chiSquareSurvival(chiSquare, df);
  return {
    method: "chi-square goodness of fit of the observed arm split to the configured split, summed over stages (df = stages)",
    threshold,
    chiSquare,
    df,
    pValue,
    failed: pValue !== null && pValue < threshold,
    stages: rows,
  };
}
