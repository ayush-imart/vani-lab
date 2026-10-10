// Review fixes: pre-prod gate at start, ingest idempotency and experiment checks, resume,
// approve only at the final stage, step-down resets approval, quiet ticks on non-running runs.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app";
import { setLogSilent } from "./lib/logger";
import { createMemoryRepos, type Repos } from "./repos";
import { buildServices } from "./registry";
import { createFakeAuditor } from "./services/auditor";
import { PREPROD_SCENARIOS } from "./services/preprod-scenarios";
import { applyPolicyDecision } from "./services/rollouts";

beforeAll(() => setLogSilent(true));

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 1);
type Env = { app: ReturnType<typeof buildApp>; repos: Repos };
const makeEnv = (): Env => {
  const repos = createMemoryRepos();
  return { app: buildApp(buildServices(repos, { auditor: createFakeAuditor() }), ["http://localhost:5173"]), repos };
};
const send = (env: Env, path: string, method = "POST", body?: unknown) =>
  env.app.request(path, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const get = (env: Env, path: string) => env.app.request(path);
const json = async <T = Record<string, unknown>>(res: Response) => (await res.json()) as T;

async function newExperiment(env: Env): Promise<string> {
  const res = await send(env, "/experiments", "POST", {
    name: "B vs A", goal: "more meetings", primaryMetric: "meetingFixed", baselineVersionId: "A", challengerVersionId: "B",
  });
  expect(res.status).toBe(201);
  return (await json<{ id: string }>(res)).id;
}

// A finished pre-prod run where every scenario behaved as expected -> gate "pass".
async function passPreprod(env: Env, versionId: string) {
  await env.repos.preprod.save({
    id: "pre_ok", versionId, status: "done", real: false, startedAt: new Date(T0).toISOString(), completedAt: new Date(T0).toISOString(),
    results: PREPROD_SCENARIOS.map((s) => ({
      scenarioId: s.id, check: s.check, severity: s.severity, expected: s.expected, passed: s.expected === "pass", ok: true, reason: "ok", model: "fake",
    })),
  });
}

const call = (glid: string, extra: Record<string, unknown> = {}) => ({
  glid, version: "B", durationSec: 61, outcome: { answered: true, meetingFixed: true, locationConfirmed: false, callbackRequested: false }, ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe("pre-prod gate at start", () => {
  it("rejects a start with 409 when the challenger has not passed pre-prod", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    const res = await send(env, `/experiments/${id}/start`, "POST", {});
    expect(res.status).toBe(409);
    expect(await env.repos.rollouts.getRun(id)).toBeUndefined();
  });

  it("records preprodGate 'pass' when the challenger passed pre-prod", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    await passPreprod(env, "B");
    const res = await send(env, `/experiments/${id}/start`, "POST", {});
    expect(res.status).toBe(201);
    expect((await json<{ preprodGate: string }>(res)).preprodGate).toBe("pass");
  });

  it("allowSimulatedGate starts the run as 'simulated' and logs the override reason", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    const res = await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true });
    expect(res.status).toBe(201);
    expect((await json<{ preprodGate: string }>(res)).preprodGate).toBe("simulated");
    const log = (await json<{ items: { action: string; reason: string }[] }>(await get(env, `/experiments/${id}/rollout/decisions`))).items;
    expect(log[0]?.action).toBe("start");
    expect(log[0]?.reason).toContain("allowSimulatedGate");
  });

  it("rejects a non-boolean allowSimulatedGate with 400", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    expect((await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: "yes" })).status).toBe(400);
  });
});

describe("ingest idempotency and experiment checks", () => {
  it("returns the stored record with 200 for a retried call and records no second autoscale outcome", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true });
    const body = call("9876543210142", { experimentId: id, at: T0 + 1000 });
    const first = await send(env, "/calls", "POST", body);
    expect(first.status).toBe(201);
    const autoscaleAfterFirst = JSON.stringify(await env.repos.traffic.getState());
    const again = await send(env, "/calls", "POST", body);
    expect(again.status).toBe(200);
    expect((await json<{ id: string }>(again)).id).toBe((await json<{ id: string }>(first)).id);
    expect((await env.repos.calls.list()).length).toBe(1);
    expect(JSON.stringify(await env.repos.traffic.getState())).toBe(autoscaleAfterFirst);
  });

  it("treats a different timestamp as a new call", async () => {
    const env = makeEnv();
    expect((await send(env, "/calls", "POST", call("42", { at: T0 }))).status).toBe(201);
    expect((await send(env, "/calls", "POST", call("42", { at: T0 + 1 }))).status).toBe(201);
    expect((await env.repos.calls.list()).length).toBe(2);
  });

  it("returns 404 for an unknown experimentId", async () => {
    const env = makeEnv();
    expect((await send(env, "/calls", "POST", call("42", { experimentId: "exp_nope" }))).status).toBe(404);
    expect((await env.repos.calls.list()).length).toBe(0);
  });

  it("stamps the stage only while the run is running or paused", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    const draft = await json<{ experimentId?: string; stage?: number }>(await send(env, "/calls", "POST", call("11", { experimentId: id })));
    expect(draft).toMatchObject({ experimentId: id });
    expect(draft.stage).toBeUndefined();

    await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true });
    const doc = await env.repos.rollouts.getRun(id);
    if (!doc) throw new Error("run missing");
    await env.repos.rollouts.saveRun({ ...doc, status: "paused" });
    expect((await json<{ stage?: number }>(await send(env, "/calls", "POST", call("12", { experimentId: id })))).stage).toBe(10);
    await send(env, `/experiments/${id}/rollout/rollback`);
    expect((await json<{ stage?: number }>(await send(env, "/calls", "POST", call("13", { experimentId: id })))).stage).toBeUndefined();
  });
});

describe("experiment-scoped performance reads", () => {
  it("filters calls and metrics by experimentId and 404s an unknown one", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    await send(env, "/calls", "POST", call("21", { experimentId: id }));
    await send(env, "/calls", "POST", call("22"));
    expect((await json<{ items: unknown[] }>(await get(env, `/calls?experimentId=${id}`))).items).toHaveLength(1);
    expect((await json<{ items: unknown[] }>(await get(env, "/calls"))).items).toHaveLength(2);
    const versions = await json<{ items: { version: string; calls: number }[] }>(await get(env, `/metrics/versions?experimentId=${id}`));
    expect(versions.items.find((v) => v.version === "B")?.calls).toBe(1);
    expect((await get(env, `/metrics/cohorts?experimentId=${id}`)).status).toBe(200);
    expect((await get(env, `/leaderboard?experimentId=${id}`)).status).toBe(200);
    for (const p of ["/calls", "/metrics/versions", "/metrics/cohorts", "/leaderboard"]) {
      expect((await get(env, `${p}?experimentId=exp_nope`)).status).toBe(404);
    }
  });
});

describe("resume, approve and quiet ticks", () => {
  async function started(env: Env) {
    const id = await newExperiment(env);
    await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true });
    const doc = await env.repos.rollouts.getRun(id);
    if (!doc) throw new Error("run missing");
    return { id, doc };
  }

  it("resumes a paused run (PM action, logged) and lifts the freeze; 409 otherwise", async () => {
    const env = makeEnv();
    const { id, doc } = await started(env);
    expect((await send(env, `/experiments/${id}/rollout/resume`)).status).toBe(409);
    await env.repos.rollouts.saveRun({ ...doc, status: "paused", frozen: true });
    const res = await send(env, `/experiments/${id}/rollout/resume`);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ status: "running", frozen: false, stagePct: 10 });
    const log = (await json<{ items: { action: string; actor: string; trigger: string }[] }>(await get(env, `/experiments/${id}/rollout/decisions`))).items;
    expect(log.at(-1)).toMatchObject({ action: "resume", actor: "pm", trigger: "resumed" });
    expect((await send(env, "/experiments/nope/rollout/resume")).status).toBe(404);
  });

  it("allows approval only at the final ramp stage", async () => {
    const env = makeEnv();
    const { id, doc } = await started(env);
    expect((await send(env, `/experiments/${id}/rollout/approve`)).status).toBe(409);
    await env.repos.rollouts.saveRun({ ...doc, stagePct: 50 });
    const ok = await send(env, `/experiments/${id}/rollout/approve`);
    expect(ok.status).toBe(200);
    expect((await json<{ pmApproved: boolean }>(ok)).pmApproved).toBe(true);
  });

  it("ticks on a non-running run return the hold without appending decisions", async () => {
    const env = makeEnv();
    const { id, doc } = await started(env);
    await env.repos.rollouts.saveRun({ ...doc, status: "paused", frozen: true });
    const before = (await env.repos.rollouts.listDecisions(id)).length;
    for (let i = 0; i < 3; i++) {
      expect(await json(await send(env, `/experiments/${id}/rollout/tick`))).toMatchObject({ action: "hold", trigger: "not_running" });
    }
    expect((await env.repos.rollouts.listDecisions(id)).length).toBe(before);
  });
});

describe("step down resets PM approval", () => {
  it("clears pmApproved on a step down and keeps it otherwise", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true });
    const doc = await env.repos.rollouts.getRun(id);
    if (!doc) throw new Error("run missing");
    const approved = { ...doc, stagePct: 50, pmApproved: true };
    const base = { trigger: "guardrail_on_watch" as const, reason: "watch", toPhase: "ramp" as const, toStatus: "running" as const };
    expect(applyPolicyDecision(approved, { ...base, action: "step_down", toStagePct: 25 }, T0 + HOUR).pmApproved).toBe(false);
    expect(applyPolicyDecision(approved, { ...base, action: "hold", trigger: "cooldown", toStagePct: 50 }, T0 + HOUR).pmApproved).toBe(true);
  });
});
