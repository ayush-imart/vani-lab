// HTTP-level integration tests for the rollout routes (start -> state -> tick -> approve -> rollback
// -> report), the assignment endpoints and the ingest stamping. In-memory repos, fake clock (Date only).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app";
import { setLogSilent } from "./lib/logger";
import { createRng } from "./lib/rng";
import { createMemoryRepos, type Repos } from "./repos";
import { buildServices } from "./registry";
import { createFakeAuditor } from "./services/auditor";
import { baselineProfile, drawCall, withPrimaryRate } from "./services/sim-calls";

beforeAll(() => setLogSilent(true));

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 1);
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

type Env = { app: ReturnType<typeof buildApp>; repos: Repos };
function makeEnv(): Env {
  const repos = createMemoryRepos();
  const app = buildApp(buildServices(repos, { auditor: createFakeAuditor() }), ["http://localhost:5173"]);
  return { app, repos };
}
const get = async (env: Env, path: string) => env.app.request(path);
const send = async (env: Env, path: string, method = "POST", body?: unknown) => env.app.request(path, json(method, body));
const body = async <T = Record<string, unknown>>(res: Response) => (await res.json()) as T;

async function newExperiment(env: Env): Promise<string> {
  const res = await send(env, "/experiments", "POST", {
    name: "B vs A", goal: "more meetings", primaryMetric: "meetingFixed", baselineVersionId: "A", challengerVersionId: "B",
  });
  expect(res.status).toBe(201);
  return (await body<{ id: string }>(res)).id;
}

// Seeds judged calls straight into the repo (the ingest route is rate limited to 60/min).
async function seed(env: Env, experimentId: string, stage: number, n: number, treatmentPct: number, controlPct: number, rngSeed: number, label = "s") {
  const rng = createRng(rngSeed);
  const treat = withPrimaryRate(baselineProfile(), "meetingFixed", treatmentPct);
  const ctrl = withPrimaryRate(baselineProfile(), "meetingFixed", controlPct);
  for (let i = 0; i < n; i++) {
    const bucket = i % 100;
    const treated = bucket < stage;
    const d = drawCall(rng, treated ? treat : ctrl);
    await env.repos.calls.add({
      id: `${label}_${stage}_${i}`, glidLast5: String(bucket).padStart(5, "0"), cohort: bucket % 10, version: treated ? "B" : "A",
      at: Date.now(), durationSec: d.durationSec, outcome: d.outcome, evaluator: d.evaluator, channel: "text", source: "ingest",
      bucket, experimentId, stage,
    });
  }
}

describe("rollout lifecycle over HTTP", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("start -> state (no data) -> tick -> advance x2 -> approval -> promote -> report -> rollback", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);

    const started = await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true });
    expect(started.status).toBe(201);
    const run = await body<{ status: string; stagePct: number; controlSlot: string; challengerSlot: string }>(started);
    expect(run).toMatchObject({ status: "running", stagePct: 10, controlSlot: "A", challengerSlot: "B" });
    expect((await body<{ status: string }>(await get(env, `/experiments/${id}`))).status).toBe("running");

    // null-metrics: no calls yet -> "no data", never a fabricated 0
    const state0 = await body<{ evidence: { primary: Record<string, unknown>; validity: { srm: { pValue: number | null; failed: boolean }; coverage: { share: number | null } } }; nextGate: string }>(
      await get(env, `/experiments/${id}/rollout`),
    );
    expect(state0.evidence.primary.liftPts).toBeNull();
    expect(state0.evidence.primary.rateControl).toBeNull();
    expect(state0.evidence.primary.rateTreatment).toBeNull();
    expect(state0.evidence.primary.nControl).toBe(0);
    expect(state0.evidence.primary.lambdaBenefit).toBe(1);
    expect(state0.evidence.validity.srm.pValue).toBeNull();
    expect(state0.evidence.validity.srm.failed).toBe(false);
    expect(state0.evidence.validity.coverage.share).toBeNull();
    expect(state0.nextGate).toContain("10% -> 25%");

    const hold = await body<{ action: string; trigger: string; liftPts: number | null }>(await send(env, `/experiments/${id}/rollout/tick`));
    expect(hold).toMatchObject({ action: "hold", trigger: "insufficient_data", liftPts: null });
    const rep0 = await body<{ impact: { basis: string; liftPts: number | null } }>(await get(env, `/experiments/${id}/rollout/report`));
    expect(rep0.impact).toMatchObject({ basis: "none", liftPts: null });

    // 10% -> 25%: data in, but min stage time (24h) not yet elapsed
    await seed(env, id, 10, 1500, 35, 18.3, 11);
    vi.setSystemTime(T0 + 2 * HOUR);
    const early = await body<{ action: string; trigger: string }>(await send(env, `/experiments/${id}/rollout/tick`));
    expect(early).toMatchObject({ action: "hold", trigger: "min_stage_time" });
    vi.setSystemTime(T0 + 25 * HOUR);
    const adv1 = await body<{ action: string; toStage: number; fromStage: number }>(await send(env, `/experiments/${id}/rollout/tick`));
    expect(adv1).toMatchObject({ action: "advance", fromStage: 10, toStage: 25 });

    // new stage resets min-stage time and cooldown: immediate tick holds even though the gate is met
    await seed(env, id, 25, 1500, 35, 18.3, 12);
    const cool = await body<{ action: string; trigger: string }>(await send(env, `/experiments/${id}/rollout/tick`));
    expect(cool.action).toBe("hold");
    expect(["min_stage_time", "cooldown"]).toContain(cool.trigger);
    vi.setSystemTime(T0 + 50 * HOUR);
    const adv2 = await body<{ action: string; toStage: number }>(await send(env, `/experiments/${id}/rollout/tick`));
    expect(adv2).toMatchObject({ action: "advance", toStage: 50 });

    // 50% -> 100% needs the PM approval click
    await seed(env, id, 50, 1500, 35, 18.3, 13);
    vi.setSystemTime(T0 + 75 * HOUR);
    const wait = await body<{ action: string; trigger: string }>(await send(env, `/experiments/${id}/rollout/tick`));
    expect(wait).toMatchObject({ action: "hold", trigger: "awaiting_pm_approval" });
    const approved = await send(env, `/experiments/${id}/rollout/approve`);
    expect(approved.status).toBe(200);
    expect((await body<{ pmApproved: boolean }>(approved)).pmApproved).toBe(true);
    const promote = await body<{ action: string; toStage: number; phase: string; actor: string }>(await send(env, `/experiments/${id}/rollout/tick`));
    expect(promote).toMatchObject({ action: "promote", toStage: 95, phase: "holdback", actor: "engine" });

    const state = await body<{ run: { status: string; phase: string; stagePct: number; holdback?: { liftAtPromotionPts: number | null } } }>(await get(env, `/experiments/${id}/rollout`));
    expect(state.run).toMatchObject({ status: "running", phase: "holdback", stagePct: 95 });
    expect(state.run.holdback?.liftAtPromotionPts).toBeGreaterThan(5);

    // assignment follows the stage in force: 95% treatment -> bucket 96 is the holdback (control)
    const a96 = await body<{ arm: string; slot: string }>(await get(env, `/experiments/${id}/assignment?glid=1234596`));
    const a50 = await body<{ arm: string; slot: string }>(await get(env, `/experiments/${id}/assignment?glid=1234550`));
    expect(a96).toMatchObject({ arm: "control", slot: "A" });
    expect(a50).toMatchObject({ arm: "treatment", slot: "B" });

    // decision log is ordered, auditable and has both engine and pm actors
    const log = (await body<{ items: { action: string; actor: string; evidence: unknown }[] }>(await get(env, `/experiments/${id}/rollout/decisions`))).items;
    expect(log.map((d) => d.action)).toEqual(["start", "hold", "hold", "advance", "hold", "advance", "hold", "approve", "promote"]);
    expect(log.find((d) => d.action === "approve")?.actor).toBe("pm");
    expect(log.every((d) => d.evidence !== undefined)).toBe(true);

    // manual rollback
    const rb = await send(env, `/experiments/${id}/rollout/rollback`);
    expect(rb.status).toBe(200);
    expect(await body(rb)).toMatchObject({ status: "rolled_back", stagePct: 0, verdict: "rolled_back_manually", phase: "done" });
    expect((await body<{ status: string }>(await get(env, `/experiments/${id}`))).status).toBe("rolled_back");
    const after = await body<{ arm: string }>(await get(env, `/experiments/${id}/assignment?glid=1234500`));
    expect(after.arm).toBe("control");

    // terminal-state conflicts
    expect((await send(env, `/experiments/${id}/rollout/rollback`)).status).toBe(409);
    expect((await send(env, `/experiments/${id}/rollout/stop`)).status).toBe(409);
    expect((await send(env, `/experiments/${id}/rollout/approve`)).status).toBe(409);
    expect(await body(await send(env, `/experiments/${id}/rollout/tick`))).toMatchObject({ action: "hold", trigger: "not_running" });

    // report: stopping-point lift (no holdback data yet), method recorded, decisions included, no raw GLIDs
    const rep = await get(env, `/experiments/${id}/rollout/report`);
    expect(rep.status).toBe(200);
    const text = await rep.text();
    const report = JSON.parse(text) as { method: { name: string; alpha: number }; impact: { basis: string }; verdict: string; decisions: unknown[] };
    expect(report.method.alpha).toBe(0.05);
    expect(report.method.name).toContain("mSPRT");
    expect(report.verdict).toBe("rolled_back_manually");
    expect(report.decisions.length).toBeGreaterThan(9);
    expect(text).not.toContain("1234596");
  }, 120_000);

  it("a split-ratio mismatch pauses and freezes the run (SRM)", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true });
    // configured 10% treatment, observed 50%
    const rng = createRng(5);
    const prof = baselineProfile();
    for (let i = 0; i < 400; i++) {
      const d = drawCall(rng, prof);
      await env.repos.calls.add({
        id: `srm_${i}`, glidLast5: "00000", cohort: 0, version: i % 2 === 0 ? "B" : "A", at: Date.now(), durationSec: d.durationSec,
        outcome: d.outcome, evaluator: d.evaluator, channel: "text", source: "ingest", bucket: i % 100, experimentId: id, stage: 10,
      });
    }
    vi.setSystemTime(T0 + HOUR);
    const d = await body<{ action: string; trigger: string }>(await send(env, `/experiments/${id}/rollout/tick`));
    expect(d).toMatchObject({ action: "pause", trigger: "srm_failed" });
    const run = (await body<{ run: { status: string; frozen: boolean; stagePct: number } }>(await get(env, `/experiments/${id}/rollout`))).run;
    expect(run).toMatchObject({ status: "paused", frozen: true, stagePct: 10 });
  });

  it("a clearly worse challenger is rolled back to 0% by the engine and marked losing", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true });
    await seed(env, id, 10, 2000, 3.3, 18.3, 21);
    vi.setSystemTime(T0 + HOUR);
    const d = await body<{ action: string; trigger: string; toStage: number }>(await send(env, `/experiments/${id}/rollout/tick`));
    expect(d).toMatchObject({ action: "rollback", trigger: "primary_proven_worse", toStage: 0 });
    const rep = await body<{ verdict: string; run: { status: string } }>(await get(env, `/experiments/${id}/rollout/report`));
    expect(rep).toMatchObject({ verdict: "losing", run: { status: "rolled_back" } });
  });

  it("stop ends the test, keeps control and marks it inconclusive", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true });
    const res = await send(env, `/experiments/${id}/rollout/stop`);
    expect(await body(res)).toMatchObject({ status: "ended", stagePct: 0, verdict: "inconclusive" });
  });

  it("a future windowStart leaves the run scheduled with no treatment traffic, then tick starts it", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    const res = await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true, windowStart: new Date(T0 + 5 * HOUR).toISOString() });
    expect(await body(res)).toMatchObject({ status: "scheduled" });
    expect((await body<{ arm: string }>(await get(env, `/experiments/${id}/assignment?glid=1234500`))).arm).toBe("control");
    vi.setSystemTime(T0 + 6 * HOUR);
    await send(env, `/experiments/${id}/rollout/tick`);
    expect((await body<{ run: { status: string } }>(await get(env, `/experiments/${id}/rollout`))).run.status).toBe("running");
  });

  it("concurrent ticks and starts are serialised (one run, no crash)", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    const starts = await Promise.all([send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true }), send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true })]);
    expect(starts.map((r) => r.status).sort()).toEqual([201, 409]);
    const ticks = await Promise.all([1, 2, 3].map(() => send(env, `/experiments/${id}/rollout/tick`)));
    expect(ticks.every((r) => r.status === 200)).toBe(true);
    const decisions = (await body<{ items: { action: string }[] }>(await get(env, `/experiments/${id}/rollout/decisions`))).items;
    expect(decisions.filter((d) => d.action === "start")).toHaveLength(1);
  });
});

describe("rollout error paths", () => {
  it("returns 404 for unknown experiments and for experiments without a run", async () => {
    const env = makeEnv();
    expect((await send(env, "/experiments/nope/start", "POST", {})).status).toBe(404);
    for (const [method, path] of [
      ["GET", "rollout"], ["POST", "rollout/tick"], ["POST", "rollout/approve"], ["POST", "rollout/rollback"],
      ["POST", "rollout/stop"], ["GET", "rollout/decisions"], ["GET", "rollout/report"], ["GET", "assignment?glid=12"],
    ] as const) {
      const res = await send(env, `/experiments/nope/${path}`, method);
      expect(res.status, `${method} ${path}`).toBe(404);
      expect((await body<{ error: { code: string } }>(res)).error.code).toBe("not_found");
    }
    const id = await newExperiment(env); // exists but never started
    expect((await get(env, `/experiments/${id}/rollout`)).status).toBe(404);
    expect((await send(env, `/experiments/${id}/rollout/tick`)).status).toBe(404);
  });

  it("returns 409 on a second start and 409 on approve for a non-running run", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    expect((await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true })).status).toBe(201);
    const dup = await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true });
    expect(dup.status).toBe(409);
    expect((await body<{ error: { code: string } }>(dup)).error.code).toBe("conflict");
    await send(env, `/experiments/${id}/rollout/stop`);
    expect((await send(env, `/experiments/${id}/rollout/approve`)).status).toBe(409);
  });

  it("returns 400 for settings outside the PM spec bounds and for malformed values", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    const tooLoose = await send(env, `/experiments/${id}/start`, "POST", { cooldownHours: 1 });
    expect(tooLoose.status).toBe(400);
    expect((await body<{ error: { code: string } }>(tooLoose)).error.code).toBe("bad_request");
    const wrongType = await send(env, `/experiments/${id}/start`, "POST", { startPct: "ten" });
    expect(wrongType.status).toBe(400);
    expect((await body<{ error: { code: string } }>(wrongType)).error.code).toBe("validation_error");
    expect((await send(env, `/experiments/${id}/start`, "POST", { channel: "fax" })).status).toBe(400);
    // nothing was started by the failed attempts
    expect((await get(env, `/experiments/${id}/rollout`)).status).toBe(404);
  });

  it("validates assignment queries (digits only) and simulation bodies", async () => {
    const env = makeEnv();
    expect((await get(env, "/assignment?glid=abc")).status).toBe(400);
    expect((await get(env, "/assignment")).status).toBe(400);
    expect((await get(env, "/assignment?glid=12&pct=101")).status).toBe(400);
    expect((await get(env, "/assignment?glid=" + "1".repeat(21))).status).toBe(400);
    expect((await send(env, "/simulations/rollout", "POST", { scenario: "nope" })).status).toBe(400);
    expect((await send(env, "/simulations/rollout", "POST", { callsPerDay: 5 })).status).toBe(400);
    expect((await send(env, "/assignment/balance", "POST", { pct: 10, sellers: [] })).status).toBe(400);
  });
});

describe("assignment by the last two GLID digits", () => {
  it("is deterministic and depends only on the last two digits", async () => {
    const env = makeEnv();
    const arm = async (glid: string, pct = 10) => body<{ bucket: number; arm: string; treatmentPct: number }>(await get(env, `/assignment?glid=${glid}&pct=${pct}`));
    expect(await arm("987654307")).toMatchObject({ bucket: 7, arm: "treatment" });
    expect(await arm("987654309")).toMatchObject({ bucket: 9, arm: "treatment" });
    expect(await arm("987654310")).toMatchObject({ bucket: 10, arm: "control" });
    expect(await arm("5")).toMatchObject({ bucket: 5, arm: "treatment" }); // short GLID pads to 05
    expect(await arm("100")).toMatchObject({ bucket: 0, arm: "treatment" });
    expect(await arm("1234599", 100)).toMatchObject({ bucket: 99, arm: "treatment" });
    expect(await arm("1234500", 0)).toMatchObject({ bucket: 0, arm: "control" });
    // same last two digits, different prefixes -> same arm; repeated calls -> same answer
    const first = await arm("111111142", 50);
    for (const g of ["22222242", "9999999942", "42"]) expect(await arm(g, 50)).toEqual(first);
    // treatment set only grows with the stage: a treated seller stays treated at higher stages
    for (const b of ["03", "09", "24", "49"]) {
      const lo = (await arm(`55${b}`, 25)).arm;
      const hi = (await arm(`55${b}`, 50)).arm;
      if (lo === "treatment") expect(hi).toBe("treatment");
    }
  });

  it("never echoes the GLID back", async () => {
    const env = makeEnv();
    const res = await get(env, "/assignment?glid=9876543210123");
    expect(await res.text()).not.toContain("9876543210123");
    const id = await newExperiment(env);
    await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true });
    const res2 = await get(env, `/experiments/${id}/assignment?glid=9876543210123`);
    expect(await res2.text()).not.toContain("9876543210123");
  });

  it("serves the challenger to everyone once a run is completed at 100%", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true, holdbackPct: 0 });
    const doc = await env.repos.rollouts.getRun(id);
    if (!doc) throw new Error("run missing");
    await env.repos.rollouts.saveRun({ ...doc, status: "completed", phase: "done", stagePct: 100 });
    expect(await body(await get(env, `/experiments/${id}/assignment?glid=1234599`))).toMatchObject({ arm: "treatment", slot: "B" });
  });
});

describe("ingest stamps experiment, stage and bucket", () => {
  const call = (glid: string, extra: Record<string, unknown> = {}) => ({
    glid, version: "B", durationSec: 61, outcome: { answered: true, meetingFixed: false, locationConfirmed: false, callbackRequested: false }, ...extra,
  });

  it("stamps experimentId, stage in force and bucket; masks the GLID", async () => {
    const env = makeEnv();
    const id = await newExperiment(env);
    await send(env, `/experiments/${id}/start`, "POST", { allowSimulatedGate: true });
    const res = await send(env, "/calls", "POST", call("9876543210142", { experimentId: id, channel: "text" }));
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain("9876543210142");
    const rec = JSON.parse(text) as { experimentId: string; stage: number; bucket: number; source: string; glidLast5: string };
    expect(rec).toMatchObject({ experimentId: id, stage: 10, bucket: 42, source: "ingest", glidLast5: "10142" });

    // the stage stamped follows the run's current stage
    const doc = await env.repos.rollouts.getRun(id);
    if (!doc) throw new Error("run missing");
    await env.repos.rollouts.saveRun({ ...doc, stagePct: 25 });
    const rec2 = await body<{ stage: number; bucket: number }>(await send(env, "/calls", "POST", call("77", { experimentId: id })));
    expect(rec2).toMatchObject({ stage: 25, bucket: 77 });
  });

  it("without an experimentId the call carries bucket but no experiment or stage", async () => {
    const env = makeEnv();
    const rec = await body<Record<string, unknown>>(await send(env, "/calls", "POST", call("5")));
    expect(rec.bucket).toBe(5);
    expect(rec.experimentId).toBeUndefined();
    expect(rec.stage).toBeUndefined();
  });

  it("rejects invalid call bodies with 400", async () => {
    const env = makeEnv();
    expect((await send(env, "/calls", "POST", call("12abc"))).status).toBe(400);
    expect((await send(env, "/calls", "POST", { ...call("12"), version: "Z" })).status).toBe(400);
  });
});
