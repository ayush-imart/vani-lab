// Boundary for the call audit. Production audits use the Eve/Sarvam backend SSE stream;
// the simulated client is retained only for isolated UI tests.
import { api, apiUrl } from "@/lib/api";
import { auditCreatedSchema, auditEventSchema, type AuditEvent } from "@/lib/api-contract";
import type { VersionId } from "./performance-data";

export type AuditStageId = "transcript" | "guardrails" | "kpis" | "overall" | "saved";
export const AUDIT_STAGES: { id: AuditStageId; label: string; detail: string }[] = [
  { id: "transcript", label: "Transcript captured", detail: "Preparing the conversation for review." },
  { id: "guardrails", label: "Guardrail checks", detail: "Checking the transcript against safety rules." },
  { id: "kpis", label: "KPI scoring", detail: "Scoring call outcomes and extracting evidence." },
  { id: "overall", label: "Overall score", detail: "Applying the active rubric weights." },
  { id: "saved", label: "Saved", detail: "Saving the completed audit record." },
];

export type CallTurn = { speaker: "bot" | "seller"; text: string };
export type AuditRequest = {
  version: VersionId;
  transcript: CallTurn[];
  durationSec: number;
  answered?: boolean;
};
export type AuditProgressEvent = AuditEvent;
export type AuditHandle = { auditId: string; cancel: () => void };

export interface AuditClient {
  // Starts an audit; events are pushed in order. Real client: POST /audits then SSE /audits/{id}/events.
  submit(request: AuditRequest, onEvent: (event: AuditProgressEvent) => void): AuditHandle;
}

const STAGE_MS = 900;
const SIMULATED_WEIGHTS = {
  meetingFixed: 0.4,
  callDuration: 0.15,
  answerRate: 0.15,
  locationConfirmed: 0.15,
  callbackRequested: 0.15,
} as const;

export function createSimulatedAuditClient(stageMs = STAGE_MS): AuditClient {
  return {
    submit(request, onEvent) {
      const timers: ReturnType<typeof setTimeout>[] = [];
      let at = 0;
      const kpis = {
        meetingFixed: 4,
        callDuration: 4,
        answerRate: 4,
        locationConfirmed: 3,
        callbackRequested: 3,
      };
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
              overall: Math.round(Object.entries(kpis).reduce(
                (sum, [key, score]) => sum + score * SIMULATED_WEIGHTS[key as keyof typeof SIMULATED_WEIGHTS], 0,
              ) * 10) / 10,
              kpis,
              weights: SIMULATED_WEIGHTS,
              guardrailsPassed: true,
              guardrails: [{ name: "simulated", passed: true, reason: "SIMULATED test data; no real guardrail evaluation." }],
              notes: "SIMULATED test result; no real call was audited.",
            }),
          at,
        ),
      );
      return {
        auditId: `sim-${request.version}-${request.transcript.length}`,
        cancel: () => timers.forEach(clearTimeout),
      };
    },
  };
}

// Real backend audit (Eve agent): POST /audits, then follow the SSE stream.
export function createApiAuditClient(): AuditClient {
  return {
    submit(request, onEvent) {
      let cancelled = false;
      let auditId = "pending";
      let stream: EventSource | null = null;
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
            let payload: unknown;
            try {
              payload = JSON.parse(message.data);
            } catch {
              finished = true;
              onEvent({ type: "error", message: "The auditor sent an unreadable update." });
              stream?.close();
              return;
            }
            const parsed = auditEventSchema.safeParse(payload);
            if (!parsed.success) {
              finished = true;
              onEvent({ type: "error", message: "The auditor sent an update in an unexpected format." });
              stream?.close();
              return;
            }
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
        .catch(() => {
          if (!cancelled) onEvent({ type: "error", message: "Unable to start the audit. Check your connection and retry." });
        });

      return {
        get auditId() {
          return auditId;
        },
        cancel: () => {
          cancelled = true;
          stream?.close();
          if (auditId !== "pending") {
            void api(`/audits/${auditId}`, { method: "DELETE" }).catch(() => undefined);
          }
        },
      };
    },
  };
}

export const auditClient: AuditClient = createApiAuditClient();
