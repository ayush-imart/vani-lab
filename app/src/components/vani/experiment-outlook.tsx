import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { callRecordSchema, rolloutStateSchema } from "@/lib/api-contract";
import { listExperiments, type Experiment } from "@/lib/experiments-api";
import { Note, Pill } from "./common";
import { z } from "zod/v4";

const DAY_MS = 86_400_000;
const MIN_CALLS_PER_ARM = 100; // Keep aligned with backend/src/spec.ts ENGINE_GUARDS.
const activeStatuses = new Set<Experiment["status"]>(["scheduled", "running", "paused"]);
const callsSchema = z.object({ items: z.array(callRecordSchema) });
type OutlookRow = {
  experiment: Experiment;
  status: string;
  stage: string;
  pending: string;
  note: string;
};

function daysText(days: number): string {
  if (!Number.isFinite(days)) return "Awaiting call history";
  if (days <= 0) return "Ready to evaluate";
  return `${days.toFixed(1)} days`;
}

function outlookFor(
  state: z.infer<typeof rolloutStateSchema>,
  calls: z.infer<typeof callsSchema>["items"],
  now: number,
): Pick<OutlookRow, "stage" | "pending" | "note"> {
  const { run, evidence } = state;
  if (run.status === "scheduled") {
    const days = Math.max(0, (Date.parse(run.windowStart) - now) / DAY_MS);
    return { stage: "Scheduled", pending: daysText(days), note: "Until the configured start time." };
  }
  if (run.phase === "holdback" && run.holdback) {
    const dueAt = Date.parse(run.holdback.startedAt) + run.settings.holdbackDays * DAY_MS;
    const days = Math.max(0, (dueAt - now) / DAY_MS);
    return { stage: "Holdback", pending: daysText(days), note: "Policy holdback window; negative evidence can roll back sooner." };
  }

  const startedAt = Date.parse(run.startedAt);
  const elapsedDays = Math.max((now - startedAt) / DAY_MS, 1);
  const runCalls = calls.filter(
    (call) => call.source !== "audit" && Date.parse(String(call.at)) >= startedAt,
  );
  const controlCalls = runCalls.filter((call) => call.version === run.controlSlot).length;
  const treatmentCalls = runCalls.filter((call) => call.version === run.challengerSlot).length;
  const coverage = evidence.validity.coverage.share ?? 0;
  const controlRate = (controlCalls * coverage) / elapsedDays;
  const treatmentRate = (treatmentCalls * coverage) / elapsedDays;
  const controlGap = Math.max(0, MIN_CALLS_PER_ARM - evidence.primary.nControl);
  const treatmentGap = Math.max(0, MIN_CALLS_PER_ARM - evidence.primary.nTreatment);
  const sampleDays = Math.max(
    controlRate > 0 ? controlGap / controlRate : Number.POSITIVE_INFINITY,
    treatmentRate > 0 ? treatmentGap / treatmentRate : Number.POSITIVE_INFINITY,
  );
  const stageElapsed = Math.max(0, (now - Date.parse(run.stageEnteredAt)) / 3_600_000);
  const changeElapsed = Math.max(0, (now - Date.parse(run.lastChangeAt)) / 3_600_000);
  const timeDays = Math.max(
    0,
    (run.settings.minStageHours - stageElapsed) / 24,
    (run.settings.cooldownHours - changeElapsed) / 24,
  );
  const harms = evidence.primary.peakLambdaHarm >= 20;
  const benefitStatMet = state.nextGate?.includes("Statistics met.") ?? false;
  const pendingDays = harms ? timeDays : Math.max(benefitStatMet ? 0 : sampleDays, timeDays);
  const capDays = Math.max(0, run.settings.maxLengthDays - elapsedDays);
  const days = Math.min(pendingDays, capDays);
  const note = harms
    ? "Harm threshold is met; next policy tick can scale down or roll back."
    : benefitStatMet
      ? "Statistical gate is met; remaining time gates still apply."
      : "Lower bound from the 100 judged calls per arm guard and current call rate; lift, Lambda and guardrails can take longer.";

  return {
    stage: `${run.phase === "ramp" ? `${run.stagePct}% ramp` : run.phase} · ${run.status}`,
    pending: Number.isFinite(days) ? `≥ ${daysText(days)}` : "Awaiting judged calls",
    note,
  };
}

export function ExperimentOutlook({ experimentId }: { experimentId: string | null }) {
  const [rows, setRows] = useState<OutlookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const experiments = await listExperiments();
        const selected = experiments.filter(
          (experiment) => activeStatuses.has(experiment.status) && (!experimentId || experiment.id === experimentId),
        );
        const nextRows = await Promise.all(
          selected.map(async (experiment): Promise<OutlookRow> => {
            try {
              const [state, calls] = await Promise.all([
                api(`/experiments/${encodeURIComponent(experiment.id)}/rollout`, { schema: rolloutStateSchema }),
                api(`/calls?limit=1000&experimentId=${encodeURIComponent(experiment.id)}`, { schema: callsSchema }),
              ]);
              return {
                experiment,
                status: experiment.status,
                ...outlookFor(state, calls.items, Date.now()),
              };
            } catch {
              return {
                experiment,
                status: experiment.status,
                stage: "Unavailable",
                pending: "Estimate unavailable",
                note: "Could not load rollout evidence for this experiment.",
              };
            }
          }),
        );
        if (active) setRows(nextRows);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load experiment status.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [experimentId]);

  return (
    <section className="experiment-outlook" aria-labelledby="experiment-outlook-title">
      <div className="section-heading">
        <div>
          <h2 id="experiment-outlook-title">Experiment decision outlook</h2>
          <p>Pending time follows the active rollout gates and observed call rate.</p>
        </div>
        <Pill tone="neutral">Scale-up / scale-down model</Pill>
      </div>
      <div className="score-scroll">
        <table className="data-table outlook-table">
          <thead>
            <tr><th scope="col">Experiment</th><th scope="col">Versions</th><th scope="col">Stage</th><th scope="col">Pending days</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.experiment.id}>
                <th scope="row">{row.experiment.name}<small className="outlook-note">{row.note}</small></th>
                <td>{row.experiment.baselineVersionId} vs {row.experiment.challengerVersionId}</td>
                <td><Pill>{row.stage}</Pill></td>
                <td><strong>{row.pending}</strong></td>
              </tr>
            ))}
            {!loading && !error && rows.length === 0 && (
              <tr><td colSpan={4}>No active rollout is pending for this experiment.</td></tr>
            )}
            {loading && rows.length === 0 && <tr><td colSpan={4}>Loading rollout evidence…</td></tr>}
            {error && <tr><td colSpan={4}>Rollout evidence unavailable: {error}</td></tr>}
          </tbody>
        </table>
      </div>
      <Note>Days are an estimate to the next model evaluation, not a promised winner date. Scale-down can happen early when harm evidence is strong.</Note>
    </section>
  );
}
