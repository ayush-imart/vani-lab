// Boundary for the call audit. The real auditor is an Eve agent powered by Sarvam behind the team's
// backend; this module simulates it with timers so the UI can be built now. See
// app/frontend_rework_progress/BACKEND_NEEDS.md for the assumed contract.
import { api, apiUrl } from "@/lib/api";
import { auditCreatedSchema, auditEventSchema } from "@/lib/api-contract";
import type { VersionId } from "./performance-data";

export type AuditStageId = "transcript" | "guardrails" | "kpis" | "overall" | "saved";
export const AUDIT_STAGES: { id: AuditStageId; label: string }[] = [
  { id: "transcript", label: "Transcript captured" },
  { id: "guardrails", label: "Guardrail checks" },
  { id: "kpis", label: "KPI scoring" },
  { id: "overall", label: "Overall score" },
  { id: "saved", label: "Saved" },
];

export type CallTurn = { speaker: "bot" | "seller"; text: string };
export type AuditRequest = {
  version: VersionId;
  transcript: CallTurn[];
  durationSec: number;
  answered?: boolean;
};
export type AuditProgressEvent =
  | { type: "stage"; stage: AuditStageId; status: "running" | "done" }
  | { type: "result"; overall: number; kpis: Record<string, number>; guardrailsPassed: boolean }
  | { type: "error"; message: string };
export type AuditHandle = { auditId: string; cancel: () => void };

export interface AuditClient {
  // Starts an audit; events are pushed in order. Real client: POST /audits then SSE /audits/{id}/events.
  submit(request: AuditRequest, onEvent: (event: AuditProgressEvent) => void): AuditHandle;
}

const STAGE_MS = 900;

export function createSimulatedAuditClient(stageMs = STAGE_MS): AuditClient {
  return {
    submit(request, onEvent) {
      const timers: ReturnType<typeof setTimeout>[] = [];
      let at = 0;
      const turns = request.transcript.length;
      AUDIT_STAGES.forEach((s) => {
        timers.push(
          setTimeout(() => onEvent({ type: "stage", stage: s.id, status: "running" }), at),
        );
        at += stageMs;
        timers.push(setTimeout(() => onEvent({ type: "stage", stage: s.id, status: "done" }), at));
      });
      timers.push(
        setTimeout(
          () =>
            onEvent({
              type: "result",
              overall: Math.min(5, 3 + Math.min(turns, 10) / 5),
              kpis: { meetingFixed: 4, callDuration: 4, locationConfirmed: 3 },
              guardrailsPassed: true,
            }),
          at,
        ),
      );
      return {
        auditId: `sim-${request.version}-${turns}`,
        cancel: () => timers.forEach(clearTimeout),
      };
    },
  };
}

// Real backend audit (Eve agent): POST /audits, then follow the SSE stream. If the backend cannot be
// reached the synthetic client runs instead, so the call window always works.
export function createApiAuditClient(fallback: AuditClient): AuditClient {
  return {
    submit(request, onEvent) {
      let cancelled = false;
      let auditId = "pending";
      let stream: EventSource | null = null;
      let inner: AuditHandle | null = null;
      const fall = () => {
        if (!cancelled && !inner) inner = fallback.submit(request, onEvent);
      };

      api("/audits", { method: "POST", body: request, schema: auditCreatedSchema })
        .then((created) => {
          auditId = created.auditId;
          if (cancelled) {
            void api(`/audits/${auditId}`, { method: "DELETE" }).catch(() => undefined);
            return;
          }
          let finished = false;
          stream = new EventSource(apiUrl(`/audits/${auditId}/events`));
          stream.onmessage = (message: MessageEvent<string>) => {
            const parsed = auditEventSchema.safeParse(JSON.parse(message.data));
            if (!parsed.success) return;
            onEvent(parsed.data as AuditProgressEvent);
            if (parsed.data.type !== "stage") {
              finished = true;
              stream?.close();
            }
          };
          stream.onerror = () => {
            stream?.close();
            if (!finished) onEvent({ type: "error", message: "Lost connection to the auditor" });
          };
        })
        .catch(fall);

      return {
        get auditId() {
          return inner?.auditId ?? auditId;
        },
        cancel: () => {
          cancelled = true;
          stream?.close();
          inner?.cancel();
          if (auditId !== "pending") {
            void api(`/audits/${auditId}`, { method: "DELETE" }).catch(() => undefined);
          }
        },
      };
    },
  };
}

export const auditClient: AuditClient = createApiAuditClient(createSimulatedAuditClient());
