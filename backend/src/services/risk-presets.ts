// Risk-appetite presets (Phase E6). Each preset is a PM-settings override that resolvePmSettings
// must accept with zero violations: presets may only make rules stricter / longer than the spec.
// Standard = spec defaults. Cautious = longer stages and cooldowns, stricter scale-up gates.
// The spec lists Cautious/Fast presets as roadmap; Fast would need looser-than-spec gates, so it is
// deliberately absent.
import type { ExperimentRisk as RiskAppetite } from "../contract";
import { ROLLOUT, resolvePmSettings, type PmSettings } from "../spec";

const PRESETS: Record<RiskAppetite, Partial<PmSettings>> = {
  standard: {},
  cautious: {
    minStageHours: ROLLOUT.minStageHours.default * 2,
    cooldownHours: ROLLOUT.cooldownHours.default * 2,
    harmlessGateMinLiftPts: 0,
    moderateGateMinLambda: ROLLOUT.gates.moderate.minLambda * 2,
    requirePmApproval: true,
  },
};

export type RiskPreset = { id: RiskAppetite; override: Partial<PmSettings> };

export function riskPresetOverride(appetite: RiskAppetite, startPct: number): Partial<PmSettings> {
  return { ...PRESETS[appetite], startPct };
}

// The preset table plus the exact settings each one resolves to (for GET /experiments/risk-presets).
export function listRiskPresets(): (RiskPreset & { settings: PmSettings; violations: string[] })[] {
  return (Object.keys(PRESETS) as RiskAppetite[]).map((id) => {
    const { settings, violations } = resolvePmSettings(PRESETS[id]);
    return { id, override: PRESETS[id], settings, violations };
  });
}
