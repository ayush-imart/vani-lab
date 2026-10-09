import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { setLogSilent } from "./lib/logger";
import { createMemoryRepos } from "./repos";
import { buildServices } from "./registry";
import type { AuditorPort } from "./services/auditor";
import { createFakeAuditor } from "./services/auditor";

beforeAll(() => setLogSilent(true));

function makeApp(auditor: AuditorPort = createFakeAuditor()) {
  const services = buildServices(createMemoryRepos(), { auditor });
  return buildApp(services, ["http://localhost:5173"]);
}
type App = ReturnType<typeof makeApp>;

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const put = (body: unknown): RequestInit => ({ ...json(body), method: "PUT" });
const turns = [
  { speaker: "bot", text: "Namaste" },
  { speaker: "seller", text: "Haan" },
];
const call = (glid: number, version: string, meetingFixed: boolean) => ({
  glid,
  version,
  durationSec: 50,
  outcome: { answered: true, meetingFixed, locationConfirmed: true, callbackRequested: false },
  scores: { meetingFixed: 4, callDuration: 4, answerRate: 4, locationConfirmed: 4, callbackRequested: 4 },
});

async function waitForAudit(app: App, id: string) {
  for (let i = 0; i < 50; i += 1) {
    const body = (await (await app.request(`/audits/${id}`)).json()) as { status: string };
    if (body.status !== "running") return body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("audit did not finish");
}

describe("audits", () => {
  it("accepts an audit, streams ordered stages then a result, and computes overall in code", async () => {
    const app = makeApp();
    const res = await app.request("/audits", json({ version: "B", transcript: turns, durationSec: 30 }));
    expect(res.status).toBe(202);
    const { auditId } = (await res.json()) as { auditId: string };

    const sse = await (await app.request(`/audits/${auditId}/events`)).text();
    const events = sse
      .split("\n\n")
      .filter(Boolean)
      .map((chunk) => JSON.parse(chunk.replace(/^data: /, "")) as Record<string, unknown>);
    const stages = events.filter((e) => e.type === "stage").map((e) => `${e.stage}:${e.status}`);
    expect(stages).toEqual([
      "transcript:running",
      "transcript:done",
      "guardrails:running",
      "kpis:running",
      "guardrails:done",
      "kpis:done",
      "overall:running",
      "overall:done",
      "saved:running",
      "saved:done",
    ]);
    expect(events.at(-1)).toMatchObject({ type: "result", overall: 3, guardrailsPassed: true });

    const record = (await (await app.request(`/audits/${auditId}`)).json()) as { model: string };
    expect(record.model).toBe("fake-auditor");
    const list = (await (await app.request("/audits?version=B")).json()) as { items: unknown[] };
    expect(list.items).toHaveLength(1);
  });

  it("retries once on invalid output, then succeeds", async () => {
    let calls = 0;
    const good = await createFakeAuditor().audit({
      version: "A",
      transcript: [],
      durationSec: 1,
      answered: true,
      guardrails: ["no_abusive_language", "no_false_claims", "no_pii_requested"],
    });
    const flaky: AuditorPort = {
      audit: async () => {
        calls += 1;
        return calls === 1 ? { raw: { scores: "bad" }, model: "m" } : good;
      },
    };
    const app = makeApp(flaky);
    const { auditId } = (await (
      await app.request("/audits", json({ version: "A", transcript: turns, durationSec: 5 }))
    ).json()) as { auditId: string };
    expect(((await waitForAudit(app, auditId)) as { status: string }).status).toBe("done");
    expect(calls).toBe(2);
  });

  it("ends in error after two invalid outputs and the SSE carries the error event", async () => {
    const broken: AuditorPort = { audit: async () => ({ raw: {}, model: "m" }) };
    const app = makeApp(broken);
    const { auditId } = (await (
      await app.request("/audits", json({ version: "A", transcript: turns, durationSec: 5 }))
    ).json()) as { auditId: string };
    const sse = await (await app.request(`/audits/${auditId}/events`)).text();
    expect(sse).toContain('"type":"error"');
    expect(((await waitForAudit(app, auditId)) as { status: string }).status).toBe("error");
  });

  it("cancels a running audit and is idempotent afterwards", async () => {
    const app = makeApp(createFakeAuditor(200));
    const { auditId } = (await (
      await app.request("/audits", json({ version: "A", transcript: turns, durationSec: 5 }))
    ).json()) as { auditId: string };
    const del = await app.request(`/audits/${auditId}`, { method: "DELETE" });
    expect(await del.json()).toEqual({ id: auditId, status: "cancelled" });
    const again = await app.request(`/audits/${auditId}`, { method: "DELETE" });
    expect(await again.json()).toEqual({ id: auditId, status: "cancelled" });
  });

  it("validates input with the error envelope and 404s unknown ids", async () => {
    const app = makeApp();
    const bad = await app.request("/audits", json({ version: "Z" }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("validation_error");
    expect((await app.request("/audits/nope")).status).toBe(404);
    expect((await app.request("/audits/nope/events")).status).toBe(404);
  });
});

describe("rubric", () => {
  it("returns defaults, rejects weights that do not sum to 1, and changes the overall maths", async () => {
    const app = makeApp();
    const rubric = (await (await app.request("/rubric")).json()) as {
      primaryMetric: string;
      weights: Record<string, number>;
      guardrails: string[];
    };
    expect(rubric.primaryMetric).toBe("meetingFixed");
    const bad = await app.request("/rubric", put({ ...rubric, weights: { ...rubric.weights, meetingFixed: 0.9 } }));
    expect(bad.status).toBe(400);
    const ok = await app.request(
      "/rubric",
      put({ ...rubric, weights: { ...rubric.weights, meetingFixed: 0.5, callDuration: 0.05 } }),
    );
    expect(ok.status).toBe(200);
    const posted = (await (await app.request("/calls", json({ ...call(1234567891, "B", true), scores: { meetingFixed: 5, callDuration: 1, answerRate: 1, locationConfirmed: 1, callbackRequested: 1 } }))).json()) as { scores: { overall: number } };
    expect(posted.scores.overall).toBe(3); // 5*.5+1*.5 (default weights would give 2.6)
  });
});

describe("performance", () => {
  it("masks GLIDs, assigns cohorts by last digit and aggregates per version and cohort", async () => {
    const app = makeApp();
    const created = (await (await app.request("/calls", json(call(9876543217, "B", true)))).json()) as {
      glidLast5: string;
      cohort: number;
    };
    expect(created.glidLast5).toBe("43217");
    expect(created.cohort).toBe(7);
    await app.request("/calls", json(call(1111111117, "B", false)));
    const metrics = (await (await app.request("/metrics/versions")).json()) as {
      items: { version: string; calls: number; meetingFixedPct: number }[];
    };
    expect(metrics.items.find((m) => m.version === "B")).toMatchObject({ calls: 2, meetingFixedPct: 50 });
    const cohorts = (await (await app.request("/metrics/cohorts")).json()) as { items: { digit: number; calls: number }[] };
    expect(cohorts.items).toHaveLength(10);
    expect(cohorts.items[7]?.calls).toBe(2);
    const board = (await (await app.request("/leaderboard?sort=meetingFixed")).json()) as { items: { version: string; rank: number }[] };
    expect(board.items[0]).toMatchObject({ version: "B", rank: 1 });
    const feed = (await (await app.request("/calls?limit=1")).json()) as { items: unknown[] };
    expect(feed.items).toHaveLength(1);
  });
});

describe("versions and experiments", () => {
  it("saves a new immutable version, shows history and diff, and builds an experiment", async () => {
    const app = makeApp();
    const created = (await (
      await app.request("/versions", json({ label: "B2", promptText: "a\nb2", changelog: "x", parentId: "B" }))
    ).json()) as { id: string };
    const diff = (await (await app.request(`/versions/diff?from=B&to=${created.id}`)).json()) as { added: number; removed: number };
    expect(diff).toMatchObject({ added: 2, removed: 1 });
    const hist = (await (await app.request(`/versions/${created.id}/history`)).json()) as { items: { id: string }[] };
    expect(hist.items.map((v) => v.id)).toEqual([created.id, "B"]);
    expect((await app.request(`/versions/${created.id}`, put({}))).status).toBe(404); // no update route
    const exp = await app.request(
      "/experiments",
      json({ name: "E", goal: "g", primaryMetric: "meetingFixed", baselineVersionId: "A", challengerVersionId: created.id }),
    );
    expect(exp.status).toBe(201);
    const same = await app.request(
      "/experiments",
      json({ name: "E", goal: "g", primaryMetric: "meetingFixed", baselineVersionId: "A", challengerVersionId: "A" }),
    );
    expect(same.status).toBe(400);
  });
});

describe("autoscale, traffic and notifications", () => {
  it("defaults ON, scales a bad version down, logs evidence and notifies", async () => {
    const app = makeApp();
    const settings = (await (await app.request("/autoscale/settings")).json()) as Record<string, unknown>;
    expect(settings).toMatchObject({ autoscale: true, riskAppetite: "moderate", thresholdPct: 12, stepPoints: 2.5 });
    expect(await (await app.request("/traffic")).json()).toEqual({ A: 50, B: 25, C: 25 });
    expect((await app.request("/traffic", put({ A: 60, B: 30, C: 20 }))).status).toBe(400);

    await app.request("/autoscale/outcomes", json({ version: "C", trials: 1000, successes: 20 }));
    const tick = (await (await app.request("/autoscale/tick", { method: "POST" })).json()) as {
      traffic: Record<string, number>;
      decisions: { decision: string; pValue: number }[];
    };
    expect(tick.traffic).toEqual({ A: 75, B: 25, C: 0 });
    expect(tick.decisions[0]).toMatchObject({ decision: "scale-down" });
    const log = (await (await app.request("/autoscale/decisions")).json()) as { items: unknown[] };
    expect(log.items).toHaveLength(1);

    const notes = (await (await app.request("/notifications")).json()) as { items: { id: string }[]; unread: number };
    expect(notes.unread).toBe(1);
    await app.request(`/notifications/${notes.items[0]?.id}/read`, { method: "POST" });
    expect(((await (await app.request("/notifications")).json()) as { unread: number }).unread).toBe(0);
  });

  it("derives autoscale evidence from ingested calls and never scales the baseline", async () => {
    const app = makeApp();
    for (let i = 0; i < 60; i += 1) await app.request("/calls", json(call(1000000000 + i, "A", false)));
    const tick = (await (await app.request("/autoscale/tick", { method: "POST" })).json()) as { decisions: unknown[] };
    expect(tick.decisions).toHaveLength(0);
    const state = (await (await app.request("/autoscale/state")).json()) as { totals: { A: { trials: number } } };
    expect(state.totals.A.trials).toBe(60);
  });

  it("allows CORS from the dev frontend only", async () => {
    const app = makeApp();
    const res = await app.request("/health", { headers: { Origin: "http://localhost:5173" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const other = await app.request("/health", { headers: { Origin: "http://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});
