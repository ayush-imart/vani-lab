// Demo: runs the backend's synthetic paired-call simulation. Always labelled SIMULATED.
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Note, Pill } from "./common";
import { ReportView } from "./rollout-audit";
import { fmtPts } from "./rollout-format";
import type { SimulationRequest, SimulationResult } from "@/lib/api-contract";
import { runSimulation } from "@/lib/rollout-api";

const PRESETS: { id: string; label: string; req: Partial<SimulationRequest> }[] = [
  { id: "lift", label: "+5 pt lift", req: { scenario: "true_lift", trueLiftPts: 5 } },
  { id: "bad", label: "Bad variant", req: { scenario: "bad_variant" } },
  { id: "none", label: "No difference", req: { scenario: "no_difference" } },
];

export function RolloutSimulation({ primary }: { primary: string }) {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const go = async (p: (typeof PRESETS)[number]) => {
    setRunning(p.id);
    try {
      setResult(
        await runSimulation({ ...p.req, primary: primary as SimulationRequest["primary"], days: 7 }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="rollout-sim">
      <div className="section-kicker">
        <h3 className="rollout-h3">Run simulation</h3>
        <Pill tone="amber">SIMULATED</Pill>
      </div>
      <p className="neutral-text">
        Synthetic paired calls through the real rollout engine. Shows how the stages behave; it is
        not real traffic and never touches your metrics.
      </p>
      <div className="heading-actions">
        {PRESETS.map((p) => (
          <Button key={p.id} variant="outline" disabled={running !== null} onClick={() => void go(p)}>
            <FlaskConical /> {running === p.id ? "Running..." : p.label}
          </Button>
        ))}
      </div>
      {result && (
        <div className="sim-result" aria-live="polite">
          <Note>
            SIMULATED · {result.notice} True rates: control {result.truth.controlPct.toFixed(1)}%,
            challenger {result.truth.treatmentPct.toFixed(1)}%.
          </Note>
          <p>
            <strong>Final:</strong> {result.finalStatus.replace("_", " ")} at {result.finalStagePct}% ·
            verdict {result.verdict?.replace(/_/g, " ") ?? "none"}
          </p>
          <ol className="decision-log" aria-label="Simulated timeline">
            {result.timeline.map((t, i) => (
              <li className="history-row" key={`${t.at}-${i}`}>
                <div>
                  <strong>
                    {t.action} · {t.stage}%
                  </strong>
                  <p>{t.reason}</p>
                  <small>
                    {new Date(t.at).toLocaleDateString()} · {t.trigger.replace(/_/g, " ")} · lift{" "}
                    {fmtPts(t.liftPts)}
                  </small>
                </div>
                <Pill tone="amber">Simulated</Pill>
              </li>
            ))}
          </ol>
          <ReportView report={result.report} />
        </div>
      )}
    </div>
  );
}
