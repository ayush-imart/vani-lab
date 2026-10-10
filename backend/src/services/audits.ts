import type { AuditEvent, AuditRecord, AuditRequest, KpiScores } from "../contract";
import { log } from "../lib/logger";
import { notFound } from "../lib/errors";
import { newId, nowIso } from "../lib/http";
import type { Repos } from "../repos";
import type { AuditorPort } from "./auditor";
import { verdictFor } from "./judge";
import { overallFor, type RubricService } from "./rubric";

type Hub = {
  events: AuditEvent[];
  listeners: Set<(e: AuditEvent) => void>;
  terminal: boolean;
  cancelled: boolean;
};
type StageName = Extract<AuditEvent, { type: "stage" }>["stage"];

// onCompleted receives the finished audit plus the request GLID (never persisted on the audit).
export type AuditCompleted = (audit: AuditRecord, glid?: number | string) => Promise<unknown>;

export function createAuditService(
  repos: Repos,
  auditor: AuditorPort,
  rubricSvc: RubricService,
  onCompleted?: AuditCompleted,
) {
  const hubs = new Map<string, Hub>();

  function emit(id: string, event: AuditEvent): void {
    const hub = hubs.get(id);
    if (!hub) return;
    hub.events.push(event);
    if (event.type !== "stage") hub.terminal = true;
    hub.listeners.forEach((l) => l(event));
  }
  const stage = (id: string, s: StageName, status: "running" | "done") =>
    emit(id, { type: "stage", stage: s, status });

  async function run(id: string, req: AuditRequest, answered: boolean): Promise<void> {
    const hub = hubs.get(id);
    if (!hub) return;
    try {
      stage(id, "transcript", "running");
      stage(id, "transcript", "done");
      stage(id, "guardrails", "running");
      stage(id, "kpis", "running");
      const rubric = await rubricSvc.get();
      const { verdict, model } = await verdictFor(auditor, {
        version: req.version,
        transcript: req.transcript,
        durationSec: req.durationSec,
        answered,
        guardrails: rubric.guardrails,
        requireKpiBreakdown: true,
      });
      if (hub.cancelled) return;
      stage(id, "guardrails", "done");
      stage(id, "kpis", "done");
      stage(id, "overall", "running");
      const kpis: KpiScores = verdict.scores;
      const overall = overallFor(kpis, rubric);
      const guardrailsPassed = verdict.guardrails.every((g) => g.passed);
      stage(id, "overall", "done");
      stage(id, "saved", "running");
      const existing = await repos.audits.get(id);
      if (!existing || hub.cancelled) return;
      const finished: AuditRecord = {
        ...existing,
        status: "done",
        kpis,
        ...(verdict.breakdown ? { kpiBreakdown: verdict.breakdown } : {}),
        weights: rubric.weights,
        overall,
        guardrails: verdict.guardrails,
        guardrailsPassed,
        ...(verdict.notes ? { notes: verdict.notes } : {}),
        model,
        completedAt: nowIso(),
      };
      await repos.audits.save(finished);
      try {
        await onCompleted?.(finished, req.glid);
      } catch (err) {
        log.error("audit follow-up failed", { auditId: id, error: err instanceof Error ? err.message : "unknown" });
      }
      stage(id, "saved", "done");
      emit(id, {
        type: "result",
        overall,
        kpis,
        guardrailsPassed,
        ...(verdict.breakdown ? { kpiBreakdown: verdict.breakdown } : {}),
        weights: rubric.weights,
        guardrails: verdict.guardrails,
        ...(verdict.notes ? { notes: verdict.notes } : {}),
      });
    } catch (err) {
      if (hub.cancelled) return;
      const detail = err instanceof Error ? err.message : "unknown error";
      const message = "The audit could not be completed. Please retry.";
      log.error("audit failed", { auditId: id, error: detail });
      const existing = await repos.audits.get(id);
      if (existing) {
        await repos.audits.save({ ...existing, status: "error", error: message, completedAt: nowIso() });
      }
      emit(id, { type: "error", message });
    }
  }

  function replay(audit: AuditRecord): AuditEvent[] {
    const stages: StageName[] = ["transcript", "guardrails", "kpis", "overall", "saved"];
    if (audit.status === "done" && audit.kpis && audit.overall !== undefined) {
      const stageEvents = stages.flatMap(
        (s): AuditEvent[] => [
          { type: "stage", stage: s, status: "running" },
          { type: "stage", stage: s, status: "done" },
        ],
      );
      return [
        ...stageEvents,
        {
          type: "result",
          overall: audit.overall,
          kpis: audit.kpis,
          guardrailsPassed: audit.guardrailsPassed ?? false,
          ...(audit.kpiBreakdown ? { kpiBreakdown: audit.kpiBreakdown } : {}),
          ...(audit.weights ? { weights: audit.weights } : {}),
          ...(audit.guardrails ? { guardrails: audit.guardrails } : {}),
          ...(audit.notes ? { notes: audit.notes } : {}),
        },
      ];
    }
    return [{ type: "error", message: audit.error ?? audit.status }];
  }

  async function get(id: string): Promise<AuditRecord> {
    const audit = await repos.audits.get(id);
    if (!audit) throw notFound("Audit");
    return audit;
  }

  return {
    get,

    async start(req: AuditRequest): Promise<string> {
      const id = newId("aud");
      const answered = req.answered ?? true;
      await repos.audits.save({
        id,
        version: req.version,
        status: "running",
        transcript: req.transcript,
        durationSec: req.durationSec,
        answered,
        createdAt: nowIso(),
      });
      hubs.set(id, { events: [], listeners: new Set(), terminal: false, cancelled: false });
      void run(id, req, answered);
      return id;
    },

    async list(filter: {
      version?: string | undefined;
      status?: string | undefined;
      guardrailsPassed?: "true" | "false" | undefined;
      limit: number;
    }): Promise<AuditRecord[]> {
      const all = await repos.audits.list();
      return all
        .filter((a) => !filter.version || a.version === filter.version)
        .filter((a) => !filter.status || a.status === filter.status)
        .filter(
          (a) =>
            !filter.guardrailsPassed || String(a.guardrailsPassed ?? "") === filter.guardrailsPassed,
        )
        .reverse()
        .slice(0, filter.limit);
    },

    async cancel(id: string): Promise<{ id: string; status: AuditRecord["status"] }> {
      const audit = await get(id);
      const hub = hubs.get(id);
      if (audit.status !== "running" || !hub) return { id, status: audit.status };
      hub.cancelled = true;
      await repos.audits.save({ ...audit, status: "cancelled", completedAt: nowIso() });
      emit(id, { type: "error", message: "cancelled" });
      return { id, status: "cancelled" };
    },

    // Replays past events then streams new ones; returns an unsubscribe function.
    async subscribe(
      id: string,
      onEvent: (e: AuditEvent) => void,
      onEnd: () => void,
    ): Promise<() => void> {
      const audit = await get(id);
      const hub = hubs.get(id);
      if (!hub) {
        replay(audit).forEach(onEvent);
        onEnd();
        return () => undefined;
      }
      hub.events.forEach(onEvent);
      if (hub.terminal) {
        onEnd();
        return () => undefined;
      }
      const listener = (e: AuditEvent) => {
        onEvent(e);
        if (e.type !== "stage") onEnd();
      };
      hub.listeners.add(listener);
      return () => void hub.listeners.delete(listener);
    },
  };
}
export type AuditService = ReturnType<typeof createAuditService>;
