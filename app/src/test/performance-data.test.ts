import { describe, expect, it } from "vitest";
import {
  COHORT_COUNT,
  DEFAULT_SORT,
  cohortBreakdown,
  cohortOf,
  compareVersions,
  createEmptyCohorts,
  createInitialFeed,
  createRng,
  cycleSort,
  leaderboard,
  overallOf,
  recordCall,
  scoresFor,
  sortLeaderboard,
  weakestCohorts,
} from "@/components/vani/performance-data";

describe("performance data", () => {
  it("builds the same feed every time for SSR and hydration", () => {
    expect(createInitialFeed(7)).toEqual(createInitialFeed(7));
  });

  it("always has exactly 10 cohorts, one per GLID last digit", () => {
    const feed = createInitialFeed(7);

    expect(feed).toHaveLength(COHORT_COUNT);
    expect(feed.map((c) => c.digit)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(cohortOf(12_345_678)).toBe(8);
  });

  it("puts GLIDs ending in the same digit into one cohort", () => {
    const rng = createRng(1);
    const empty = createEmptyCohorts();
    const first = recordCall(empty, {
      glid: 10_000_013,
      version: "A",
      scores: scoresFor(10_000_013, "A", rng),
      at: 1,
    });
    const second = recordCall(first, {
      glid: 55_555_553,
      version: "A",
      scores: scoresFor(55_555_553, "A", rng),
      at: 2,
    });

    expect(second).toHaveLength(COHORT_COUNT);
    expect(second[3]?.calls).toBe(2);
    expect(second[3]?.byVersion.A?.calls).toBe(2);
    expect(second.filter((c) => c.calls > 0)).toHaveLength(1);
  });

  it("updates the same cohort when a GLID is re-called and keeps other versions", () => {
    const rng = createRng(2);
    const feed = createInitialFeed(7);
    const before = feed[4];
    const scores = scoresFor(14, "B", rng);

    const next = recordCall(feed, { glid: 14, version: "B", scores, at: 9 });
    const after = next[4];

    expect(next).toHaveLength(COHORT_COUNT);
    expect(after?.calls).toBe((before?.calls ?? 0) + 1);
    expect(after?.lastCallAt).toBe(9);
    expect(after?.byVersion.A).toEqual(before?.byVersion.A);
    expect(after?.byVersion.C).toEqual(before?.byVersion.C);
    expect(after?.byVersion.B?.calls).toBe((before?.byVersion.B?.calls ?? 0) + 1);
  });

  it("keeps the running mean of a cohort between old mean and new score", () => {
    const rng = createRng(3);
    const scores = scoresFor(20, "A", rng);
    const once = recordCall(createEmptyCohorts(), { glid: 20, version: "A", scores, at: 1 });

    expect(once[0]?.byVersion.A?.scores.overall).toBe(scores.overall);
  });

  it("keeps scores within 1 to 5 and overall as the weighted mean", () => {
    const rng = createRng(3);
    const s = scoresFor(12_345_678, "C", rng);
    const { overall, ...kpis } = s;

    expect(Object.values(s).every((n) => n >= 1 && n <= 5)).toBe(true);
    expect(overall).toBe(overallOf(kpis));
  });

  it("counts cohorts (digits) served per version, never more than 10", () => {
    const board = leaderboard(createInitialFeed(7));

    board.forEach((r) => {
      expect(r.cohorts).toBeLessThanOrEqual(COHORT_COUNT);
      expect(r.calls).toBeGreaterThan(0);
    });
    expect(cohortBreakdown(createInitialFeed(7), "A")).toHaveLength(COHORT_COUNT);
  });

  it("ranks by overall by default and sorts by a clicked KPI", () => {
    const board = leaderboard(createInitialFeed(7));

    const byDefault = sortLeaderboard(board, DEFAULT_SORT).map((r) => r.id);
    const overall = [...board].sort((a, b) => b.scores.overall - a.scores.overall).map((r) => r.id);
    expect(byDefault).toEqual(overall);

    const asc = sortLeaderboard(board, { key: "meetingFixed", dir: 1 });
    expect(asc[0]?.scores.meetingFixed).toBeLessThanOrEqual(asc[2]?.scores.meetingFixed ?? 0);
    const desc = sortLeaderboard(board, { key: "meetingFixed", dir: 2 });
    expect(desc[0]?.scores.meetingFixed).toBeGreaterThanOrEqual(desc[2]?.scores.meetingFixed ?? 0);
  });

  it("cycles ascending, descending, default", () => {
    const first = cycleSort(DEFAULT_SORT, "answerRate");
    const second = cycleSort(first, "answerRate");
    const third = cycleSort(second, "answerRate");

    expect([first.dir, second.dir]).toEqual([1, 2]);
    expect(third).toEqual(DEFAULT_SORT);
    expect(cycleSort(second, "callDuration")).toEqual({ key: "callDuration", dir: 1 });
  });

  it("lists the weakest cohorts by digit, lowest first", () => {
    const weak = weakestCohorts(createInitialFeed(7), "overall", 3);

    expect(weak).toHaveLength(3);
    expect(weak[0]?.mean).toBeLessThanOrEqual(weak[2]?.mean ?? 5);
    weak.forEach((w) => expect(w.digit).toBeGreaterThanOrEqual(0));
  });

  it("compares two versions exactly on the primary metric", () => {
    const v = compareVersions("A", "B", "meetingFixed");

    expect(v.leader).toBe("B");
    expect(v.wins).toContain("meetingFixed");
    expect(v.wins).toContain("callDuration"); // lower duration is better
    expect(v.weak).toEqual(["locationConfirmed", "callbackRequested"]);
  });
});
