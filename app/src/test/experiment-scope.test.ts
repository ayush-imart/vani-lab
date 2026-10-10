import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import {
  EXP_STORAGE_KEY,
  getExperimentId,
  resolveExperimentId,
  setExperimentId,
  syncExperimentFromUrl,
  withExperiment,
} from "@/lib/experiment-scope";
import { experimentSlots, type Experiment } from "@/lib/experiments-api";
import { scopeIds } from "@/components/vani/use-scoped-slots";
import { bucketLabel } from "@/components/vani/rollout-plan";

const exp = (id: string, status: Experiment["status"], b = "A", c = "B"): Experiment => ({
  id,
  name: id,
  goal: "g",
  primaryMetric: "meetingFixed",
  baselineVersionId: b,
  challengerVersionId: c,
  status,
  createdAt: "2026-10-10T00:00:00Z",
});

describe("experiment scope", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    setExperimentId(null);
  });
  it("prefers the URL id, then the stored id, else none", () => {
    expect(resolveExperimentId("exp_1", "exp_2")).toBe("exp_1");
    expect(resolveExperimentId(undefined, "exp_2")).toBe("exp_2");
    expect(resolveExperimentId(undefined, null)).toBeNull();
  });
  it("rejects malformed ids", () => {
    expect(resolveExperimentId("<script>", null)).toBeNull();
    expect(resolveExperimentId(42, null)).toBeNull();
  });
  it("syncs from the URL and remembers the choice in localStorage", () => {
    syncExperimentFromUrl("exp_9");
    expect(getExperimentId()).toBe("exp_9");
    expect(localStorage.getItem(EXP_STORAGE_KEY)).toBe("exp_9");
    syncExperimentFromUrl(undefined);
    expect(getExperimentId()).toBe("exp_9");
  });
  it("adds experimentId to API paths only when one is selected", () => {
    expect(withExperiment("/metrics/versions", null)).toBe("/metrics/versions");
    expect(withExperiment("/metrics/versions", "e1")).toBe("/metrics/versions?experimentId=e1");
    expect(withExperiment("/x?a=1", "e1")).toBe("/x?a=1&experimentId=e1");
  });
});

describe("experiment list and version scoping", () => {
  const items = [exp("a", "running"), exp("b", "draft"), exp("c", "rolled_back")];
  it("maps an experiment's versions to their slots", () => {
    const lib = [
      { id: "A", label: "Base", slot: "A" as const, changelog: "", createdAt: "" },
      { id: "ver_1", label: "New", slot: "C" as const, changelog: "", createdAt: "" },
    ];
    expect(experimentSlots(exp("x", "running", "A", "ver_1"), lib)).toEqual(["A", "C"]);
    expect(experimentSlots(undefined, lib)).toEqual([]);
  });
  it("scopes version ids, falling back to all when nothing matches", () => {
    expect(scopeIds(["A", "B", "C"], ["A", "C"])).toEqual(["A", "C"]);
    expect(scopeIds(["A", "B", "C"], null)).toEqual(["A", "B", "C"]);
    expect(scopeIds(["A", "B", "C"], ["Z"])).toEqual(["A", "B", "C"]);
  });
  it("labels the start buckets", () => {
    expect(bucketLabel(10)).toBe("GLID 00–09");
    expect(bucketLabel(25)).toBe("GLID 00–24");
  });
});

describe("routes", () => {
  it("serves the experiments list at / and Performance at /performance", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/").at(-1)?.routeId).toBe("/");
    expect(router.matchRoutes("/performance").at(-1)?.routeId).toBe("/performance");
  });
});
