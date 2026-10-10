// A/B + rollout simulator on synthetic paired calls. Runs the real engine (evidence + policy +
// decision log) against a throwaway in-memory store, so it never touches /metrics or live runs.
// Every result is labelled simulated: it demonstrates the method, it is not evidence about a prompt.
import type { RolloutDecisionDto, SimulationRequest } from "../contract";
import { createRng } from "../lib/rng";
import { createMemoryRepos } from "../repos";
import { PRIMARIES, type PrimaryId } from "../spec";
import { armFor } from "./assignment";
import type { ExperimentService } from "./experiments";
import type { NotificationService } from "./notifications";
import { createRolloutService } from "./rollouts";
import { baselineProfile, drawCall, withPrimaryRate } from "./sim-calls";
import type { VersionService } from "./versions";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const BAD_VARIANT_DEFAULT_PCT = 3.3;
const SIM_EXPERIMENT = "sim_experiment";

export async function runSimulation(req: SimulationRequest) {
  const primary: PrimaryId = req.primary ?? "meetingFixed";
  const baselinePct = req.baselinePct ?? PRIMARIES[primary].baselinePct;
  const treatmentPct =
    req.scenario === "bad_variant"
      ? req.badVariantPct ?? BAD_VARIANT_DEFAULT_PCT
      : req.scenario === "no_difference"
        ? baselinePct
        : baselinePct + (req.trueLiftPts ?? 5);

  const repos = createMemoryRepos();
  const experiment = {
    id: SIM_EXPERIMENT, name: "Simulation", goal: "synthetic", primaryMetric: primary, guardrails: [],
    baselineVersionId: "v_control", challengerVersionId: "v_challenger", status: "draft" as const, createdAt: new Date(0).toISOString(),
  };
  await repos.experiments.save(experiment);
  const experiments = { get: async () => (await repos.experiments.get(SIM_EXPERIMENT)) ?? experiment } as unknown as ExperimentService;
  const versions = {
    get: async (id: string) => ({ id, slot: id === "v_control" ? req.controlSlot : req.challengerSlot }),
  } as unknown as VersionService;
  const notifications = { notify: async () => ({}) } as unknown as NotificationService;
  // Synthetic runs model a challenger that already passed pre-prod.
  const preprod = { gate: async (versionId: string) => ({ versionId, status: "pass" as const, checks: [] }) };
  const svc = createRolloutService(repos, experiments, versions, notifications, preprod);

  const t0 = Date.UTC(2026, 9, 1);
  const rng = createRng(req.seed);
  const controlProfile = withPrimaryRate(baselineProfile(), primary, baselinePct);
  const treatmentProfile = withPrimaryRate(baselineProfile(), primary, treatmentPct);
  await svc.start(SIM_EXPERIMENT, { primary }, t0);

  const steps = Math.floor((req.days * 24) / req.evaluateEveryHours);
  const callsPerStep = Math.round((req.callsPerDay * req.evaluateEveryHours) / 24);
  const timeline: { at: string; stage: number; action: string; trigger: string; liftPts: number | null; lambdaBenefit: number; lambdaHarm: number; reason: string }[] = [];
  let counter = 0;
  let last: RolloutDecisionDto | undefined;

  for (let step = 1; step <= steps; step++) {
    const now = t0 + step * req.evaluateEveryHours * HOUR_MS;
    const run = (await svc.state(SIM_EXPERIMENT, now)).run;
    if (run.status !== "running") break;
    for (let i = 0; i < callsPerStep; i++) {
      const bucket = counter++ % 10;
      const treated = armFor(bucket, run.stagePct) === "treatment";
      const drawn = drawCall(rng, treated ? treatmentProfile : controlProfile);
      await repos.calls.add({
        id: `sim_${counter}`, glidLast5: String(bucket).padStart(5, "0"), cohort: bucket % 10,
        version: treated ? req.challengerSlot : req.controlSlot, at: now, durationSec: drawn.durationSec,
        outcome: drawn.outcome, evaluator: drawn.evaluator, channel: "text", source: "simulated", bucket,
        experimentId: SIM_EXPERIMENT, stage: run.stagePct,
      });
    }
    last = await svc.tick(SIM_EXPERIMENT, now);
    if (last.trigger === "awaiting_pm_approval" && req.approveAtFinalGate) {
      await svc.approve(SIM_EXPERIMENT, now);
      last = await svc.tick(SIM_EXPERIMENT, now);
    }
    if (last.action !== "hold") {
      timeline.push({
        at: last.at, stage: last.toStage, action: last.action, trigger: last.trigger, liftPts: last.liftPts,
        lambdaBenefit: last.peakLambdaBenefit, lambdaHarm: last.peakLambdaHarm, reason: last.reason,
      });
    }
  }
  const report = await svc.report(SIM_EXPERIMENT, t0 + req.days * DAY_MS);
  return {
    simulated: true as const,
    notice: "Synthetic paired calls drawn from PS07 baseline rates; demonstrates the engine, not a real prompt.",
    scenario: req.scenario,
    truth: { controlPct: baselinePct, treatmentPct },
    timeline,
    finalStatus: report.run.status,
    finalStagePct: report.run.stagePct,
    verdict: report.verdict,
    report,
  };
}
