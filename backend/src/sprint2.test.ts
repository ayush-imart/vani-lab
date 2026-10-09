import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { setLogSilent } from "./lib/logger";
import { createMemoryRepos } from "./repos";
import { buildServices, type Ports } from "./registry";
import { createFakeAuditor, type AuditorPort } from "./services/auditor";
import { createSessionService, type VoiceConfig } from "./services/sessions";

beforeAll(() => setLogSilent(true));

function makeApp(ports: Partial<Ports> = {}) {
  const services = buildServices(createMemoryRepos(), { auditor: createFakeAuditor(), ...ports });
  return buildApp(services, ["http://localhost:5173"]);
}
const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
type Gate = {
  status: string;
  checks: { id: string; status: string; reasons: string[] }[];
};

async function waitRun(app: ReturnType<typeof makeApp>, id: string) {
  for (let i = 0; i < 50; i += 1) {
    const run = (await (await app.request(`/preprod/runs/${id}`)).json()) as { status: string };
    if (run.status !== "running") return run;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("run did not finish");
}

describe("pre-prod gate", () => {
  it("lists 4 checks and starts pending, then passes after a fake-judge run", async () => {
    const app = makeApp();
    const cat = (await (await app.request("/preprod/scenarios")).json()) as {
      checks: { id: string }[];
      scenarios: unknown[];
    };
    expect(cat.checks.map((c) => c.id)).toEqual([
      "language_matching",
      "consent_before_meeting",
      "respect_dnc",
      "polite_objection_handling",
    ]);
    const before = (await (await app.request("/preprod/gate?versionId=B")).json()) as Gate;
    expect(before.status).toBe("pending");

    const res = await app.request("/preprod/runs", post({ versionId: "B" }));
    expect(res.status).toBe(202);
    const { runId } = (await res.json()) as { runId: string };
    expect(((await waitRun(app, runId)) as { status: string }).status).toBe("done");
    const after = (await (await app.request("/preprod/gate?versionId=B")).json()) as Gate;
    expect(after.status).toBe("pass");
    expect(after.checks.every((c) => c.status === "pass")).toBe(true);
    const other = (await (await app.request("/preprod/gate?versionId=C")).json()) as Gate;
    expect(other.status).toBe("pending"); // per version
  });

  it("fails the gate with reasons when the judge flags a blocker scenario", async () => {
    const strict: AuditorPort = {
      audit: async (input) => ({
        model: "scripted",
        raw: {
          scores: { meetingFixed: 3, callDuration: 3, answerRate: 3, locationConfirmed: 3, callbackRequested: 3 },
          guardrails: input.guardrails.map((name) => ({
            name,
            passed: name !== "respect_dnc",
            reason: name === "respect_dnc" ? "bot kept pitching" : "ok",
          })),
        },
      }),
    };
    const app = makeApp({ auditor: strict });
    // fake judge is used by default (real=false), so inject the scripted one through realAuditor
    const strictApp = makeApp({ auditor: strict, realAuditor: strict });
    const { runId } = (await (
      await strictApp.request("/preprod/runs", post({ versionId: "A", scenarioIds: ["dnc-request", "consent-explicit"], real: true }))
    ).json()) as { runId: string };
    await waitRun(strictApp, runId);
    const gate = (await (await strictApp.request("/preprod/gate?versionId=A")).json()) as Gate;
    const dnc = gate.checks.find((c) => c.id === "respect_dnc");
    expect(dnc?.status).toBe("fail");
    expect(dnc?.reasons[0]).toContain("bot kept pitching");
    expect(gate.status).toBe("fail");
    void app;
  });

  it("guards real runs: needs the eve judge and at most 4 scenarios; validates ids", async () => {
    const app = makeApp(); // no realAuditor
    expect((await app.request("/preprod/runs", post({ versionId: "A", real: true }))).status).toBe(400);
    const withReal = makeApp({ realAuditor: createFakeAuditor() });
    expect((await withReal.request("/preprod/runs", post({ versionId: "A", real: true }))).status).toBe(400); // 8 scenarios > cap
    expect((await app.request("/preprod/runs", post({ versionId: "A", scenarioIds: ["nope"] }))).status).toBe(400);
    expect((await app.request("/preprod/runs", post({ versionId: "zzz" }))).status).toBe(404);
  });
});

describe("audits create calls", () => {
  it("adds a score-only call with a masked GLID after an audit completes", async () => {
    const app = makeApp();
    const turns = [{ speaker: "bot", text: "Namaste" }, { speaker: "seller", text: "Haan" }];
    const { auditId } = (await (
      await app.request("/audits", post({ version: "B", transcript: turns, durationSec: 20, glid: 1234567893 }))
    ).json()) as { auditId: string };
    await app.request(`/audits/${auditId}/events`); // wait for the stream to end
    const calls = (await (await app.request("/calls")).json()) as {
      items: { glidLast5: string; cohort: number; source: string; outcome?: unknown; scores: { overall: number } }[];
    };
    expect(calls.items).toHaveLength(1);
    expect(calls.items[0]).toMatchObject({ glidLast5: "67893", cohort: 3, source: "audit" });
    expect(calls.items[0]?.outcome).toBeUndefined();
    const board = (await (await app.request("/leaderboard")).json()) as { items: { version: string; calls: number }[] };
    expect(board.items.find((r) => r.version === "B")?.calls).toBe(1);
    const state = (await (await app.request("/autoscale/state")).json()) as { totals: { B: { trials: number } } };
    expect(state.totals.B.trials).toBe(0); // no autoscale evidence from audits
    const audit = JSON.stringify(await (await app.request(`/audits/${auditId}`)).json());
    expect(audit).not.toContain("1234567893"); // raw GLID never stored on the audit
  });
});

describe("voice sessions", () => {
  const voice: VoiceConfig = {
    orgId: "org1",
    workspaceId: "ws1",
    appIds: { A: "appA", B: "appB" },
    apiKey: "test-key",
    publicApiUrl: "http://localhost:8787",
  };

  it("returns non-secret config, and 503 when a version has no agent", async () => {
    const app = makeApp({ voice });
    const ok = (await (await app.request("/sessions", post({ versionId: "A" }))).json()) as Record<string, unknown>;
    expect(ok).toMatchObject({ orgId: "org1", workspaceId: "ws1", appId: "appA", baseUrl: "http://localhost:8787/sarvam/" });
    expect(JSON.stringify(ok)).not.toContain("test-key");
    expect((await app.request("/sessions", post({ versionId: "C" }))).status).toBe(503);
  });

  it("proxies the signed-url request with the server-side key and restricted query", async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const svc = createSessionService(voice, async (url, init) => {
      seen = { url, headers: init.headers };
      return new Response(JSON.stringify({ url: "wss://signed", reference_id: "r1" }), { status: 200 });
    });
    const r = await svc.proxySignedUrl("org1", "ws1", "appA", { interaction_type: "call", evil: "1", user_identifier: "u" });
    expect(r.status).toBe(200);
    expect(seen?.headers["X-API-Key"]).toBe("test-key");
    expect(seen?.url).toContain("/orgs/org1/workspaces/ws1/apps/appA/url?interaction_type=call&user_identifier=u");
    expect(seen?.url).not.toContain("evil");
    await expect(svc.proxySignedUrl("org1", "ws1", "other", {})).rejects.toThrow("Unknown");
    await expect(createSessionService({ ...voice, apiKey: undefined }).proxySignedUrl("org1", "ws1", "appA", {})).rejects.toThrow("not configured");
  });
});
