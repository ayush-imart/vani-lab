import type { PreprodGate, PreprodRun, PreprodScenario } from "../contract";
import { badRequest, notFound } from "../lib/errors";
import { newId, nowIso } from "../lib/http";
import { log } from "../lib/logger";
import type { Repos } from "../repos";
import { PREPROD } from "../spec";
import type { AuditorPort } from "./auditor";
import { verdictFor } from "./judge";
import {
  PREPROD_CHECKS,
  PREPROD_SCENARIOS,
  fixtureSimulator,
  type ScenarioSimulator,
} from "./preprod-scenarios";
import type { VersionService } from "./versions";

export const MAX_REAL_SCENARIOS = 4; // each real scenario is one LLM call
type Status = "pass" | "fail" | "pending";
type Result = PreprodRun["results"][number];

export type PreprodPorts = {
  fakeAuditor: AuditorPort; // default judge for tests and dev
  realAuditor: AuditorPort | undefined; // Eve judge, only when the server runs with AUDITOR=eve
  simulator?: ScenarioSimulator;
};

export function createPreprodService(repos: Repos, versions: VersionService, ports: PreprodPorts) {
  const simulator = ports.simulator ?? fixtureSimulator;
  const checkLabel = new Map(PREPROD_CHECKS.map((c) => [c.id, c]));

  async function evaluate(auditor: AuditorPort, versionId: string, s: PreprodScenario): Promise<Result> {
    const transcript = await simulator.simulate(versionId, s);
    const check = checkLabel.get(s.check);
    const { verdict, model } = await verdictFor(auditor, {
      version: "A", // judge input needs a slot; the scenario is scored independently of it
      transcript,
      durationSec: 60,
      answered: true,
      guardrails: [s.check],
      guardrailNotes: { [s.check]: check?.description ?? s.description },
    });
    const g = verdict.guardrails.find((x) => x.name === s.check);
    const passed = g?.passed ?? false;
    return {
      scenarioId: s.id,
      check: s.check,
      severity: s.severity,
      expected: s.expected,
      passed,
      ok: passed === (s.expected === "pass"),
      reason: g?.reason ?? "no verdict",
      model,
    };
  }

  async function execute(run: PreprodRun, scenarios: PreprodScenario[], auditor: AuditorPort) {
    try {
      const results: Result[] = [];
      for (const s of scenarios) results.push(await evaluate(auditor, run.versionId, s));
      await repos.preprod.save({ ...run, status: "done", results, completedAt: nowIso() });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pre-prod run failed";
      log.error("preprod run failed", { runId: run.id, error: message });
      await repos.preprod.save({ ...run, status: "error", error: message, completedAt: nowIso() });
    }
  }

  return {
    catalogue: () => ({ checks: PREPROD_CHECKS, scenarios: PREPROD_SCENARIOS }),

    async start(input: { versionId: string; scenarioIds?: string[] | undefined; real: boolean }): Promise<string> {
      await versions.get(input.versionId); // 404 for unknown versions
      const scenarios = input.scenarioIds
        ? input.scenarioIds.map((id) => {
            const found = PREPROD_SCENARIOS.find((s) => s.id === id);
            if (!found) throw badRequest(`Unknown scenario ${id}`);
            return found;
          })
        : PREPROD_SCENARIOS;
      if (input.real) {
        if (!ports.realAuditor) throw badRequest("Real runs need the server to run with AUDITOR=eve");
        if (scenarios.length > MAX_REAL_SCENARIOS) {
          throw badRequest(`Real runs are capped at ${MAX_REAL_SCENARIOS} scenarios (one LLM call each)`);
        }
      }
      const run: PreprodRun = {
        id: newId("pre"),
        versionId: input.versionId,
        status: "running",
        real: input.real,
        results: [],
        startedAt: nowIso(),
      };
      await repos.preprod.save(run);
      void execute(run, scenarios, input.real && ports.realAuditor ? ports.realAuditor : ports.fakeAuditor);
      return run.id;
    },

    async get(id: string): Promise<PreprodRun> {
      const run = await repos.preprod.get(id);
      if (!run) throw notFound("Pre-prod run");
      return run;
    },

    // Latest result per scenario across finished runs of this version.
    async gate(versionId: string): Promise<PreprodGate> {
      await versions.get(versionId);
      const runs = (await repos.preprod.list()).filter(
        (r) => r.versionId === versionId && r.status === "done",
      );
      const latest = new Map<string, Result>();
      runs.forEach((r) => r.results.forEach((res) => latest.set(res.scenarioId, res)));
      const checks = PREPROD_CHECKS.map((c) => {
        const scenarios = PREPROD_SCENARIOS.filter((s) => s.check === c.id).map((s) => {
          const res = latest.get(s.id);
          const status: Status = !res ? "pending" : res.ok ? "pass" : "fail";
          return { scenarioId: s.id, status, severity: s.severity, ...(res ? { reason: res.reason } : {}) };
        });
        const blocking = scenarios.filter(
          (s) => s.status === "fail" && (PREPROD.regressionZeroFailures || s.severity !== "minor"),
        );
        const status: Status =
          blocking.length > 0 ? "fail" : scenarios.some((s) => s.status === "pending") ? "pending" : "pass";
        return {
          id: c.id,
          label: c.label,
          status,
          reasons: scenarios.filter((s) => s.status === "fail" && s.reason).map((s) => `${s.scenarioId}: ${s.reason}`),
          scenarios,
        };
      });
      const status: Status = checks.some((c) => c.status === "fail")
        ? "fail"
        : checks.some((c) => c.status === "pending")
          ? "pending"
          : "pass";
      const lastRun = runs.at(-1);
      return { versionId, status, ...(lastRun ? { lastRunId: lastRun.id } : {}), checks };
    },
  };
}
export type PreprodService = ReturnType<typeof createPreprodService>;
