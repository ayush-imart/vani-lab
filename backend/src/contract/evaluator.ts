// Per-call evaluator tags, mirroring IndiaMART's evaluator outputs (disposition, incorrect_mf,
// execdrop, latency_repetition, seller_questions). Every field is optional because evaluator tags
// arrive after the call: a call missing a tag the active primary or guardrail needs is not "fully
// judged" and waits (it is excluded from the decision maths and counted against outcome coverage).
import { z } from "zod";

export const whoEndedCallSchema = z.enum(["seller", "bot", "system"]);

export const callEvaluatorSchema = z.object({
  // disposition / sub_disposition derived
  onlineMeeting: z.boolean().optional(),
  callbackWithDatetime: z.boolean().optional(),
  callbackWithoutDatetime: z.boolean().optional(),
  busyCallLater: z.boolean().optional(),
  notInterested: z.boolean().optional(),
  hangupAfterIntro: z.boolean().optional(),
  hangupMidPitch: z.boolean().optional(),
  doNotCall: z.boolean().optional(),
  earlyDrop: z.boolean().optional(), // dropped mid-pitch, after intro, or after seller identity
  // incorrect_mf: meeting logged although the seller explicitly refused
  fakeMeeting: z.boolean().optional(),
  // latency_repetition
  isLoopy: z.boolean().optional(),
  sellerHadToRepeatCount: z.number().int().min(0).optional(),
  overlapCount: z.number().int().min(0).optional(),
  p95LatencySec: z.number().min(0).optional(),
  // seller_questions
  hasGaps: z.boolean().optional(),
  // execdrop
  whoEndedCall: whoEndedCallSchema.optional(),
});
export type CallEvaluator = z.infer<typeof callEvaluatorSchema>;

export const channelSchema = z.enum(["text", "voice"]);
export type Channel = z.infer<typeof channelSchema>;
