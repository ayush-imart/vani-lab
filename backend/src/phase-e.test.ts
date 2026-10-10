// Phase E: experiment risk appetite + start size, version library edits, scoped notifications.
import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { setLogSilent } from "./lib/logger";
import { createMemoryRepos } from "./repos";
import { buildServices } from "./registry";
import { createFakeAuditor } from "./services/auditor";
import { listRiskPresets, riskPresetOverride } from "./services/risk-presets";
import { resolvePmSettings } from "./spec";

beforeAll(() => setLogSilent(true));

function setup() {
  const services = buildServices(createMemoryRepos(), { auditor: createFakeAuditor() });
  return { app: buildApp(services, ["http://localhost:5173"]), services };
}
const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const responseJson = async <T>(response: Response): Promise<T> => (await response.json()) as T;
const exp = (extra: Record<string, unknown> = {}) => ({
  name: "Shorter opening",
  goal: "Lift meetings",
  primaryMetric: "meetingFixed",
  baselineVersionId: "A",
  challengerVersionId: "B",
  ...extra,
});

describe("risk presets", () => {
  it("every preset resolves with zero spec violations (stricter only)", () => {
    for (const p of listRiskPresets()) expect(p.violations).toEqual([]);
  });
  it("standard is exactly the spec defaults apart from the chosen start size", () => {
    const { settings } = resolvePmSettings(riskPresetOverride("standard", 10));
    expect(settings).toEqual(resolvePmSettings({}).settings);
  });
  it("cautious is stricter than standard", () => {
    const c = resolvePmSettings(riskPresetOverride("cautious", 5)).settings;
    const s = resolvePmSettings({}).settings;
    expect(c.minStageHours).toBeGreaterThan(s.minStageHours);
    expect(c.moderateGateMinLambda).toBeGreaterThan(s.moderateGateMinLambda);
    expect(c.startPct).toBe(5);
  });
});

describe("experiments with risk appetite", () => {
  it("defaults to standard at 10% and stores the chosen preset", async () => {
    const { app } = setup();
    const a = await (await app.request("/experiments", send("POST", exp()))).json();
    expect(a).toMatchObject({ riskAppetite: "standard", startPct: 10 });
    const b = await responseJson<{ id: string }>(
      await app.request("/experiments", send("POST", exp({ riskAppetite: "cautious", startPct: 5 }))),
    );
    const s = await (await app.request(`/experiments/${b.id}/start-settings`)).json();
    expect(s).toMatchObject({ startPct: 5, minStageHours: 48 });
  });
  it("rejects a start size outside the spec's 5-25%", async () => {
    const { app } = setup();
    expect((await app.request("/experiments", send("POST", exp({ startPct: 40 })))).status).toBe(400);
  });
  it("lists the presets", async () => {
    const { app } = setup();
    const body = await responseJson<{ items: Array<{ id: string }> }>(await app.request("/experiments/risk-presets"));
    expect(body.items.map((p: { id: string }) => p.id).sort()).toEqual(["cautious", "standard"]);
  });
});

describe("version library", () => {
  const create = { label: "Draft", promptText: "Hello", changelog: "new" };
  it("renames and deletes an unused version", async () => {
    const { app } = setup();
    const v = await responseJson<{ id: string }>(await app.request("/versions", send("POST", create)));
    const r = await app.request(`/versions/${v.id}`, send("PATCH", { label: "Renamed" }));
    expect((await responseJson<{ label: string }>(r)).label).toBe("Renamed");
    expect((await app.request(`/versions/${v.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await app.request(`/versions/${v.id}`)).status).toBe(404);
  });
  it("refuses to delete slot versions or versions used by an experiment", async () => {
    const { app } = setup();
    expect((await app.request("/versions/A", { method: "DELETE" })).status).toBe(409);
    const v = await responseJson<{ id: string }>(await app.request("/versions", send("POST", create)));
    await app.request("/experiments", send("POST", exp({ challengerVersionId: v.id })));
    expect((await app.request(`/versions/${v.id}`, { method: "DELETE" })).status).toBe(409);
  });
});

describe("notifications scoped by experiment", () => {
  it("filters by experimentId when given, unchanged otherwise", async () => {
    const { app, services } = setup();
    await services.notifications.notify({ kind: "info", title: "x", body: "1", experimentId: "exp_1" });
    await services.notifications.notify({ kind: "info", title: "y", body: "2" });
    const all = await responseJson<{ items: unknown[] }>(await app.request("/notifications"));
    const scoped = await responseJson<{ items: Array<{ title: string }> }>(
      await app.request("/notifications?experimentId=exp_1"),
    );
    expect(all.items).toHaveLength(2);
    expect(scoped.items.map((n) => n.title)).toEqual(["x"]);
  });
});
