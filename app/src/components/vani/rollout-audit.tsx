// Decision log (audit trail) and run report with method + impact note.
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Note, Pill } from "./common";
import { fmtNum, fmtPts } from "./rollout-format";
import type { RolloutDecisionDto, RolloutReport } from "@/lib/api-contract";
import { getDecisions, getReport } from "@/lib/rollout-api";

export function DecisionRows({ decisions }: { decisions: RolloutDecisionDto[] }) {
  if (decisions.length === 0) return <p className="neutral-text">No decisions yet.</p>;
  return (
    <ol className="decision-log" aria-label="Decision log">
      {[...decisions].reverse().map((d) => (
        <li className="history-row" key={d.id}>
          <div>
            <strong>
              {d.action} · {d.fromStage}% to {d.toStage}%
            </strong>
            <p>{d.reason}</p>
            <small>
              {new Date(d.at).toLocaleString()} · {d.actor} · {d.trigger.replace(/_/g, " ")} · lift{" "}
              {fmtPts(d.liftPts)} · peak Lambda {fmtNum(d.peakLambdaBenefit)}
            </small>
          </div>
          <Pill tone={d.actor === "pm" ? "blue" : "neutral"}>{d.actor === "pm" ? "PM" : "Engine"}</Pill>
        </li>
      ))}
    </ol>
  );
}

export function ReportView({ report }: { report: RolloutReport }) {
  return (
    <div className="rollout-report">
      <h3 className="rollout-h3">Run report</h3>
      <p>
        <strong>Verdict:</strong> {report.verdict?.replace(/_/g, " ") ?? "not decided yet"} · status{" "}
        {report.run.status}
      </p>
      <p>
        <strong>Impact ({report.impact.basis.replace(/_/g, " ")}):</strong> {fmtPts(report.impact.liftPts)}.{" "}
        {report.impact.note}
      </p>
      <p>
        <strong>Method:</strong> {report.method.name} · alpha {report.method.alpha} · tau {report.method.tau}
      </p>
      <ul className="report-notes">
        {report.method.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {report.run.simulated && <Note>This run used synthetic data (SIMULATED).</Note>}
    </div>
  );
}

export function RolloutAudit({ experimentId, refreshKey }: { experimentId: string; refreshKey: number }) {
  const [decisions, setDecisions] = useState<RolloutDecisionDto[]>([]);
  const [report, setReport] = useState<RolloutReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    let alive = true;
    getDecisions(experimentId)
      .then((d) => {
        if (!alive) return;
        setDecisions(d);
        setError(null);
      })
      .catch(() => alive && setError("Decision log could not be loaded."));
    if (showReport) {
      getReport(experimentId)
        .then((r) => alive && setReport(r))
        .catch(() => alive && setError("Report could not be loaded."));
    }
    return () => {
      alive = false;
    };
  }, [experimentId, refreshKey, showReport]);

  return (
    <div className="rollout-audit">
      <div className="section-heading">
        <h3 className="rollout-h3">Decision log</h3>
        <Button variant="outline" size="sm" onClick={() => setShowReport((s) => !s)}>
          <FileText /> {showReport ? "Hide report" : "Run report"}
        </Button>
      </div>
      {error && <p className="validation-error">{error}</p>}
      <DecisionRows decisions={decisions} />
      {showReport && report && <ReportView report={report} />}
    </div>
  );
}
