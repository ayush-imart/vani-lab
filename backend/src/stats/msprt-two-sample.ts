// Two-sample mSPRT (mixture sequential probability ratio test) on the lift B - k*A of two rates.
//
// Method (always-valid sequential inference; Robbins 1970, Johari, Pekelis and Walsh 2017):
//   Per traffic stage s the lift estimate is d_s = pB_s - k * pA_s with variance
//     V_s = pB~(1-pB~)/nB + k^2 * pA~(1-pA~)/nA     (p~ = (x+0.5)/(n+1), only used inside V)
//   Stage estimates are combined by inverse variance:  d = sum(w_s d_s),  V = 1 / sum(1/V_s).
//   The test statistic is a mixture of Gaussian likelihood ratios over the true lift theta with a
//   half-normal mixing density of scale tau on the tested side (tau = "smallest win worth shipping"):
//     benefit (theta > 0):  Lambda+ = 2 sqrt(V/(V+tau^2)) exp(d^2 tau^2 / (2 V (V+tau^2))) Phi(d tau / sqrt(V (V+tau^2)))
//     harm (theta < 0):     the same with d replaced by -d.
//   Under H0 (theta <= 0, resp. >= 0) the Lambda process is a nonnegative supermartingale, so by
//   Ville's inequality P(sup Lambda >= 1/alpha) <= alpha: checking continuously is safe. The
//   always-valid p-value is min(1, 1 / max_t Lambda_t); callers keep the running maximum (peak).
//
// Caveats recorded in every result: Gaussian approximation (arms below minPerArm are skipped), and
// the stage combination assumes the lift is the same across stages.
import { lnNormalCdf } from "./normal";

export const TWO_SAMPLE_METHOD = "two-sample mSPRT, half-normal mixture on lift, stage-stratified (inverse variance)";

export type ArmCounts = { n: number; x: number };
export type StageCounts = { stage: number; control: ArmCounts; treatment: ArmCounts };
export type StageLift = {
  stage: number;
  nControl: number;
  nTreatment: number;
  rateControl: number;
  rateTreatment: number;
  liftPts: number;
  variance: number;
  weight: number;
};

export type TwoSampleOptions = {
  tau: number; // mixture scale as a proportion (0.03 = 3 pts)
  alpha: number;
  ratio?: number; // k in B - k*A (1 = plain lift; 1.5 = fake-meeting ratio rule)
  minPerArm?: number;
};

export type TwoSampleResult = {
  method: string;
  alpha: number;
  tau: number;
  ratio: number;
  nControl: number;
  nTreatment: number;
  rateControl: number | null;
  rateTreatment: number | null;
  liftPts: number | null; // (stratified) d in percentage points
  stdErrPts: number | null;
  stages: StageLift[];
  logLambdaBenefit: number; // 0 when there is no usable stage
  logLambdaHarm: number;
  lambdaBenefit: number;
  lambdaHarm: number;
  assumptions: string[];
};

const ASSUMPTIONS = [
  "Gaussian approximation of the stage-stratified estimator",
  "lift assumed equal across stages when combining",
  "Lambda thresholds apply to the running maximum (peak), tracked by the caller",
];

const smooth = (a: ArmCounts) => (a.x + 0.5) / (a.n + 1);

export function stageLift(c: StageCounts, ratio = 1): Omit<StageLift, "weight"> | undefined {
  if (c.control.n < 1 || c.treatment.n < 1) return undefined;
  const pa = smooth(c.control);
  const pb = smooth(c.treatment);
  const variance = (pb * (1 - pb)) / c.treatment.n + (ratio * ratio * pa * (1 - pa)) / c.control.n;
  const rateControl = c.control.x / c.control.n;
  const rateTreatment = c.treatment.x / c.treatment.n;
  return {
    stage: c.stage,
    nControl: c.control.n,
    nTreatment: c.treatment.n,
    rateControl,
    rateTreatment,
    liftPts: (rateTreatment - ratio * rateControl) * 100,
    variance,
  };
}

// ln Lambda for the benefit side given lift d (proportion), its variance V and mixture scale tau.
export function logLambda(d: number, variance: number, tau: number): number {
  const t2 = tau * tau;
  const z = (d * tau) / Math.sqrt(variance * (variance + t2));
  return (
    Math.LN2 + 0.5 * Math.log(variance / (variance + t2)) + (d * d * t2) / (2 * variance * (variance + t2)) + lnNormalCdf(z)
  );
}

export function twoSampleMsprt(stages: readonly StageCounts[], options: TwoSampleOptions): TwoSampleResult {
  const ratio = options.ratio ?? 1;
  const minPerArm = options.minPerArm ?? 1;
  const usable = stages
    .filter((s) => s.control.n >= minPerArm && s.treatment.n >= minPerArm)
    .map((s) => stageLift(s, ratio))
    .filter((s): s is Omit<StageLift, "weight"> => s !== undefined);
  const nControl = stages.reduce((a, s) => a + s.control.n, 0);
  const nTreatment = stages.reduce((a, s) => a + s.treatment.n, 0);
  const xControl = stages.reduce((a, s) => a + s.control.x, 0);
  const xTreatment = stages.reduce((a, s) => a + s.treatment.x, 0);
  const base = {
    method: TWO_SAMPLE_METHOD,
    alpha: options.alpha,
    tau: options.tau,
    ratio,
    nControl,
    nTreatment,
    rateControl: nControl > 0 ? xControl / nControl : null,
    rateTreatment: nTreatment > 0 ? xTreatment / nTreatment : null,
    assumptions: ASSUMPTIONS,
  };
  if (usable.length === 0) {
    return { ...base, liftPts: null, stdErrPts: null, stages: [], logLambdaBenefit: 0, logLambdaHarm: 0, lambdaBenefit: 1, lambdaHarm: 1 };
  }
  const precision = usable.reduce((a, s) => a + 1 / s.variance, 0);
  const combinedVariance = 1 / precision;
  const lift = usable.reduce((a, s) => a + (s.liftPts / 100) * (1 / s.variance / precision), 0);
  const stagesOut: StageLift[] = usable.map((s) => ({ ...s, weight: 1 / s.variance / precision }));
  const logBenefit = logLambda(lift, combinedVariance, options.tau);
  const logHarm = logLambda(-lift, combinedVariance, options.tau);
  return {
    ...base,
    liftPts: lift * 100,
    stdErrPts: Math.sqrt(combinedVariance) * 100,
    stages: stagesOut,
    logLambdaBenefit: logBenefit,
    logLambdaHarm: logHarm,
    lambdaBenefit: Math.exp(logBenefit),
    lambdaHarm: Math.exp(logHarm),
  };
}

// Always-valid p-value from the running maximum of ln Lambda.
export const alwaysValidP = (peakLogLambda: number): number => Math.min(1, Math.exp(-Math.max(0, peakLogLambda)));
export const peakOf = (previousPeak: number | undefined, current: number): number => Math.max(previousPeak ?? 0, current);

// Two-sided variant (used only to put an indicative significance next to secondary metrics).
export function logLambdaTwoSided(d: number, variance: number, tau: number): number {
  const t2 = tau * tau;
  return 0.5 * Math.log(variance / (variance + t2)) + (d * d * t2) / (2 * variance * (variance + t2));
}
