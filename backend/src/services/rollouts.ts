// Rollout orchestration (PM spec): start / tick / approve / rollback / stop / report for one run per
// experiment. The statistics live in rollout-evidence.ts and the decision rules in rollout-policy.ts;
// this layer only loads state, applies the policy's decision and writes the auditable decision log.
import type { CallRecord, Notification, RolloutDecisionDto, RolloutEvidenceDto, RolloutRunDto, RolloutStart } from "../contract";
import { badRequest, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/http";
import type { Repos } from "../repos";
import type { RolloutRunDoc } from "../repos/rollouts";
import { STATS, resolvePmSettings, type PmSettings } from "../spec";
import { armFor, bucketOf } from "./assignment";
import type { NotificationService } from "./notifications";
import { buildEvidence } from "./rollout-evidence";
import { decide, nextGateText, rampStages, type PolicyDecision, type PolicyRun } from "./rollout-policy";
import type { ExperimentService } from "./experiments";
import type { VersionService } from "./versions";

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string) => Date.parse(s);

const toPolicyRun = (r: RolloutRunDoc): PolicyRun => ({
  status: r.status,
  phase: r.phase,
  stagePct: r.stagePct,
  stages: r.stages,
  startedAtMs: ms(r.startedAt),
  stageEnteredAtMs: ms(r.stageEnteredAt),
  lastChangeAtMs: ms(r.lastChangeAt),
  windowEndMs: r.windowEnd ? ms(r.windowEnd) : null,
  pmApproved: r.pmApproved,
  settings: r.settings,
  watchSince: r.watchSince,
  holdback: r.holdback
    ? { startedAtMs: ms(r.holdback.startedAt), liftAtPromotionPts: r.holdback.liftAtPromotionPts, alerted: r.holdback.alerted }
    : null,
});

const traffic = (treatmentPct: number) => ({ control: 100 - treatmentPct, treatment: treatmentPct });

export function createRolloutService(
  repos: Repos,
  experiments: ExperimentService,
  versions: VersionService,
  notifications: NotificationService,
) {
  let lock: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = lock.then(fn, fn);
    lock = next.catch(() => undefined);
    return next;
  };

  const getRun = async (experimentId: string): Promise<RolloutRunDoc> => {
    const run = await repos.rollouts.getRun(experimentId);
    if (!run) throw notFound("Rollout run");
    return run;
  };

  const evidenceOf = async (run: RolloutRunDoc, now: number) => {
    const calls = await repos.calls.list();
    return buildEvidence(
      calls,
      {
        experimentId: run.experimentId,
        primary: run.primary,
        channel: run.channel,
        challengerSlot: run.challengerSlot,
        controlSlot: run.controlSlot,
        settings: run.settings,
        holdbackStage: run.phase === "holdback" ? run.stagePct : null,
        peaks: run.peaks,
        watchSince: run.watchSince,
      },
      now,
    );
  };

  const setExperimentStatus = async (experimentId: string, status: RolloutRunDto["status"], windowStart?: string, windowEnd?: string) => {
    const exp = await experiments.get(experimentId);
    await repos.experiments.save({
      ...exp,
      status,
      ...(windowStart ? { windowStart } : {}),
      ...(windowEnd ? { windowEnd } : {}),
    });
  };

  const record = async (
    run: RolloutRunDoc,
    evidence: RolloutEvidenceDto,
    d: Pick<RolloutDecisionDto, "action" | "trigger" | "reason"> & { actor: "engine" | "pm"; toStagePct: number; toPhase: RolloutRunDto["phase"] },
    now: number,
    fromStage: number,
  ): Promise<RolloutDecisionDto> => {
    const decision: RolloutDecisionDto = {
      id: newId("dec"),
      experimentId: run.experimentId,
      at: iso(now),
      actor: d.actor,
      action: d.action,
      trigger: d.trigger,
      reason: d.reason,
      phase: d.toPhase,
      stage: fromStage,
      fromStage,
      toStage: d.toStagePct,
      trafficBefore: traffic(fromStage),
      trafficAfter: traffic(d.toStagePct),
      lambdaBenefit: evidence.primary.lambdaBenefit,
      lambdaHarm: evidence.primary.lambdaHarm,
      peakLambdaBenefit: evidence.primary.peakLambdaBenefit,
      peakLambdaHarm: evidence.primary.peakLambdaHarm,
      liftPts: evidence.primary.liftPts,
      guardrailStatus: Object.fromEntries(evidence.guardrails.map((g) => [g.id, g.status])),
      srmPValue: evidence.validity.srm.pValue,
      coverage: evidence.validity.coverage.share,
      method: evidence.primary.method,
      evidence,
    };
    await repos.rollouts.addDecision(decision);
    return decision;
  };

  const notifyIf = async (run: RolloutRunDoc, d: PolicyDecision) => {
    const kinds: Partial<Record<PolicyDecision["action"], Notification["kind"]>> = {
      rollback: "rollback", pause: "pause", alert: "alert", end: "scale-down", step_down: "scale-down",
      advance: "scale-up", promote: "scale-up", complete: "scale-up",
    };
    const kind = kinds[d.action];
    if (!kind) return;
    await notifications.notify({
      kind,
      title: `Experiment ${run.experimentId}: ${d.action.replace("_", " ")}`,
      body: d.reason,
      version: run.challengerSlot as "A" | "B" | "C",
    });
  };

  const applyDecision = async (run: RolloutRunDoc, d: PolicyDecision, now: number): Promise<RolloutRunDoc> => {
    const changedStage = d.toStagePct !== run.stagePct || d.toPhase !== run.phase;
    const next: RolloutRunDoc = {
      ...run,
      status: d.toStatus,
      phase: d.toPhase,
      stagePct: d.toStagePct,
      traffic: traffic(d.toStagePct),
      frozen: d.freeze ?? (d.toStatus === "paused" ? true : run.frozen),
      ...(d.verdict ? { verdict: d.verdict } : {}),
      stageEnteredAt: changedStage ? iso(now) : run.stageEnteredAt,
      lastChangeAt: changedStage || d.toStatus !== run.status ? iso(now) : run.lastChangeAt,
      ...(d.toStatus === "completed" || d.toStatus === "rolled_back" || d.toStatus === "ended" ? { endedAt: iso(now) } : {}),
      ...(d.action === "promote" && d.toPhase === "holdback"
        ? { holdback: { startedAt: iso(now), liftAtPromotionPts: d.liftAtPromotionPts ?? null, alerted: false } }
        : {}),
      ...(d.action === "alert" && run.holdback ? { holdback: { ...run.holdback, alerted: true } } : {}),
    };
    return next;
  };

  return {
    // Serialised with tick/approve/rollback so two concurrent starts cannot both pass the 409 check.
    start(experimentId: string, input: RolloutStart, nowMs: number = Date.now()): Promise<RolloutRunDto> {
      return exclusive(async () => {
      const exp = await experiments.get(experimentId);
      if (await repos.rollouts.getRun(experimentId)) throw conflict("This experiment already has a rollout run");
      const { windowStart, windowEnd, channel, ...pm } = input;
      const { settings, violations } = resolvePmSettings({ ...(Object.fromEntries(Object.entries(pm).filter(([, v]) => v !== undefined)) as Partial<PmSettings>), primary: pm.primary ?? primaryFrom(exp.primaryMetric) });
      if (violations.length > 0) throw badRequest("Settings violate the PM spec bounds", violations);
      const slots = await slotsOf(versions, exp.baselineVersionId, exp.challengerVersionId);
      const startMs = windowStart ? ms(windowStart) : nowMs;
      if (Number.isNaN(startMs)) throw badRequest("windowStart is not a valid date");
      const scheduled = startMs > nowMs;
      const stages = rampStages(settings.startPct);
      const startIso = iso(startMs);
      const run: RolloutRunDoc = {
        id: experimentId,
        experimentId,
        status: scheduled ? "scheduled" : "running",
        phase: "ramp",
        primary: settings.primary,
        channel: channel ?? "text",
        controlSlot: slots.control,
        challengerSlot: slots.challenger,
        settings,
        stages,
        stagePct: settings.startPct,
        traffic: traffic(settings.startPct),
        frozen: false,
        pmApproved: false,
        preprodGate: "simulated",
        simulated: false,
        windowStart: startIso,
        ...(windowEnd ? { windowEnd } : {}),
        startedAt: startIso,
        stageEnteredAt: startIso,
        lastChangeAt: startIso,
        peaks: {},
        watchSince: {},
      };
      await repos.rollouts.saveRun(run);
      await setExperimentStatus(experimentId, run.status, startIso, windowEnd);
      const { evidence } = await evidenceOf(run, nowMs);
      await record(run, evidence, { actor: "engine", action: "start", trigger: "started", reason: `Started at ${settings.startPct}% on ${run.primary}`, toStagePct: run.stagePct, toPhase: "ramp" }, nowMs, run.stagePct);
      return stripDoc(run);
      });
    },

    async state(experimentId: string, nowMs: number = Date.now()) {
      const run = await getRun(experimentId);
      const { evidence } = await evidenceOf(run, nowMs);
      return { run: stripDoc(run), evidence, nextGate: nextGateText(toPolicyRun(run), evidence) };
    },

    // One engine evaluation: load evidence, ask the policy, apply and log the decision.
    tick(experimentId: string, nowMs: number = Date.now()): Promise<RolloutDecisionDto> {
      return exclusive(async () => {
        let run = await getRun(experimentId);
        if (run.status === "scheduled" && nowMs >= ms(run.windowStart)) {
          run = await repos.rollouts.saveRun({ ...run, status: "running" });
          await setExperimentStatus(experimentId, "running");
        }
        const built = await evidenceOf(run, nowMs);
        run = { ...run, peaks: built.peaks, watchSince: built.watchSince };
        const decision = decide(toPolicyRun(run), built.evidence, nowMs);
        const next = await applyDecision(run, decision, nowMs);
        await repos.rollouts.saveRun(next);
        if (next.status !== run.status) await setExperimentStatus(experimentId, next.status);
        const logged = await record(next, built.evidence, { ...decision, actor: "engine" }, nowMs, run.stagePct);
        if (decision.action !== "hold") await notifyIf(next, decision);
        return logged;
      });
    },

    approve(experimentId: string, nowMs: number = Date.now()): Promise<RolloutRunDto> {
      return exclusive(async () => {
        const run = await getRun(experimentId);
        if (run.status !== "running") throw conflict(`Run is ${run.status}; nothing to approve`);
        const next = await repos.rollouts.saveRun({ ...run, pmApproved: true });
        const { evidence } = await evidenceOf(next, nowMs);
        await record(next, evidence, { actor: "pm", action: "approve", trigger: "pm_approval", reason: "PM approved the 50% to 100% step", toStagePct: next.stagePct, toPhase: next.phase }, nowMs, next.stagePct);
        return stripDoc(next);
      });
    },

    rollback(experimentId: string, nowMs: number = Date.now()): Promise<RolloutRunDto> {
      return manual(experimentId, nowMs, "rollback", "pm_rollback", "PM rolled the challenger back to 0%", "rolled_back", "rolled_back_manually");
    },
    stop(experimentId: string, nowMs: number = Date.now()): Promise<RolloutRunDto> {
      return manual(experimentId, nowMs, "end", "pm_stop", "PM stopped the test; control kept", "ended", "inconclusive");
    },

    async decisions(experimentId: string): Promise<RolloutDecisionDto[]> {
      await getRun(experimentId);
      return repos.rollouts.listDecisions(experimentId);
    },

    async report(experimentId: string, nowMs: number = Date.now()) {
      const run = await getRun(experimentId);
      const { evidence } = await evidenceOf(run, nowMs);
      const decisions = await repos.rollouts.listDecisions(experimentId);
      const hb = evidence.holdback?.liftPts ?? null;
      const stopping = evidence.primary.liftPts;
      return {
        run: stripDoc(run),
        method: {
          name: evidence.primary.method,
          alpha: STATS.alpha,
          tau: evidence.primary.tau,
          notes: ["Early stopping inflates the measured win; impact is reported from the holdback lift when one exists.", ...evidence.primary.assumptions],
        },
        evidence,
        decisions,
        impact:
          hb !== null
            ? { basis: "holdback_lift" as const, liftPts: hb, note: "Measured against the 5% holdback on the old prompt (unbiased by early stopping)." }
            : stopping !== null
              ? { basis: "stopping_lift" as const, liftPts: stopping, note: "Measured at the stopping point; likely overstated (winner's curse). Confirm with a holdback." }
              : { basis: "none" as const, liftPts: null, note: "Not enough judged calls yet." },
        verdict: run.verdict ?? null,
        generatedAt: iso(nowMs),
      };
    },

    // Deterministic arm for a seller: last two GLID digits against the stage in force.
    async assign(experimentId: string, glid: string) {
      const run = await getRun(experimentId);
      const bucket = bucketOf(glid);
      const treat = armFor(bucket, run.status === "running" || run.status === "paused" || run.status === "completed" ? run.stagePct : 0) === "treatment";
      return { experimentId, bucket, arm: treat ? "treatment" : "control", slot: treat ? run.challengerSlot : run.controlSlot, stagePct: run.stagePct };
    },

    async listRuns(): Promise<RolloutRunDto[]> {
      return (await repos.rollouts.listRuns()).map(stripDoc);
    },
  };

  function manual(
    experimentId: string,
    nowMs: number,
    action: "rollback" | "end",
    trigger: "pm_rollback" | "pm_stop",
    reason: string,
    status: "rolled_back" | "ended",
    verdict: "rolled_back_manually" | "inconclusive",
  ): Promise<RolloutRunDto> {
    return exclusive(async () => {
      const run = await getRun(experimentId);
      if (run.status === "completed" || run.status === "rolled_back" || run.status === "ended") throw conflict(`Run already ${run.status}`);
      const { evidence } = await evidenceOf(run, nowMs);
      const next = await repos.rollouts.saveRun({
        ...run, status, phase: "done", stagePct: 0, traffic: traffic(0), verdict, endedAt: iso(nowMs), lastChangeAt: iso(nowMs),
      });
      await setExperimentStatus(experimentId, status);
      await record(next, evidence, { actor: "pm", action, trigger, reason, toStagePct: 0, toPhase: "done" }, nowMs, run.stagePct);
      await notifications.notify({ kind: "rollback", title: `Experiment ${experimentId}: ${action}`, body: reason, version: run.challengerSlot as "A" | "B" | "C" });
      return stripDoc(next);
    });
  }
}
export type RolloutService = ReturnType<typeof createRolloutService>;

const stripDoc = ({ peaks: _p, watchSince: _w, ...run }: RolloutRunDoc): RolloutRunDto => run;

const primaryFrom = (m: string) =>
  (["meetingFixed", "positiveOutcome", "conversationReach", "callbackFixed"] as const).find((p) => p === m) ?? "meetingFixed";

async function slotsOf(versions: VersionService, baselineId: string, challengerId: string) {
  const [b, c] = await Promise.all([versions.get(baselineId), versions.get(challengerId)]);
  if (!b.slot || !c.slot) throw badRequest("Both versions must hold a live traffic slot (A, B or C) to run a rollout");
  return { control: b.slot, challenger: c.slot };
}

export type { CallRecord };
