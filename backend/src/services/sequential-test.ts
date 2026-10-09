// mSPRT (mixture Sequential Probability Ratio Test) for a Bernoulli rate against a threshold.
//
// Method (always-valid sequential inference: Robbins 1970; Johari, Pekelis and Walsh):
//   Test H0: rate on the wrong side of X   vs   H1: rate on the tested side of X
//   (direction "below": H0 is rate >= X; direction "above": H0 is rate <= X).
//   After s successes and f failures, the mixture likelihood ratio against the boundary point X is
//     L = integral of (t/X)^s * ((1-t)/(1-X))^f  dH(t)
//   where H is a Beta(a, b) mixing density truncated to the tested side of X. This has a closed form
//   with incomplete beta functions (computed in logs below). L is a nonnegative martingale at the
//   boundary and a supermartingale deeper inside H0, so by Ville's inequality
//     P(L ever >= 1/alpha | H0) <= alpha        (valid under continuous peeking).
//   The always-valid p-value is p = min(1, 1 / max over time of L); reject H0 when p <= alpha.
//
// Parameters: alpha (false-positive bound), priorA and priorB (mixing Beta shape; 1,1 = uniform over
// the tested side, larger values concentrate H), minTrials (operational guard that never decides on
// fewer calls; it only delays decisions and does not weaken validity).
// This is the Bernoulli form; the Normal-mixture form with variance tau^2 is not used here.

export type Direction = "below" | "above";
export type SequentialOptions = {
  threshold: number;
  direction: Direction;
  alpha?: number;
  priorA?: number;
  priorB?: number;
  minTrials?: number;
};
export type SequentialState = { successes: number; trials: number; maxLogLR: number };
export type SequentialResult = SequentialState & {
  logLR: number;
  pValue: number;
  decision: "reject" | "continue";
  alpha: number;
};

export const DEFAULT_ALPHA = 0.05;
export const DEFAULT_MIN_TRIALS = 50;
export const METHOD_NAME = "mSPRT";

const LANCZOS = [
  76.18009172947147, -86.50532032941678, 24.01409824083091, -1.231739572450155,
  0.1208650973866179e-2, -0.5395239384953e-5,
];

export function lnGamma(x: number): number {
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const c of LANCZOS) {
    y += 1;
    ser += c / y;
  }
  return -tmp + Math.log((Math.sqrt(2 * Math.PI) * ser) / x);
}

export const lnBeta = (a: number, b: number) => lnGamma(a) + lnGamma(b) - lnGamma(a + b);

const TINY = 1e-300;
const nonZero = (n: number) => (Math.abs(n) < TINY ? TINY : n);

function betaContinuedFraction(x: number, a: number, b: number): number {
  let c = 1;
  let d = 1 / nonZero(1 - ((a + b) * x) / (a + 1));
  let h = d;
  for (let m = 1; m <= 500; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 / nonZero(1 + aa * d);
    c = nonZero(1 + aa / c);
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 / nonZero(1 + aa * d);
    c = nonZero(1 + aa / c);
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return h;
}

// ln of the regularised incomplete beta function I_x(a, b).
export function lnRegIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return Number.NEGATIVE_INFINITY;
  if (x >= 1) return 0;
  const lnFront = a * Math.log(x) + b * Math.log1p(-x) - lnBeta(a, b);
  if (x < (a + 1) / (a + b + 2)) return lnFront + Math.log(betaContinuedFraction(x, a, b) / a);
  const upper = Math.exp(lnFront) * (betaContinuedFraction(1 - x, b, a) / b);
  return Math.log1p(-upper);
}

// ln L for the "below" side: mixing Beta(a, b) truncated to (0, X).
function logLRBelow(s: number, f: number, x: number, a: number, b: number): number {
  const numerator = lnBeta(a + s, b + f) + lnRegIncBeta(x, a + s, b + f);
  const denominator = lnBeta(a, b) + lnRegIncBeta(x, a, b);
  return numerator - denominator - s * Math.log(x) - f * Math.log1p(-x);
}

// "above" is "below" on the mirrored problem (successes <-> failures, X -> 1 - X, a <-> b).
export function logLikelihoodRatio(
  successes: number,
  trials: number,
  { threshold, direction, priorA = 1, priorB = 1 }: SequentialOptions,
): number {
  if (!(threshold > 0 && threshold < 1)) throw new RangeError("threshold must be in (0, 1)");
  if (!(successes >= 0 && successes <= trials)) throw new RangeError("0 <= successes <= trials");
  const failures = trials - successes;
  return direction === "below"
    ? logLRBelow(successes, failures, threshold, priorA, priorB)
    : logLRBelow(failures, successes, 1 - threshold, priorB, priorA);
}

export function initialState(): SequentialState {
  return { successes: 0, trials: 0, maxLogLR: 0 };
}

// Add a batch of calls and evaluate. The running maximum of L makes the p-value always valid.
export function sequentialUpdate(
  prev: SequentialState,
  batch: { successes: number; trials: number },
  options: SequentialOptions,
): SequentialResult {
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const successes = prev.successes + batch.successes;
  const trials = prev.trials + batch.trials;
  const logLR = trials === 0 ? 0 : logLikelihoodRatio(successes, trials, options);
  const maxLogLR = Math.max(prev.maxLogLR, logLR);
  const pValue = Math.min(1, Math.exp(-maxLogLR));
  const enough = trials >= (options.minTrials ?? DEFAULT_MIN_TRIALS);
  return {
    successes,
    trials,
    maxLogLR,
    logLR,
    pValue,
    alpha,
    decision: enough && pValue <= alpha ? "reject" : "continue",
  };
}
