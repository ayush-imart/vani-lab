import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Play, X } from "lucide-react";
import { z } from "zod/v4";
import { api } from "@/lib/api";
import {
  preprodGateSchema,
  preprodRunSchema,
  type PreprodGate,
  type PreprodRun,
} from "@/lib/api-contract";
import { Button } from "@/components/ui/button";
import { Note, Pill } from "./common";
import { Reveal } from "./motion-kit";

const RUN_POLL_MS = 1000;
const RUN_POLL_MAX = 60;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The four checks the gate covers; shown as "not run" until the backend returns real results.
const FALLBACK_CHECKS = [
  "Language matching",
  "Consent before meeting confirmation",
  "Respect do-not-call requests",
  "Polite objection handling",
];

type RowStatus = "pending" | "running" | "pass" | "fail";
const TONE: Record<RowStatus, string> = {
  pending: "neutral",
  running: "blue",
  pass: "green",
  fail: "red",
};
const LABEL: Record<RowStatus, string> = {
  pending: "Not run",
  running: "Running",
  pass: "Passed",
  fail: "Failed",
};

function StatusPill({ status }: { status: RowStatus }) {
  return (
    <Pill tone={TONE[status]}>
      {status === "pass" && <Check size={11} />}
      {status === "fail" && <X size={11} />}
      {status === "running" && <Loader2 size={11} className="animate-spin" />}
      {LABEL[status]}
    </Pill>
  );
}

// Never claims "Passed" without backend data: with no results every check stays "Not run".
export function PreprodGatePanel({ versionId }: { versionId: string }) {
  const [gate, setGate] = useState<PreprodGate | null>(null);
  const [running, setRunning] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [error, setError] = useState("");

  const loadGate = useCallback(async () => {
    try {
      const next = await api(`/preprod/gate?versionId=${encodeURIComponent(versionId)}`, {
        schema: preprodGateSchema,
      });
      setGate(next);
      setUnreachable(false);
    } catch {
      setGate(null);
      setUnreachable(true);
    }
  }, [versionId]);

  useEffect(() => {
    void loadGate();
  }, [loadGate]);

  const run = async () => {
    setRunning(true);
    setError("");
    try {
      const started = await api("/preprod/runs", {
        method: "POST",
        body: { versionId },
        schema: z.object({ runId: z.string() }),
      });
      let current: PreprodRun = await api(`/preprod/runs/${started.runId}`, {
        schema: preprodRunSchema,
      });
      for (let i = 0; i < RUN_POLL_MAX && current.status === "running"; i += 1) {
        await wait(RUN_POLL_MS);
        current = await api(`/preprod/runs/${started.runId}`, { schema: preprodRunSchema });
      }
      if (current.status === "error") setError(current.error ?? "The run failed.");
      await loadGate();
    } catch (e) {
      setUnreachable(true);
      setError(e instanceof Error ? e.message : "Could not start the smoke tests.");
    } finally {
      setRunning(false);
    }
  };

  const rows = gate
    ? gate.checks.map((c) => ({
        id: c.id,
        label: c.label,
        status: (running ? "running" : c.status) as RowStatus,
        reasons: c.reasons,
      }))
    : FALLBACK_CHECKS.map((label) => ({
        id: label,
        label,
        status: (running ? "running" : "pending") as RowStatus,
        reasons: [] as string[],
      }));

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Pill tone={gate ? TONE[gate.status] : "amber"}>
          {gate ? `Gate: ${LABEL[gate.status]}` : "Gate: no results"}
        </Pill>
        <Button onClick={run} disabled={running || unreachable}>
          {running ? <Loader2 className="animate-spin" /> : <Play />}
          {running ? "Running smoke tests" : "Run smoke tests"}
        </Button>
      </div>
      {rows.map((r) => (
        <div key={r.id}>
          <div className="checkpoint-log">
            <span>{r.label}</span>
            <StatusPill status={r.status} />
          </div>
          <Reveal show={r.reasons.length > 0 && !running}>
            <ul className="preprod-reasons">
              {r.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      ))}
      <Reveal show={unreachable}>
        <Note>Backend unreachable: smoke tests cannot run, so no check is shown as passed.</Note>
      </Reveal>
      <Reveal show={!!error}>
        <p className="validation-error">{error}</p>
      </Reveal>
    </>
  );
}
