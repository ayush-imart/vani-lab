import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { kpiKeys, rubricSchema, type Rubric } from "@/lib/api-contract";
import { ChipSelect } from "./chips";
import {
  Star,
  Info,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  GitCompareArrows,
  SlidersHorizontal,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { PageTitle, Pill, Avatar, Modal, Note, EmptyState, Regression } from "./common";
import { Reveal } from "./motion-kit";
import { versions, secondary, guardrails } from "./data";
const KPI_NAME: Record<(typeof kpiKeys)[number], string> = {
  meetingFixed: "Meeting Fixed rate",
  callDuration: "Call duration (seconds)",
  answerRate: "Answer rate",
  locationConfirmed: "Location confirmed rate",
  callbackRequested: "Callback requested rate",
};
const names = ["Meeting Fixed rate", ...secondary, ...guardrails];
const raw: Record<string, number[]> = {
  "Meeting Fixed rate": [11.5, 13.2, 9.8],
  "Call duration (seconds)": [74, 69, 81],
  "Answer rate": [68.4, 71.2, 66.1],
  "Location confirmed rate": [88.2, 91.4, 85.1],
  "Callback requested rate": [7.4, 8.1, 6.8],
  "Incorrect meeting-fixed rate": [1.2, 1.1, 2.3],
  "Do-not-call rate": [0.8, 0.7, 1.1],
  "Early drop rate": [12.8, 10.4, 17.1],
  "Bot response latency (P95)": [1.4, 1.3, 1.6],
  "Loopy / repeating calls rate": [2.1, 1.8, 3.4],
  "Seller had to repeat themselves rate": [3.4, 3.1, 4.5],
};
function Rating({ value, rawValue, calls }: { value: number; rawValue: string; calls: number }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="rating-cell" tabIndex={0} aria-label={`${value} out of 5, ${rawValue}`}>
            <span className="star-rating">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={i <= Math.round(value) ? "" : "empty"} />
              ))}
              <strong>{value.toFixed(1)}</strong>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="rating-tooltip" side="top">
          <strong>{rawValue}</strong>
          <div className="ci-bar" />
          <small>Illustrative interval · confidence pending</small>
          <div className="sample-progress">
            <span className={calls >= 1500 ? "progress-A" : "progress-B"} />
          </div>
          <small>{calls.toLocaleString()} / 1,500 calls needed</small>
          <small>Star mapping is a product placeholder.</small>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
export function Scorecard() {
  const [group, setGroup] = useState("Primary + secondary");
  const [sort, setSort] = useState({ key: "Overall", dir: 0 });
  const [info, setInfo] = useState(false);
  const [compare, setCompare] = useState(false);
  const [left, setLeft] = useState("A");
  const [right, setRight] = useState("B");
  const [settings, setSettings] = useState(false);
  const [primary, setPrimary] = useState("Meeting Fixed rate");
  const [weights, setWeights] = useState<Record<string, string>>({ "Meeting Fixed rate": "40" });
  const [rubric, setRubric] = useState<Rubric | null>(null);
  // Load the backend rubric when the settings modal opens; the placeholder values stay if it is unreachable.
  useEffect(() => {
    if (!settings) return;
    api("/rubric", { schema: rubricSchema })
      .then((r) => {
        setRubric(r);
        setPrimary(KPI_NAME[r.primaryMetric]);
        setWeights(
          Object.fromEntries(
            kpiKeys.map((k) => [KPI_NAME[k], String(Math.round(r.weights[k] * 100))]),
          ),
        );
      })
      .catch(() => setRubric(null));
  }, [settings]);
  const saveRubric = () => {
    const kpiFor = kpiKeys.find((k) => KPI_NAME[k] === primary);
    if (!rubric || !kpiFor) {
      setSettings(false);
      toast("Saved locally only (backend rubric unavailable or metric is not a KPI)");
      return;
    }
    const raw = kpiKeys.map((k) => Number(weights[KPI_NAME[k]] ?? 0));
    const total = raw.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      toast("Weights must add up to more than 0");
      return;
    }
    const normalised = Object.fromEntries(kpiKeys.map((k, i) => [k, (raw[i] ?? 0) / total]));
    api("/rubric", {
      method: "PUT",
      body: { primaryMetric: kpiFor, weights: normalised, guardrails: rubric.guardrails },
    })
      .then(() => {
        setSettings(false);
        toast.success("Rubric saved (weights normalised to 100%)");
      })
      .catch(() => toast("Could not save: backend unreachable"));
  };
  const [view, setView] = useState("ready");
  const columns =
    group === "Primary"
      ? [primary]
      : group === "Secondary"
        ? secondary
        : group === "Guardrails"
          ? guardrails
          : group === "All"
            ? [primary, ...secondary, ...guardrails].filter((m, i, a) => a.indexOf(m) === i)
            : [primary, ...secondary.slice(0, 2)].filter((m, i, a) => a.indexOf(m) === i);
  const order = [...versions].sort((a, b) => {
    if (!sort.dir) return b.score - a.score;
    const aIndex = versions.indexOf(a),
      bIndex = versions.indexOf(b);
    const vals = raw[sort.key];
    const diff =
      sort.key === "Overall" ? a.score - b.score : (vals?.[aIndex] || 0) - (vals?.[bIndex] || 0);
    return sort.dir === 1 ? diff : -diff;
  });
  const cycle = (key: string) =>
    setSort((s) => ({ key, dir: s.key === key ? (s.dir + 1) % 3 : 1 }));
  const value = (metric: string, id: string) => {
    const n = raw[metric]?.[versions.findIndex((v) => v.id === id)] || 0;
    return `${n}${metric.includes("seconds") ? "s" : metric.includes("latency") ? "s" : "%"}`;
  };
  return (
    <>
      <PageTitle
        eyebrow="EXPERIMENT / SCORECARD"
        title="Evidence over instinct."
        description="Compare what matters. The best version earns its place, one metric at a time."
        action={
          <Button variant="outline" onClick={() => setSettings(true)}>
            <SlidersHorizontal />
            Metrics & weights
          </Button>
        }
      />
      <div className="section-heading">
        <div>
          <div className="section-kicker">
            <h2>How your versions measure up</h2>
            <Pill>Sample data</Pill>
          </div>
          <p>Primary metric: {primary}. Overall scores use an illustrative weighted average.</p>
        </div>
        <div className="help-popover">
          <Button
            variant="ghost"
            size="icon"
            title="How star ratings work"
            onClick={() => setInfo(!info)}
          >
            <Info />
          </Button>
          <Reveal show={info}>
            <div className="help-card">
              <strong>Stars, with the evidence underneath.</strong>
              <p>
                Ratings translate raw values into 1–5 stars. Hover a score for the raw value and
                sample progress.
              </p>
              <p>Example: 40% × 4.5 + 60% × 4.0 = 4.2 overall.</p>
              <p>Star mapping and weights are placeholders pending product approval.</p>
            </div>
          </Reveal>
        </div>
      </div>
      <div className="score-controls">
        <div className="segmented">
          {["Primary + secondary", "Primary", "Secondary", "Guardrails", "All"].map((g) => (
            <Button
              key={g}
              variant="ghost"
              className={g === group ? "active" : ""}
              onClick={() => setGroup(g)}
            >
              {g}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setCompare(true)}>
          <GitCompareArrows />
          Compare versions
        </Button>
      </div>
      {view !== "ready" ? (
        <EmptyState state={view} onRetry={() => setView("ready")} />
      ) : (
        <div className="score-scroll">
          <table className="data-table score-table">
            <thead>
              <tr>
                <th>Prompt version</th>
                {["Overall", ...columns].map((m) => (
                  <th
                    key={m}
                    className={`${sort.key === m && sort.dir ? "active-column" : ""} ${guardrails.includes(m) ? "guardrail-cell" : ""}`}
                  >
                    <Button variant="ghost" onClick={() => cycle(m)}>
                      {m === "Overall" ? "Overall quality" : m}
                      {sort.key === m && sort.dir ? (
                        sort.dir === 1 ? (
                          <ArrowUp size={11} />
                        ) : (
                          <ArrowDown size={11} />
                        )
                      ) : (
                        <ArrowUpDown size={11} />
                      )}
                    </Button>
                  </th>
                ))}
                <th>Outlook</th>
              </tr>
            </thead>
            <tbody>
              {order.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div className="score-version">
                      <Avatar id={v.id} />
                      <div>
                        <strong>
                          Version {v.id} {v.id === "A" && <Pill>Baseline</Pill>}
                        </strong>
                        <small>{v.title}</small>
                      </div>
                    </div>
                    <Regression />
                  </td>
                  <td>
                    <Rating
                      value={v.score}
                      rawValue={`Overall quality score ${v.score}/5`}
                      calls={v.calls}
                    />
                  </td>
                  {columns.map((m, i) => (
                    <td key={m} className={guardrails.includes(m) ? "guardrail-cell" : ""}>
                      <Rating
                        value={Math.min(5, Math.max(1, v.score + (i % 2 ? 0.2 : -0.1)))}
                        rawValue={`${m}: ${value(m, v.id)}`}
                        calls={v.calls}
                      />
                    </td>
                  ))}
                  <td>
                    <Pill tone={v.id === "B" ? "green" : v.id === "C" ? "amber" : "neutral"}>
                      {v.id === "B" ? "Leading" : v.id === "C" ? "Underperforming" : "On track"}
                    </Pill>
                    <div className="sample-progress">
                      <span className={`progress-${v.id}`} />
                    </div>
                    <small className="neutral-text text-[8px]">
                      {Math.min(100, Math.round((v.calls / 1500) * 100))}% sample collected
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="table-footer">
        <span>
          <ShieldCheck size={12} />
          Leading does not mean ready to promote.
        </span>
        <ChipSelect
          value={view}
          onChange={setView}
          ariaLabel="Scorecard preview state"
          options={[
            { value: "ready", label: "Ready" },
            { value: "empty", label: "Empty" },
            { value: "loading", label: "Loading" },
            { value: "error", label: "Error" },
          ]}
        />
      </div>
      <Modal open={compare} onOpenChange={setCompare} title="Compare any two versions">
        <div className="field-grid">
          <ChipSelect
            value={left}
            onChange={setLeft}
            ariaLabel="First comparison version"
            options={versions.map((v) => ({ value: v.id, label: `Version ${v.id}` }))}
          />
          <ChipSelect
            value={right}
            onChange={setRight}
            ariaLabel="Second comparison version"
            options={versions.map((v) => ({ value: v.id, label: `Version ${v.id}` }))}
          />
        </div>
        {left === right ? (
          <Note>Choose two different versions to compare.</Note>
        ) : (
          <>
            {[primary, ...secondary.slice(0, 2), ...guardrails.slice(0, 2)].map((m) => (
              <div className="comparison-row" key={m}>
                <strong>{m}</strong>
                <span>{value(m, left)}</span>
                <span>{value(m, right)}</span>
                <Pill tone={m === primary ? "amber" : "green"}>
                  {m === primary
                    ? "No proven difference"
                    : right === "B"
                      ? "Better in sample"
                      : "Sample difference"}
                </Pill>
              </div>
            ))}
            <Note>
              Metric deltas are illustrative; significance and guardrail checks are pending approved
              decision rules.
            </Note>
          </>
        )}
      </Modal>
      <Modal open={settings} onOpenChange={setSettings} title="Metrics & weights">
        <label className="field-label">Primary metric</label>
        <ChipSelect
          value={primary}
          onChange={setPrimary}
          ariaLabel="Primary metric"
          options={names.map((m) => ({ value: m, label: m }))}
        />
        <Note>
          Weighting and raw-value-to-star mapping are placeholders pending product approval.
        </Note>
        {names.map((m) => (
          <div className="metric-settings-row" key={m}>
            <span>{m}</span>
            <label>
              Weight
              <input
                type="number"
                min="0"
                max="100"
                className="form-input"
                aria-label={`${m} weight`}
                value={weights[m] || "10"}
                onChange={(e) => setWeights({ ...weights, [m]: e.target.value })}
              />
              %
            </label>
          </div>
        ))}
        <Button onClick={saveRubric}>Save preferences</Button>
      </Modal>
    </>
  );
}
