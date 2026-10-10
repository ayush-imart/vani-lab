// Auditor port: the audit service only knows this interface. The real adapter calls the Eve agent
// in backend/agent (run `npm run eve:dev`); a deterministic fake exists for local runs and tests.
import { Client } from "eve/client";
import type { VersionSlot } from "../contract";
import { judgeVerdictSchema } from "../judge/rubric";

export type AuditorInput = {
  version: VersionSlot;
  transcript: { speaker: "bot" | "seller"; text: string }[];
  durationSec: number;
  answered: boolean;
  guardrails: string[];
  guardrailNotes?: Record<string, string>; // optional definitions, sent to the judge
};
export type AuditorOutput = { raw: unknown; model: string };
export interface AuditorPort {
  audit(input: AuditorInput): Promise<AuditorOutput>;
}

export function buildJudgeMessage(input: AuditorInput): string {
  const text = input.transcript
    .map((t) => `${t.speaker === "bot" ? "Bot" : "Seller"}: ${t.text}`)
    .join("\n");
  return [
    "Score this call.",
    `Metadata: durationSec=${input.durationSec}, answered=${input.answered}`,
    `Guardrails: ${input.guardrails.join(", ")}`,
    ...Object.entries(input.guardrailNotes ?? {}).map(([k, v]) => `Guardrail definition ${k}: ${v}`),
    `Transcript:\n<<<\n${text}\n>>>`,
  ].join("\n");
}

export function createEveAuditor(host: string, model = "sarvam-105b", secret?: string): AuditorPort {
  const client = new Client({
    host,
    ...(secret ? { auth: { basic: { username: "vani-api", password: secret } } } : {}),
  });
  return {
    async audit(input) {
      const { response } = await client.sessions.create({
        message: buildJudgeMessage(input),
        outputSchema: judgeVerdictSchema,
      });
      const result = await response.result();
      return { raw: result.data, model };
    },
  };
}

// Deterministic stand-in (AUDITOR=fake): flat middle scores, all guardrails pass. Not a judge.
export function createFakeAuditor(delayMs = 0): AuditorPort {
  return {
    async audit(input) {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return {
        model: "fake-auditor",
        raw: {
          scores: {
            meetingFixed: 3,
            callDuration: 3,
            answerRate: input.answered ? 3 : 1,
            locationConfirmed: 3,
            callbackRequested: 3,
          },
          guardrails: input.guardrails.map((name) => ({
            name,
            passed: true,
            reason: "fake auditor",
          })),
          notes: "fake auditor output, not a real judgement",
        },
      };
    },
  };
}
