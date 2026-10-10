// Synthetic call generator for the A/B simulator and for tests. Every rate defaults to the spec's
// PS07 baseline; scenarios move only the primary rate (or a named guardrail). Nothing here is real
// seller data. Output carries the same fields a judged call carries (outcome + evaluator tags).
import type { CallIngest } from "../contract";
import type { Rng } from "../lib/rng";
import { GUARDRAILS, GUARDRAIL_IDS, PRIMARIES, type GuardrailId, type PrimaryId } from "../spec";
import type { Channel } from "./call-metrics";

export type SimProfile = {
  meetingFixed: number; // all rates are proportions 0..1
  onlineMeeting: number;
  callbackWithDatetime: number;
  callbackWithoutDatetime: number;
  callbackRequested: number;
  busyCallLater: number;
  notInterested: number;
  hangupAfterIntro: number;
  hangupMidPitch: number;
  locationConfirmed: number;
  reach40s: number;
  under20sGivenNoReach: number;
  guardrails: Record<GuardrailId, number>; // fakeMeetings is a share of meeting calls
};

const share = (pctValue: number) => pctValue / 100;

export function baselineProfile(): SimProfile {
  return {
    meetingFixed: share(PRIMARIES.meetingFixed.baselinePct),
    onlineMeeting: 0.021,
    callbackWithDatetime: share(PRIMARIES.callbackFixed.baselinePct),
    callbackWithoutDatetime: 0.062,
    callbackRequested: 0.118,
    busyCallLater: 0.154,
    notInterested: 0.107,
    hangupAfterIntro: 0.1,
    hangupMidPitch: 0.115,
    locationConfirmed: 0.476,
    reach40s: share(PRIMARIES.conversationReach.baselinePct),
    under20sGivenNoReach: 0.499 / (1 - 0.31),
    guardrails: Object.fromEntries(GUARDRAIL_IDS.map((id) => [id, share(GUARDRAILS[id].baselinePct)])) as Record<GuardrailId, number>,
  };
}

// Returns a profile whose primary metric has the requested rate (percent), everything else unchanged.
export function withPrimaryRate(profile: SimProfile, primary: PrimaryId, ratePct: number): SimProfile {
  const rate = share(ratePct);
  switch (primary) {
    case "meetingFixed":
      return { ...profile, meetingFixed: rate };
    case "conversationReach":
      return { ...profile, reach40s: rate };
    case "callbackFixed":
      return { ...profile, callbackWithDatetime: rate };
    case "positiveOutcome": {
      // positive = meeting OR online OR callback-with-time (independent draws): solve for the callback share
      const others = 1 - (1 - profile.meetingFixed) * (1 - profile.onlineMeeting);
      const callback = rate <= others ? 0 : (rate - others) / (1 - others);
      return { ...profile, callbackWithDatetime: Math.min(1, callback) };
    }
  }
}

export function withGuardrailRate(profile: SimProfile, id: GuardrailId, ratePct: number): SimProfile {
  return { ...profile, guardrails: { ...profile.guardrails, [id]: share(ratePct) } };
}

export type DrawOptions = {
  channel?: Channel;
  p95LatencyShiftSec?: number; // voice: added to a slow/fast call's P95 latency
  missingTagRate?: number; // probability that the evaluator tags have not arrived (call not fully judged)
};

export type DrawnCall = Pick<CallIngest, "durationSec" | "outcome" | "evaluator" | "channel">;

const bern = (rng: Rng, p: number): boolean => rng() < p;

export function drawCall(rng: Rng, profile: SimProfile, options: DrawOptions = {}): DrawnCall {
  const channel = options.channel ?? "text";
  const g = profile.guardrails;
  const meeting = bern(rng, profile.meetingFixed);
  const reach = bern(rng, profile.reach40s);
  const durationSec = reach
    ? 41 + Math.floor(rng() * 140)
    : bern(rng, profile.under20sGivenNoReach)
      ? 3 + Math.floor(rng() * 17)
      : 20 + Math.floor(rng() * 21);
  const outcome = {
    answered: true,
    meetingFixed: meeting,
    locationConfirmed: bern(rng, profile.locationConfirmed),
    callbackRequested: bern(rng, profile.callbackRequested),
  };
  if (bern(rng, options.missingTagRate ?? 0)) return { durationSec, outcome, channel };
  const slow = bern(rng, g.slowReplies);
  const evaluator: NonNullable<CallIngest["evaluator"]> = {
    onlineMeeting: bern(rng, profile.onlineMeeting),
    callbackWithDatetime: bern(rng, profile.callbackWithDatetime),
    callbackWithoutDatetime: bern(rng, profile.callbackWithoutDatetime),
    busyCallLater: bern(rng, profile.busyCallLater),
    notInterested: bern(rng, profile.notInterested),
    hangupAfterIntro: bern(rng, profile.hangupAfterIntro),
    hangupMidPitch: bern(rng, profile.hangupMidPitch),
    doNotCall: bern(rng, g.doNotCall),
    earlyDrop: bern(rng, g.earlyDrop),
    isLoopy: bern(rng, g.botLooping),
    sellerHadToRepeatCount: bern(rng, g.sellerHadToRepeat) ? 1 + Math.floor(rng() * 3) : 0,
    hasGaps: bern(rng, g.unansweredQuestions),
    whoEndedCall: bern(rng, g.systemDroppedCalls) ? "system" : bern(rng, 0.5) ? "seller" : "bot",
    ...(meeting ? { fakeMeeting: bern(rng, g.fakeMeetings) } : {}),
    ...(channel === "voice"
      ? {
          p95LatencySec: Math.max(0, (slow ? 3.5 + rng() : 1.2 + rng()) + (options.p95LatencyShiftSec ?? 0)),
          overlapCount: bern(rng, g.talkOver) ? 1 + Math.floor(rng() * 2) : 0,
        }
      : {}),
  };
  return { durationSec, outcome, evaluator, channel };
}
