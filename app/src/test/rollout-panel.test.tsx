import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RolloutPanel } from "@/components/vani/rollout-panel";

const emptyEvidence = {
  method: "mSPRT",
  alpha: 0.05,
  tau: 3,
  ratio: 0.1,
  nControl: 0,
  nTreatment: 0,
  rateControl: null,
  rateTreatment: null,
  liftPts: null,
  stdErrPts: null,
  stages: [],
  lambdaBenefit: 1,
  lambdaHarm: 1,
  peakLambdaBenefit: 1,
  peakLambdaHarm: 1,
  pBenefit: 1,
  pHarm: 1,
  assumptions: [],
};

const run = {
  id: "r1",
  experimentId: "e1",
  status: "running",
  phase: "ramp",
  primary: "meetingFixed",
  channel: "text",
  controlSlot: "A",
  challengerSlot: "B",
  settings: {
    primary: "meetingFixed", smallestWinPts: 3, startPct: 10, maxLengthDays: 7, requirePmApproval: true,
    minStageHours: 24, cooldownHours: 24, holdbackPct: 5, holdbackDays: 7, harmlessGateMinLiftPts: -1,
    moderateGateMinLiftPts: 1, moderateGateMinLambda: 5, coverageFloor: 0.8, guardrailTolerancePts: {},
  },
  stages: [10, 25, 50, 100],
  stagePct: 25,
  traffic: { control: 75, treatment: 25 },
  frozen: false,
  pmApproved: false,
  preprodGate: "pass",
  simulated: false,
  windowStart: "2026-10-01T00:00:00Z",
  startedAt: "2026-10-01T00:00:00Z",
  stageEnteredAt: "2026-10-01T00:00:00Z",
  lastChangeAt: "2026-10-01T00:00:00Z",
};

const evidence = {
  primary: emptyEvidence,
  primaryId: "meetingFixed",
  holdback: null,
  guardrails: [
    {
      id: "earlyDrop",
      label: "Early drop",
      status: "watch",
      rule: "r",
      nControl: 0,
      nTreatment: 0,
      rateControlPct: null,
      rateTreatmentPct: null,
      excessPts: null,
      tolerancePts: 5,
      lambdaHarm: 1,
      peakLambdaHarm: 1,
      pHarm: 1,
      evidenceSufficient: false,
      reason: "needs data",
    },
  ],
  validity: {
    srm: { method: "chi2", threshold: 0.001, chiSquare: 0, df: 1, pValue: null, failed: false, stages: [] },
    coverage: { judged: 0, total: 0, share: null, floor: 0.8, ok: false },
  },
  failedCalls: { treatmentCalls: 0, treatmentFailed: 0, pct: null },
  secondary: [],
  judgeEvidence: {
    signal: "judge_evidence",
    scale: "mean judge score, 1-5 (not a rate)",
    usedForDecision: false,
    control: { calls: 0, meanOverall: null },
    treatment: { calls: 0, meanOverall: null },
  },
  calls: { total: 0, judged: 0 },
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("RolloutPanel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows No data for null metrics and the next gate, with approve disabled below 50%", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/rollouts")) return json({ items: [run] });
        if (url.endsWith("/rollout")) return json({ run, evidence, nextGate: "Need lift above -1 pt" });
        return json({ items: [] });
      }),
    );
    render(
      <TooltipProvider>
        <RolloutPanel />
      </TooltipProvider>,
    );
    expect(await screen.findByText(/Need lift above -1 pt/)).toBeInTheDocument();
    expect(screen.getAllByText("No data").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Approve 50% to 100%/ })).toBeDisabled();
    expect(screen.getByText("Watch")).toBeInTheDocument();
  });

  it("labels simulation output as SIMULATED", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    render(
      <TooltipProvider>
        <RolloutPanel />
      </TooltipProvider>,
    );
    expect(await screen.findByText(/Backend not reachable/)).toBeInTheDocument();
    expect(screen.getAllByText("SIMULATED").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Bad variant/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Bad variant/ }));
  });
});
