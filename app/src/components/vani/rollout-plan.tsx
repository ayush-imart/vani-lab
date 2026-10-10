// Rollout plan step of the create-experiment flow. One terminal GLID digit is one 10% unit.
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { ChipSelect } from "./chips";
import { Note, Tip } from "./common";
import { listVersions, type ExperimentRisk, type LibraryVersion } from "@/lib/experiments-api";

// One terminal GLID digit is one assignment unit, representing 10% of eligible traffic.
export const START_PCTS = [10, 20, 30, 40, 50, 60, 70, 80] as const;
export const bucketLabel = (pct: number) => {
  const units = Math.max(1, Math.min(10, Math.round(pct / 10)));
  const digits = Array.from({ length: units }, (_, digit) => digit).join(", ");
  return `GLID ending in ${digits} (10% each)`;
};

export const RISK_LABEL: Record<ExperimentRisk, string> = {
  standard: "Standard · spec defaults",
  cautious: "Cautious · 48 h stages, stricter gates",
};

export function useVersionLibrary(): LibraryVersion[] {
  const [items, setItems] = useState<LibraryVersion[]>([]);
  useEffect(() => {
    let alive = true;
    listVersions()
      .then((v) => alive && setItems(v))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);
  return items;
}

type Props = {
  startPct: number;
  setStartPct: (n: number) => void;
  risk: ExperimentRisk;
  setRisk: (r: ExperimentRisk) => void;
  baseId: string;
  challengerId: string;
  locked: boolean;
};

export function RolloutPlan({ startPct, setStartPct, risk, setRisk, baseId, challengerId, locked }: Props) {
  return (
    <section className="setup-card">
      <h2>Rollout plan</h2>
      <p className="helper">
        Choose the challenger's starting share in 10% units. Each terminal GLID digit is one
          10% unit; the rollout engine controls later steps and automatic scale-down.
      </p>
      <div className="field-grid">
        <div>
          <label className="field-label">Start size (GLID ending digits)</label>
          <ChipSelect
            value={String(startPct)}
            onChange={(v) => setStartPct(Number(v))}
            ariaLabel="Start size"
            disabled={locked}
            options={START_PCTS.map((p) => ({ value: String(p), label: `${p}% | ${bucketLabel(p)}` }))}
          />
        </div>
        <div>
          <label className="field-label">Risk appetite</label>
          <div className="flex items-center gap-2">
            <ChipSelect
              value={risk}
              onChange={(v) => setRisk(v as ExperimentRisk)}
              ariaLabel="Risk appetite"
              disabled={locked}
              options={[
                { value: "cautious", label: "Cautious" },
                { value: "standard", label: "Standard" },
              ]}
            />
            <Tip label="Fast is on the spec roadmap: it would need gates looser than the spec allows.">
              <span className="chip chip-disabled" aria-disabled="true">
                Fast (roadmap)
              </span>
            </Tip>
          </div>
        </div>
      </div>
      <p className="field-help">{RISK_LABEL[risk]}. Stored on this experiment, not globally.</p>
      <div className="chip-strip">
        <Info size={14} />
        <span>
          Split at start: {startPct}% {challengerId} ({bucketLabel(startPct)}) | {100 - startPct}% {baseId}.
          Next gates advance in 10% units through 100%, subject to rollout evidence.
        </span>
      </div>
      <Note>Without a real pre-prod run the start is recorded as a simulated gate, not a pass.</Note>
    </section>
  );
}
