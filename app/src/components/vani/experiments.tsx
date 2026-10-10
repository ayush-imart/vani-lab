import { useState, useRef } from "react";
import {
  FlaskConical,
  CirclePlay,
  Archive,
  ArrowUp,
  ArrowDown,
  Minus,
  Plus,
  BarChart3,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { PageTitle, Pill, Note, Modal } from "./common";
import { toast } from "sonner";

// ── Live experiments ──

type LiveExperiment = {
  id: string;
  name: string;
  traffic: string;
  glids: string;
  startDate: string;
  tentativeEdd: string;
  metric: string;
  metricBaseline: string;
};

const LIVE_EXPERIMENTS: LiveExperiment[] = [
  {
    id: "exp-1",
    name: "Shorter opening vs baseline",
    traffic: "20%",
    glids: "GLID ending in 0, 1 · 10% each",
    startDate: "29 Sep '26",
    tentativeEdd: "13 Oct '26",
    metric: "Meeting Fixed",
    metricBaseline: "10.6%",
  },
  {
    id: "exp-2",
    name: "Hinglish-first greeting",
    traffic: "20%",
    glids: "GLID ending in 2, 3 · 10% each",
    startDate: "01 Oct '26",
    tentativeEdd: "15 Oct '26",
    metric: "Answer rate",
    metricBaseline: "68.4%",
  },
  {
    id: "exp-3",
    name: "Direct meeting ask in 30s",
    traffic: "10%",
    glids: "GLID ending in 4 · 10%",
    startDate: "06 Oct '26",
    tentativeEdd: "20 Oct '26",
    metric: "Meeting Fixed",
    metricBaseline: "10.6%",
  },
];

// ── Past experiments ──

type Outcome = "Scaled" | "Rolled back";

type ImpactMetric = {
  label: string;
  versionA: string;
  versionB: string;
  delta: string;
  improved: boolean;
};

type PastExperiment = {
  id: string;
  name: string;
  traffic: string;
  startDate: string;
  endDate: string;
  metric: string;
  impact: number;
  improved: boolean;
  outcome: Outcome;
  analysis: {
    versionALabel: string;
    versionATraffic: string;
    versionBLabel: string;
    versionBTraffic: string;
    summary: string;
    nextSteps: string[];
    totalCalls: number;
    metrics: ImpactMetric[];
  };
};

const PAST_EXPERIMENTS: PastExperiment[] = [
  {
    id: "past-1",
    name: "Bilingual intro test",
    traffic: "40%",
    startDate: "01 Aug '26",
    endDate: "21 Aug '26",
    metric: "Meeting Fixed",
    impact: 1.2,
    improved: true,
    outcome: "Scaled",
    analysis: {
      versionALabel: "Version A — Current production",
      versionATraffic: "60%",
      versionBLabel: "Version B — Bilingual intro",
      versionBTraffic: "40%",
      summary: "The bilingual intro significantly improved meeting fixed rate by +1.2pp over 21 days. Answer rate also improved. No guardrail regressions observed across 4,820 calls.",
      totalCalls: 4820,
      metrics: [
        { label: "Meeting Fixed", versionA: "10.6%", versionB: "11.8%", delta: "+1.2pp", improved: true },
        { label: "Answer rate", versionA: "68.4%", versionB: "69.1%", delta: "+0.7pp", improved: true },
        { label: "Call duration", versionA: "74s", versionB: "73s", delta: "-1s", improved: true },
        { label: "Location confirmed", versionA: "62.5%", versionB: "62.8%", delta: "+0.3pp", improved: true },
        { label: "Callback requested", versionA: "7.4%", versionB: "7.6%", delta: "+0.2pp", improved: true },
        { label: "Early drop rate", versionA: "12.8%", versionB: "12.5%", delta: "-0.3pp", improved: true },
      ],
      nextSteps: [
        "Scale Version B to 100% traffic",
        "Monitor guardrails for 7 days post-scale",
        "Update baseline metrics in scorecard",
      ],
    },
  },
  {
    id: "past-2",
    name: "Callback offer after objection",
    traffic: "20%",
    startDate: "10 Aug '26",
    endDate: "30 Aug '26",
    metric: "Callback Requested",
    impact: 0.8,
    improved: true,
    outcome: "Scaled",
    analysis: {
      versionALabel: "Version A — No callback offer",
      versionATraffic: "80%",
      versionBLabel: "Version B — Callback after objection",
      versionBTraffic: "20%",
      summary: "Offering a callback after first objection increased callback rate by +0.8pp. Meeting fixed was unchanged. Call duration slightly longer due to the extra offer. Observed over 2,140 calls across 20 days.",
      totalCalls: 2140,
      metrics: [
        { label: "Callback requested", versionA: "7.4%", versionB: "8.2%", delta: "+0.8pp", improved: true },
        { label: "Meeting Fixed", versionA: "10.6%", versionB: "10.5%", delta: "-0.1pp", improved: false },
        { label: "Answer rate", versionA: "68.4%", versionB: "68.9%", delta: "+0.5pp", improved: true },
        { label: "Call duration", versionA: "74s", versionB: "77s", delta: "+3s", improved: false },
        { label: "Do-not-call rate", versionA: "0.8%", versionB: "0.6%", delta: "-0.2pp", improved: true },
      ],
      nextSteps: [
        "Scale Version B to 100% traffic",
        "Track call duration — slight increase is acceptable but should not grow further",
        "Run follow-up test combining callback offer with shorter opening",
      ],
    },
  },
  {
    id: "past-3",
    name: "Faster TTS voice",
    traffic: "60%",
    startDate: "15 Jul '26",
    endDate: "04 Aug '26",
    metric: "Call duration",
    impact: -3,
    improved: true,
    outcome: "Scaled",
    analysis: {
      versionALabel: "Version A — Standard TTS",
      versionATraffic: "40%",
      versionBLabel: "Version B — Faster TTS",
      versionBTraffic: "60%",
      summary: "Faster TTS reduced average call duration by 3 seconds without hurting meeting fixed or answer rate. Seller-repeat rate dropped slightly, suggesting better comprehension. 7,560 calls observed.",
      totalCalls: 7560,
      metrics: [
        { label: "Call duration", versionA: "74s", versionB: "71s", delta: "-3s", improved: true },
        { label: "Meeting Fixed", versionA: "10.6%", versionB: "10.7%", delta: "+0.1pp", improved: true },
        { label: "Answer rate", versionA: "68.4%", versionB: "68.6%", delta: "+0.2pp", improved: true },
        { label: "Bot response latency (P95)", versionA: "1.4s", versionB: "1.2s", delta: "-0.2s", improved: true },
        { label: "Seller had to repeat", versionA: "3.4%", versionB: "3.1%", delta: "-0.3pp", improved: true },
      ],
      nextSteps: [
        "Scale Version B to 100% — no regressions detected",
        "Update TTS config in production pipeline",
        "Explore further speed optimization in next sprint",
      ],
    },
  },
  {
    id: "past-4",
    name: "Location confirm skip",
    traffic: "20%",
    startDate: "20 Jul '26",
    endDate: "09 Aug '26",
    metric: "Location confirmed",
    impact: -4.1,
    improved: false,
    outcome: "Rolled back",
    analysis: {
      versionALabel: "Version A — With location confirm",
      versionATraffic: "80%",
      versionBLabel: "Version B — Skip location confirm",
      versionBTraffic: "20%",
      summary: "Skipping location confirmation reduced location confirmed rate by -4.1pp. Incorrect meeting-fixed rate increased, indicating sellers were booked for wrong locations. Rolled back after 10 days due to guardrail breach.",
      totalCalls: 1890,
      metrics: [
        { label: "Location confirmed", versionA: "62.5%", versionB: "58.4%", delta: "-4.1pp", improved: false },
        { label: "Meeting Fixed", versionA: "10.6%", versionB: "11.0%", delta: "+0.4pp", improved: true },
        { label: "Incorrect meeting-fixed", versionA: "1.2%", versionB: "2.8%", delta: "+1.6pp", improved: false },
        { label: "Call duration", versionA: "74s", versionB: "68s", delta: "-6s", improved: true },
        { label: "Early drop rate", versionA: "12.8%", versionB: "14.2%", delta: "+1.4pp", improved: false },
      ],
      nextSteps: [
        "Roll back to Version A — guardrail breach on incorrect meeting-fixed rate",
        "Investigate if a lighter confirm step (yes/no only) can reduce duration without losing accuracy",
        "Add incorrect meeting-fixed as a primary guardrail for future experiments",
      ],
    },
  },
  {
    id: "past-5",
    name: "Aggressive meeting push",
    traffic: "10%",
    startDate: "01 Jul '26",
    endDate: "15 Jul '26",
    metric: "Meeting Fixed",
    impact: -0.6,
    improved: false,
    outcome: "Rolled back",
    analysis: {
      versionALabel: "Version A — Standard opening",
      versionATraffic: "90%",
      versionBLabel: "Version B — Meeting push in 15s",
      versionBTraffic: "10%",
      summary: "Pushing for a meeting in the first 15 seconds decreased meeting fixed by -0.6pp and increased do-not-call rate. Sellers felt pressured and dropped early. 980 calls observed over 14 days.",
      totalCalls: 980,
      metrics: [
        { label: "Meeting Fixed", versionA: "10.6%", versionB: "10.0%", delta: "-0.6pp", improved: false },
        { label: "Do-not-call rate", versionA: "0.8%", versionB: "1.4%", delta: "+0.6pp", improved: false },
        { label: "Early drop rate", versionA: "12.8%", versionB: "16.3%", delta: "+3.5pp", improved: false },
        { label: "Answer rate", versionA: "68.4%", versionB: "67.8%", delta: "-0.6pp", improved: false },
        { label: "Call duration", versionA: "74s", versionB: "62s", delta: "-12s", improved: true },
      ],
      nextSteps: [
        "Roll back to Version A — sellers felt pressured, DNC rate spiked",
        "Do not retry aggressive timing without softer language",
        "Consider a gentler 30s ask instead of 15s in a new experiment",
      ],
    },
  },
  {
    id: "past-6",
    name: "Empathetic closer script",
    traffic: "40%",
    startDate: "15 Jun '26",
    endDate: "05 Jul '26",
    metric: "Answer rate",
    impact: 2.3,
    improved: true,
    outcome: "Scaled",
    analysis: {
      versionALabel: "Version A — Standard closer",
      versionATraffic: "60%",
      versionBLabel: "Version B — Empathetic closer",
      versionBTraffic: "40%",
      summary: "The empathetic closer improved answer rate by +2.3pp and reduced do-not-call rate. Sellers responded positively to the warmer closing, with no metric regressions across 5,340 calls.",
      totalCalls: 5340,
      metrics: [
        { label: "Answer rate", versionA: "68.4%", versionB: "70.7%", delta: "+2.3pp", improved: true },
        { label: "Meeting Fixed", versionA: "10.6%", versionB: "10.9%", delta: "+0.3pp", improved: true },
        { label: "Do-not-call rate", versionA: "0.8%", versionB: "0.5%", delta: "-0.3pp", improved: true },
        { label: "Call duration", versionA: "74s", versionB: "76s", delta: "+2s", improved: false },
        { label: "Location confirmed", versionA: "62.5%", versionB: "63.0%", delta: "+0.5pp", improved: true },
      ],
      nextSteps: [
        "Scale Version B to 100% traffic",
        "Apply empathetic tone to mid-call objection handling as a follow-up experiment",
        "Monitor call duration — 2s increase is within tolerance but worth tracking",
      ],
    },
  },
];

function ImpactBadge({ impact, improved, metric }: { impact: number; improved: boolean; metric: string }) {
  const unit = metric === "Call duration" ? "s" : "pp";
  const abs = Math.abs(impact);
  if (abs < 0.05) {
    return (
      <span className="delta-badge delta-neutral">
        <Minus size={12} /> 0{unit}
      </span>
    );
  }
  return (
    <span className={`delta-badge ${improved ? "delta-positive" : "delta-negative"}`}>
      {improved ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {impact > 0 ? "+" : ""}{impact}{unit}
    </span>
  );
}

function buildCopyText(exp: PastExperiment): string {
  const { analysis: a } = exp;
  const lines = [
    `Impact Analysis: ${exp.name}`,
    `${"─".repeat(40)}`,
    `Period: ${exp.startDate} → ${exp.endDate}`,
    `Traffic: ${exp.traffic} | Total calls: ${a.totalCalls.toLocaleString()}`,
    `Primary metric: ${exp.metric} | Outcome: ${exp.outcome}`,
    ``,
    `${a.versionALabel} (${a.versionATraffic}) vs ${a.versionBLabel} (${a.versionBTraffic}):`,
    ...a.metrics.map(
      (m) => `  ${m.label.padEnd(26)} A: ${m.versionA.padEnd(8)} B: ${m.versionB.padEnd(8)} Delta: ${m.delta}`,
    ),
    ``,
    `Summary:`,
    a.summary,
    ``,
    `Next Steps:`,
    ...a.nextSteps.map((s, i) => `  ${i + 1}. ${s}`),
  ];
  return lines.join("\n");
}

function ImpactModal({
  exp,
  open,
  onOpenChange,
}: {
  exp: PastExperiment;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const a = exp.analysis;

  const handleCopy = () => {
    const text = buildCopyText(exp);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("Impact analysis copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Impact Analysis — ${exp.name}`}
      description={`${exp.startDate} → ${exp.endDate} · ${exp.traffic} traffic · ${exp.analysis.totalCalls.toLocaleString()} calls`}
    >
      <div className="impact-modal" ref={contentRef}>
        <div className="impact-header">
          <div className="impact-header-pills">
            <Pill tone={exp.outcome === "Scaled" ? "green" : "red"}>{exp.outcome}</Pill>
            <Pill tone={exp.improved ? "green" : "amber"}>{exp.metric}: {exp.impact > 0 ? "+" : ""}{exp.impact}{exp.metric === "Call duration" ? "s" : "pp"}</Pill>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy} className="impact-copy-btn">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <div className="impact-table-wrap">
          <table className="data-table impact-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>{a.versionALabel} ({a.versionATraffic})</th>
                <th>{a.versionBLabel} ({a.versionBTraffic})</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {a.metrics.map((m) => (
                <tr key={m.label} className={!m.improved ? "impact-row-negative" : ""}>
                  <td><strong>{m.label}</strong></td>
                  <td className="impact-val">{m.versionA}</td>
                  <td className="impact-val"><strong>{m.versionB}</strong></td>
                  <td>
                    <span className={`delta-badge ${m.improved ? "delta-positive" : "delta-negative"}`}>
                      {m.improved ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                      {m.delta}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="impact-summary">
          <strong>Summary</strong>
          <p className="impact-summary-text">{a.summary}</p>
        </div>

        <div className="impact-summary">
          <strong>Next Steps</strong>
          <ul className="impact-next-steps">
            {a.nextSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

export function Experiments() {
  const [impactExp, setImpactExp] = useState<PastExperiment | null>(null);

  return (
    <>
      <PageTitle
        eyebrow="EXPERIMENT / TRACKER"
        title="Experiment tracker."
        description="All live and past experiments in one view. Track traffic, timelines, metrics and impact."
        action={
          <Button asChild variant="outline">
            <Link to="/setup">
              <Plus size={15} />
              New experiment
            </Link>
          </Button>
        }
      />

      {/* ── Live experiments ── */}
      <div className="section-heading">
        <div>
          <div className="section-kicker">
            <h2>
              <CirclePlay size={16} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
              Live experiments
            </h2>
            <Pill tone="green">{LIVE_EXPERIMENTS.length} running</Pill>
          </div>
          <p>Currently active experiments across seller traffic.</p>
        </div>
      </div>

      <div className="score-scroll">
        <table className="data-table score-table exp-table">
          <thead>
            <tr>
              <th>Experiment name</th>
              <th>Traffic</th>
              <th>Start date</th>
              <th>Tentative EDD</th>
              <th>Metric</th>
            </tr>
          </thead>
          <tbody>
            {LIVE_EXPERIMENTS.map((exp) => (
              <tr key={exp.id}>
                <td>
                  <div className="exp-name-cell">
                    <FlaskConical size={14} className="exp-icon-live" />
                    <div>
                      <strong>{exp.name}</strong>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="exp-traffic">
                    <strong>{exp.traffic}</strong>
                    <small>{exp.glids}</small>
                  </div>
                </td>
                <td className="exp-date">{exp.startDate}</td>
                <td className="exp-date">{exp.tentativeEdd}</td>
                <td>
                  <Pill tone="green">{exp.metric}</Pill>
                  <small className="exp-baseline">baseline {exp.metricBaseline}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Past experiments ── */}
      <div className="section-heading" style={{ marginTop: 32 }}>
        <div>
          <div className="section-kicker">
            <h2>
              <Archive size={16} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
              Past experiments
            </h2>
            <Pill>{PAST_EXPERIMENTS.length} completed</Pill>
          </div>
          <p>Completed experiments with measured impact.</p>
        </div>
      </div>

      <div className="score-scroll">
        <table className="data-table score-table exp-table">
          <thead>
            <tr>
              <th>Experiment name</th>
              <th>Traffic</th>
              <th>Start date</th>
              <th>End date</th>
              <th>Metric</th>
              <th>Impact</th>
              <th>Outcome</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {PAST_EXPERIMENTS.map((exp) => (
              <tr key={exp.id} className={!exp.improved ? "wow-row-negative" : ""}>
                <td>
                  <div className="exp-name-cell">
                    <Archive size={14} className="exp-icon-past" />
                    <strong>{exp.name}</strong>
                  </div>
                </td>
                <td>
                  <strong>{exp.traffic}</strong>
                </td>
                <td className="exp-date">{exp.startDate}</td>
                <td className="exp-date">{exp.endDate}</td>
                <td>
                  <Pill tone="neutral">{exp.metric}</Pill>
                </td>
                <td>
                  <ImpactBadge impact={exp.impact} improved={exp.improved} metric={exp.metric} />
                </td>
                <td>
                  <Pill tone={exp.outcome === "Scaled" ? "green" : "red"}>
                    {exp.outcome}
                  </Pill>
                </td>
                <td>
                  <Button
                    variant="outline"
                    size="sm"
                    className="impact-cta"
                    onClick={() => setImpactExp(exp)}
                  >
                    <BarChart3 size={14} />
                    Impact
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Note>
        Synthetic data. In production, experiments are created from the Experiment setup page and tracked automatically.
      </Note>

      <div className="table-footer">
        <span>Impact is measured as the change vs control during the experiment period.</span>
      </div>

      {impactExp && (
        <ImpactModal
          exp={impactExp}
          open={!!impactExp}
          onOpenChange={(o) => { if (!o) setImpactExp(null); }}
        />
      )}
    </>
  );
}
