import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIT_STAGES,
  createSimulatedAuditClient,
  type AuditProgressEvent,
} from "@/components/vani/audit-client";

describe("simulated audit client", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const request = { version: "B" as const, transcript: [], durationSec: 12 };

  it("emits every stage running then done, in order, and then a result", () => {
    const events: AuditProgressEvent[] = [];
    createSimulatedAuditClient(100).submit(request, (e) => events.push(e));

    vi.advanceTimersByTime(100 * AUDIT_STAGES.length + 1);

    const stageEvents = events.filter((e) => e.type === "stage");
    expect(stageEvents).toHaveLength(AUDIT_STAGES.length * 2);
    expect(stageEvents[0]).toEqual({ type: "stage", stage: "transcript", status: "running" });
    expect(stageEvents.at(-1)).toEqual({ type: "stage", stage: "saved", status: "done" });
    expect(events.at(-1)?.type).toBe("result");
  });

  it("stops emitting after cancel", () => {
    const events: AuditProgressEvent[] = [];
    const handle = createSimulatedAuditClient(100).submit(request, (e) => events.push(e));
    vi.advanceTimersByTime(150);
    const seen = events.length;

    handle.cancel();
    vi.advanceTimersByTime(2000);

    expect(events).toHaveLength(seen);
  });
});
