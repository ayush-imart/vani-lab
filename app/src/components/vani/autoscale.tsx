import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AnimatedNumber } from "./motion-kit";
import { NumberStepper } from "./number-stepper";
import { Pause, Play, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, Note, Pill, Tip } from "./common";
import { useAutoscaleSource, type AutoscaleView, type AutoscaleSettings } from "./autoscale-source";
import { versionIds, type VersionId } from "./performance-data";
import { DEFAULT_THRESHOLD_PCT, RISK_LABELS, RISK_STEPS, riskAppetites } from "./scale-policy";
import type { RiskAppetite } from "./scale-policy";
import { DEFAULT_ALPHA, DEFAULT_MIN_TRIALS, METHOD_NAME } from "./sequential-test";

const fmtPoints = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} pp`;

function EvidenceCell({ view, id }: { view: AutoscaleView; id: VersionId }) {
  const e = view.evidence[id];
  if (id === "A") return <span className="neutral-text">Baseline, not tested</span>;
  if (!e) return <span className="neutral-text">Collecting...</span>;
  return (
    <Tip label={`${e.trials} calls in this round`}>
      <span tabIndex={0}>
        p = <AnimatedNumber value={e.pValue} decimals={3} /> <small>(vs {e.lead} threshold)</small>
      </span>
    </Tip>
  );
}

export function Autoscale() {
  const [autoscale, setAutoscale] = useState(true);
  const [risk, setRisk] = useState<RiskAppetite>("moderate");
  const [thresholdText, setThresholdText] = useState(String(DEFAULT_THRESHOLD_PCT));
  const [running, setRunning] = useState(true);
  const thresholdPct = Number(thresholdText);
  const validThreshold = Number.isFinite(thresholdPct) && thresholdPct > 0 && thresholdPct < 100;
  const settings: AutoscaleSettings = {
    thresholdPct: validThreshold ? thresholdPct : DEFAULT_THRESHOLD_PCT,
    autoscale,
    riskAppetite: risk,
    stepPoints: RISK_STEPS[risk],
  };
  const onRemoteSettings = useCallback((remote: AutoscaleSettings) => {
    setAutoscale(remote.autoscale);
    setRisk(remote.riskAppetite);
    setThresholdText(String(remote.thresholdPct));
  }, []);
  const {
    view: state,
    mode,
    reset,
  } = useAutoscaleSource(settings, running && validThreshold, onRemoteSettings);

  return (
    <section className="autoscale" aria-labelledby="autoscale-title">
      <div className="section-heading">
        <div>
          <div className="section-kicker">
            <h2 id="autoscale-title">Autoscale</h2>
            <Pill tone={autoscale ? "green" : "neutral"}>{autoscale ? "On" : "Off"}</Pill>
            <Pill tone={mode === "backend" ? "green" : "amber"}>
              {mode === "backend" ? "Live backend" : "Synthetic data"}
            </Pill>
          </div>
          <p>
            Good versions grow by your step size. A version that stays below the threshold is scaled
            down automatically and you are notified.
          </p>
        </div>
        <div className="heading-actions">
          <Button variant="outline" onClick={() => setRunning(!running)}>
            {running ? <Pause /> : <Play />}
            {running ? "Pause" : "Resume"}
          </Button>
          <Tip label="Reset simulation">
            <Button variant="ghost" size="icon" aria-label="Reset simulation" onClick={reset}>
              <RotateCcw />
            </Button>
          </Tip>
        </div>
      </div>
      <div className="autoscale-controls">
        <label className="setting-row">
          <span>Autoscale</span>
          <Switch checked={autoscale} onCheckedChange={setAutoscale} aria-label="Autoscale" />
        </label>
        <div>
          <span className="field-label">Risk appetite</span>
          <div className="segmented" role="radiogroup" aria-label="Risk appetite">
            {riskAppetites.map((r) => (
              <Button
                key={r}
                variant="ghost"
                role="radio"
                aria-checked={risk === r}
                className={risk === r ? "active" : ""}
                onClick={() => setRisk(r)}
              >
                {RISK_LABELS[r]} · +{RISK_STEPS[r]} pp
              </Button>
            ))}
          </div>
        </div>
        <div>
          <label className="field-label" id="scale-threshold-label">
            Scale down below (Meeting Fixed rate, %)
          </label>
          <NumberStepper
            id="scale-threshold"
            ariaLabel="Scale down threshold"
            value={validThreshold ? thresholdPct : DEFAULT_THRESHOLD_PCT}
            onChange={(n) => setThresholdText(String(n))}
            min={1}
            max={99}
            step={0.5}
            unit="%"
          />
          {!validThreshold && <p className="validation-error">Enter a rate between 0 and 100.</p>}
        </div>
      </div>
      <div className="score-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Traffic</th>
              <th>Calls</th>
              <th>Meeting Fixed</th>
              <th>Sequential evidence ({METHOD_NAME})</th>
            </tr>
          </thead>
          <tbody>
            {versionIds.map((id) => {
              const t = state.totals[id];
              return (
                <tr key={id}>
                  <td>
                    <div className="score-version">
                      <Avatar id={id} small />
                      <strong>Version {id}</strong>
                      {id === "A" && <Pill>Baseline</Pill>}
                    </div>
                  </td>
                  <td>
                    <AnimatedNumber
                      value={state.traffic[id]}
                      format={(n) => fmtPoints(Math.round(n * 10) / 10)}
                    />
                  </td>
                  <td>
                    <AnimatedNumber
                      value={t.calls}
                      format={(n) => Math.round(n).toLocaleString()}
                    />
                  </td>
                  <td>
                    {t.calls ? (
                      <AnimatedNumber
                        value={(t.successes / t.calls) * 100}
                        format={(n) => `${n.toFixed(1)}%`}
                      />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <EvidenceCell view={state} id={id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Note>
        Method: {METHOD_NAME} (always-valid sequential test, Beta(1,1) mixing) · alpha ={" "}
        {DEFAULT_ALPHA} · at least {DEFAULT_MIN_TRIALS} calls · evidence restarts after each action.{" "}
        {mode === "backend" ? "Evidence comes from the backend." : "Sample data only."}
      </Note>
      <div className="autoscale-log" aria-live="polite">
        {state.events.length === 0 ? (
          <p className="neutral-text">No scaling actions yet.</p>
        ) : (
          <AnimatePresence initial={false}>
            {state.events.slice(0, 5).map((e) => (
              <motion.div
                layout="position"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="history-row"
                key={`${e.at}-${e.version}-${e.kind}`}
              >
                {e.kind === "scale-down" ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                <div>
                  <strong>
                    Version {e.version} scaled {e.kind === "scale-down" ? "down" : "up"}:{" "}
                    {fmtPoints(e.trafficBefore)} to {fmtPoints(e.trafficAfter)}
                  </strong>
                  <p>
                    {METHOD_NAME} p = {e.pValue.toFixed(3)} (alpha {DEFAULT_ALPHA}) after {e.calls}{" "}
                    calls{mode === "backend" ? "" : " · Simulated"}
                  </p>
                </div>
                <Pill tone={e.kind === "scale-down" ? "amber" : "green"}>
                  {e.kind === "scale-down" ? "Scaled down" : "Scaled up"}
                </Pill>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
