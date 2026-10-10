// Synthetic live-performance feed for the Performance dashboard.
// Frontend-only: the team's external backend replaces this module's boundary.

export type VersionId = "A" | "B" | "C";
export const versionIds: VersionId[] = ["A", "B", "C"];

export const metricKeys = [
  "overall",
  "meetingFixed",
  "callDuration",
  "answerRate",
  "locationConfirmed",
  "callbackRequested",
] as const;
export type MetricKey = (typeof metricKeys)[number];
export type Scores = Record<MetricKey, number>;

export type MetricDef = { key: MetricKey; label: string; short: string; weight: number };

// Weights are an illustrative placeholder; the primary metric is user-editable in the product.
export const metricDefs: MetricDef[] = [
  { key: "overall", label: "Overall score", short: "Overall", weight: 0 },
  { key: "meetingFixed", label: "Meeting Fixed rate", short: "Meeting Fixed", weight: 0.4 },
  { key: "callDuration", label: "Call duration", short: "Call duration", weight: 0.15 },
  { key: "answerRate", label: "Answer rate", short: "Answer rate", weight: 0.15 },
  {
    key: "locationConfirmed",
    label: "Location confirmed rate",
    short: "Location confirmed",
    weight: 0.15,
  },
  {
    key: "callbackRequested",
    label: "Callback requested rate",
    short: "Callback requested",
    weight: 0.15,
  },
];
export const kpiDefs = metricDefs.filter((m) => m.key !== "overall");

// A cohort is every GLID that ends in the same last digit, so there are exactly 10 (0-9).
export const COHORT_COUNT = 10;
export type VersionCohortStats = { calls: number; scores: Scores };
export type CohortRecord = {
  digit: number;
  calls: number;
  lastCallAt: number;
  byVersion: Partial<Record<VersionId, VersionCohortStats>>;
};
export type CallEvent = { glid: number; version: VersionId; scores: Scores; at: number };

const INITIAL_CALLS = 120;
const RECALL_SHARE = 0.35;
const MIN_SCORE = 1;
const MAX_SCORE = 5;
const TRAFFIC_SHARE: Record<VersionId, number> = { A: 0.5, B: 0.25, C: 0.25 };
// Mean score per version, matching the sample scorecard (A 3.6, B 4.2, C 2.7).
const BASE_SCORE: Record<VersionId, number> = { A: 3.6, B: 4.2, C: 2.7 };
const KPI_OFFSET: Record<MetricKey, number> = {
  overall: 0,
  meetingFixed: 0.1,
  callDuration: -0.15,
  answerRate: 0.2,
  locationConfirmed: 0.3,
  callbackRequested: -0.25,
};

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n: number) => Math.min(MAX_SCORE, Math.max(MIN_SCORE, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export const cohortOf = (glid: number): number => glid % COHORT_COUNT;

// Some GLID cohorts are systematically weaker for a version; this is what the weak-cohort callout reveals.
function cohortEffect(glid: number, version: VersionId): number {
  const digit = glid % 10;
  const shift = versionIds.indexOf(version) * 3;
  return (((digit * 7 + shift) % 10) - 4.5) / 4.5 / 1.6;
}

export function overallOf(kpis: Omit<Scores, "overall">): number {
  const total = kpiDefs.reduce(
    (sum, m) => sum + kpis[m.key as Exclude<MetricKey, "overall">] * m.weight,
    0,
  );
  return round1(clamp(total));
}

export function scoresFor(glid: number, version: VersionId, rng: Rng): Scores {
  const kpis = {} as Omit<Scores, "overall">;
  kpiDefs.forEach((m) => {
    const noise = (rng() - 0.5) * 0.5;
    kpis[m.key as Exclude<MetricKey, "overall">] = round1(
      clamp(BASE_SCORE[version] + KPI_OFFSET[m.key] + cohortEffect(glid, version) + noise),
    );
  });
  return { overall: overallOf(kpis), ...kpis };
}

function pickVersion(rng: Rng): VersionId {
  const roll = rng();
  let acc = 0;
  for (const id of versionIds) {
    acc += TRAFFIC_SHARE[id];
    if (roll < acc) return id;
  }
  return "A";
}

export function createEmptyCohorts(): CohortRecord[] {
  return Array.from({ length: COHORT_COUNT }, (_, digit) => ({
    digit,
    calls: 0,
    lastCallAt: 0,
    byVersion: {},
  }));
}

function mergeScores(prev: VersionCohortStats | undefined, call: CallEvent): VersionCohortStats {
  const calls = (prev?.calls ?? 0) + 1;
  const scores = {} as Scores;
  metricKeys.forEach((k) => {
    const total = (prev?.scores[k] ?? 0) * (prev?.calls ?? 0) + call.scores[k];
    scores[k] = total / calls;
  });
  return { calls, scores };
}

// A call updates the cohort of its GLID's last digit; a re-called GLID simply updates it again.
export function recordCall(feed: CohortRecord[], call: CallEvent): CohortRecord[] {
  const digit = cohortOf(call.glid);
  return feed.map((c) =>
    c.digit === digit
      ? {
          ...c,
          calls: c.calls + 1,
          lastCallAt: call.at,
          byVersion: {
            ...c.byVersion,
            [call.version]: mergeScores(c.byVersion[call.version], call),
          },
        }
      : c,
  );
}

export function nextCall(rng: Rng, glids: number[], at: number): CallEvent {
  const version = pickVersion(rng);
  const recalled = rng() < RECALL_SHARE ? glids[Math.floor(rng() * glids.length)] : undefined;
  const glid = recalled ?? 10_000_000 + Math.floor(rng() * 89_999_999);
  return { glid, version, scores: scoresFor(glid, version, rng), at };
}

export function createInitialFeed(
  seed = 2026,
  now = Date.UTC(2026, 9, 9, 8, 0, 0),
): CohortRecord[] {
  const rng = createRng(seed);
  let feed = createEmptyCohorts();
  const glids: number[] = [];
  for (let i = 0; i < INITIAL_CALLS; i += 1) {
    const call = nextCall(rng, glids, now - (INITIAL_CALLS - i) * 20_000);
    glids.push(call.glid);
    feed = recordCall(feed, call);
  }
  return feed;
}

export type LeaderRow = {
  id: VersionId;
  cohorts: number;
  calls: number;
  scores: Scores;
  rank: number;
};

// Call-weighted mean across the version's cohorts; `cohorts` counts digits (0-9) it has served.
export function leaderboard(feed: CohortRecord[], versions: readonly VersionId[] = versionIds): LeaderRow[] {
  const rows = versions.map((id) => {
    const served = feed.flatMap((c) =>
      c.byVersion[id] ? [c.byVersion[id] as VersionCohortStats] : [],
    );
    const calls = served.reduce((s, x) => s + x.calls, 0);
    const scores = {} as Scores;
    metricKeys.forEach((k) => {
      scores[k] = calls ? round1(served.reduce((s, x) => s + x.scores[k] * x.calls, 0) / calls) : 0;
    });
    return { id, cohorts: served.length, calls, scores, rank: 0 };
  });
  const byOverall = [...rows].sort((a, b) => b.scores.overall - a.scores.overall);
  return rows.map((r) => ({ ...r, rank: byOverall.findIndex((x) => x.id === r.id) + 1 }));
}

export type SortState = { key: MetricKey; dir: 0 | 1 | 2 };
export const DEFAULT_SORT: SortState = { key: "overall", dir: 0 };

// Click cycle: ascending -> descending -> default (overall, best first).
export function cycleSort(sort: SortState, key: MetricKey): SortState {
  if (sort.key !== key || sort.dir === 0) return { key, dir: 1 };
  if (sort.dir === 1) return { key, dir: 2 };
  return DEFAULT_SORT;
}

export function sortLeaderboard(rows: LeaderRow[], sort: SortState): LeaderRow[] {
  const sorted = [...rows];
  if (sort.dir === 0) return sorted.sort((a, b) => b.scores.overall - a.scores.overall);
  const factor = sort.dir === 1 ? 1 : -1;
  return sorted.sort((a, b) => (a.scores[sort.key] - b.scores[sort.key]) * factor);
}

export type WeakCohort = { digit: number; label: string; mean: number; calls: number };

// Lowest-scoring cohorts (by last digit) on a metric, averaged over every version they served.
export function weakestCohorts(
  feed: CohortRecord[],
  metric: MetricKey,
  count = 3,
  versions: readonly VersionId[] = versionIds,
): WeakCohort[] {
  return feed
    .flatMap((c) => {
      const served = versions.flatMap((id) => (c.byVersion[id] ? [c.byVersion[id]!] : []));
      const calls = served.reduce((s, x) => s + x.calls, 0);
      if (!calls) return [];
      const mean = served.reduce((s, x) => s + x.scores[metric] * x.calls, 0) / calls;
      return [{ digit: c.digit, label: `Ends in ${c.digit}`, mean: round1(mean), calls }];
    })
    .sort((a, b) => a.mean - b.mean || a.digit - b.digit)
    .slice(0, count);
}

// Per-cohort rows for one version (all 10 digits, empty cohorts have calls = 0).
export function cohortBreakdown(feed: CohortRecord[], id: VersionId) {
  return feed.map((c) => ({
    digit: c.digit,
    calls: c.byVersion[id]?.calls ?? 0,
    overall: c.byVersion[id] ? round1(c.byVersion[id]!.scores.overall) : null,
  }));
}

// Synthetic KPI snapshot per version (rates from the live pipeline sample); calls in seconds for duration.
export type KpiKey = Exclude<MetricKey, "overall">;
export const KPI_SNAPSHOT: Record<VersionId, Record<KpiKey, number>> = {
  A: {
    meetingFixed: 11.5,
    callDuration: 74,
    answerRate: 68.4,
    locationConfirmed: 62.5,
    callbackRequested: 8.1,
  },
  B: {
    meetingFixed: 13.2,
    callDuration: 69,
    answerRate: 71.2,
    locationConfirmed: 60.8,
    callbackRequested: 7.6,
  },
  C: {
    meetingFixed: 9.8,
    callDuration: 81,
    answerRate: 66.1,
    locationConfirmed: 58.2,
    callbackRequested: 6.9,
  },
};
export const LOWER_IS_BETTER: KpiKey[] = ["callDuration"];
export const kpiUnit = (k: KpiKey) => (k === "callDuration" ? "s" : "%");

export type Verdict = {
  leader: VersionId;
  other: VersionId;
  wins: KpiKey[];
  weak: KpiKey[];
  tie: boolean;
};

// Exact comparison of two versions on the primary metric; `weak` = KPIs where the leader is behind.
export function compareVersions(
  a: VersionId,
  b: VersionId,
  primary: KpiKey,
  table: Record<VersionId, Record<KpiKey, number>> = KPI_SNAPSHOT,
): Verdict {
  const diff = (k: KpiKey) => {
    const d = table[a][k] - table[b][k];
    return LOWER_IS_BETTER.includes(k) ? -d : d;
  };
  const tie = diff(primary) === 0;
  const [leader, other, sign] = diff(primary) >= 0 ? [a, b, 1] : [b, a, -1];
  const kpis = kpiDefs.map((m) => m.key as KpiKey);
  return {
    leader,
    other,
    tie,
    wins: kpis.filter((k) => diff(k) * sign > 0),
    weak: kpis.filter((k) => diff(k) * sign < 0),
  };
}
