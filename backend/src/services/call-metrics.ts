// Per-call metric extractors. One call -> boolean for each primary / guardrail / secondary metric.
// Three-valued on purpose:  true/false = measured,  undefined = the evaluator tag has not arrived
// (the call is not fully judged and must wait),  null = the metric does not apply to this call.
import type { CallRecord } from "../contract";
import {
  CONVERSATION_REACH_SECONDS,
  GUARDRAILS,
  GUARDRAIL_IDS,
  SHORT_CALL_SECONDS,
  SLOW_REPLY_SECONDS,
  type GuardrailId,
  type PrimaryId,
  type SecondaryId,
} from "../spec";

export type Channel = "text" | "voice";
export type Tri = boolean | null | undefined;

const ev = (c: CallRecord) => c.evaluator;

export function primaryValue(c: CallRecord, primary: PrimaryId): boolean | undefined {
  const meeting = c.outcome?.meetingFixed;
  switch (primary) {
    case "meetingFixed":
      return meeting;
    case "conversationReach":
      return c.outcome ? c.durationSec > CONVERSATION_REACH_SECONDS : undefined;
    case "callbackFixed":
      return ev(c)?.callbackWithDatetime;
    case "positiveOutcome": {
      if (meeting === undefined) return undefined;
      const online = ev(c)?.onlineMeeting;
      const callback = ev(c)?.callbackWithDatetime;
      if (meeting || online === true || callback === true) return true;
      return online === undefined || callback === undefined ? undefined : false;
    }
  }
}

// A voice-only guardrail does not apply to a text run.
export const guardrailApplies = (id: GuardrailId, channel: Channel): boolean =>
  !GUARDRAILS[id].voiceOnly || channel === "voice";

export function guardrailValue(c: CallRecord, id: GuardrailId, channel: Channel): Tri {
  if (!guardrailApplies(id, channel)) return null;
  const e = ev(c);
  switch (id) {
    case "fakeMeetings":
      if (c.outcome === undefined) return undefined;
      return c.outcome.meetingFixed ? e?.fakeMeeting : null; // denominator = meetings only
    case "earlyDrop":
      return e?.earlyDrop;
    case "doNotCall":
      return e?.doNotCall;
    case "botLooping":
      return e?.isLoopy;
    case "sellerHadToRepeat":
      return e?.sellerHadToRepeatCount === undefined ? undefined : e.sellerHadToRepeatCount > 0;
    case "unansweredQuestions":
      return e?.hasGaps;
    case "systemDroppedCalls":
      return e?.whoEndedCall === undefined ? undefined : e.whoEndedCall === "system";
    case "slowReplies":
      return e?.p95LatencySec === undefined ? undefined : e.p95LatencySec > SLOW_REPLY_SECONDS;
    case "talkOver":
      return e?.overlapCount === undefined ? undefined : e.overlapCount > 0;
  }
}

// "Fully judged": the primary and every applicable guardrail tag is present. Failed calls never count.
export function isFullyJudged(c: CallRecord, primary: PrimaryId, channel: Channel): boolean {
  if (c.failed) return false;
  if (primaryValue(c, primary) === undefined) return false;
  return GUARDRAIL_IDS.every((id) => guardrailValue(c, id, channel) !== undefined);
}

export function secondaryValue(c: CallRecord, id: SecondaryId): boolean | undefined {
  const e = ev(c);
  switch (id) {
    case "reach40s":
      return c.outcome ? c.durationSec > CONVERSATION_REACH_SECONDS : undefined;
    case "callsUnder20s":
      return c.outcome ? c.durationSec < SHORT_CALL_SECONDS : undefined;
    case "callbackRequested":
      return c.outcome?.callbackRequested;
    case "locationConfirmed":
      return c.outcome?.locationConfirmed;
    case "meetingFixed":
    case "inPersonMeeting":
      return c.outcome?.meetingFixed;
    case "onlineMeeting":
      return e?.onlineMeeting;
    case "busyCallLater":
      return e?.busyCallLater;
    case "callbackFixed":
      return e?.callbackWithDatetime;
    case "notInterested":
      return e?.notInterested;
    case "callbackWithoutTime":
      return e?.callbackWithoutDatetime;
    case "hangupAfterIntro":
      return e?.hangupAfterIntro;
    case "hangupMidPitch":
      return e?.hangupMidPitch;
    case "medianCallSeconds":
      return undefined; // numeric, handled separately
  }
}
