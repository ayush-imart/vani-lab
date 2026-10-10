// Normal and chi-square helpers (pure, no dependencies).
import { lnGamma } from "../services/sequential-test";

// erfc via the Numerical Recipes Chebyshev fit (relative error < 1.2e-7); enough for p-values here.
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const poly =
    -1.26551223 +
    t *
      (1.00002368 +
        t *
          (0.37409196 +
            t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  const r = t * Math.exp(-z * z + poly);
  return x >= 0 ? r : 2 - r;
}

export const normalCdf = (z: number): number => 0.5 * erfc(-z / Math.SQRT2);

// ln Phi(z), stable in the far lower tail (asymptotic series) where Phi underflows.
export function lnNormalCdf(z: number): number {
  if (z > -6) return Math.log(Math.max(normalCdf(z), Number.MIN_VALUE));
  const z2 = z * z;
  const series = 1 - 1 / z2 + 3 / (z2 * z2) - 15 / (z2 * z2 * z2);
  return -0.5 * z2 - 0.5 * Math.log(2 * Math.PI) - Math.log(-z) + Math.log(series);
}

// Regularised upper incomplete gamma Q(a, x) (series for x < a + 1, continued fraction otherwise).
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const lnFront = -x + a * Math.log(x) - lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n += 1) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return 1 - Math.exp(lnFront) * sum;
  }
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    d = Math.abs(d) < tiny ? tiny : d;
    c = b + an / c;
    c = Math.abs(c) < tiny ? tiny : c;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return Math.exp(lnFront) * h;
}

// P(chi-square with df degrees of freedom >= x)
export const chiSquareSurvival = (x: number, df: number): number => gammaQ(df / 2, x / 2);

// Linear-interpolation quantile of a numeric sample (q in [0, 1]).
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}
