// Pure display helpers for the staged-rollout surface. null always renders as "No data", never 0%.
import type { GuardrailStatus } from "@/lib/api-contract";

export const NO_DATA = "No data";
export const STAGES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? NO_DATA : `${n.toFixed(digits)}%`;
export const fmtPts = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? NO_DATA : `${n > 0 ? "+" : ""}${n.toFixed(digits)} pt`;
export const fmtNum = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? NO_DATA : n.toFixed(digits);
export const fmtP = (n: number | null | undefined) =>
  n === null || n === undefined ? NO_DATA : n < 0.001 ? "< 0.001" : n.toFixed(3);

export type StageState = "done" | "current" | "next";
export function stageStates(stagePct: number): { stage: number; state: StageState }[] {
  return STAGES.map((stage) => ({
    stage,
    state: stage < stagePct ? "done" : stage === stagePct ? "current" : "next",
  }));
}

export const STATUS_TONE: Record<GuardrailStatus, string> = {
  ok: "green",
  watch: "amber",
  blocked: "amber",
  rollback: "red",
  not_applicable: "neutral",
};
export const STATUS_LABEL: Record<GuardrailStatus, string> = {
  ok: "OK",
  watch: "Watch",
  blocked: "Blocked",
  rollback: "Rollback",
  not_applicable: "N/A",
};

export const PRIMARY_OPTIONS = [
  { value: "meetingFixed", label: "Meeting Fixed" },
  { value: "positiveOutcome", label: "Positive outcome" },
  { value: "conversationReach", label: "Conversation reach" },
  { value: "callbackFixed", label: "Callback fixed" },
];

// Per-primary secondary metrics (mirror of spec SECONDARIES, descriptive only: they never promote or block).
export const SECONDARY_BY_PRIMARY: Record<string, string[]> = {
  meetingFixed: ["reach40s", "onlineMeeting", "callbackRequested", "busyCallLater", "locationConfirmed"],
  positiveOutcome: ["inPersonMeeting", "onlineMeeting", "callbackFixed", "notInterested", "callbackWithoutTime"],
  conversationReach: ["callsUnder20s", "hangupAfterIntro", "hangupMidPitch", "medianCallSeconds"],
  callbackFixed: ["busyCallLater", "callbackWithoutTime", "meetingFixed"],
};

// Control buttons are only live when the run can act on them.
export function availableActions(status: string, phase: string, stagePct: number, pmApproved: boolean) {
  const active = status === "running" || status === "paused";
  return {
    approve: status === "running" && phase === "ramp" && stagePct === 90 && !pmApproved,
    rollback: active || (status === "completed" && phase === "holdback"),
    stop: active,
    tick: status === "running",
  };
}
