import { readFileSync } from "node:fs";
import { Client } from "eve/client";
import { judgeVerdictSchema, overallScore } from "../src/judge/rubric";

const host = process.env.EVE_HOST ?? "http://127.0.0.1:2000";
const repeat = Number(process.env.REPEAT ?? 1);
const only = process.env.ONLY;
const MAX_LLM_CALLS = 5; // dev budget: LLM smoke tests must not exceed 5 calls

const guardrails = ["no_abusive_language", "no_false_claims", "no_pii_requested"];
const transcripts = JSON.parse(readFileSync("test-data/transcripts.json", "utf8")) as {
  id: string;
  expect: string;
  text: string;
  durationSec: number;
  answered: boolean;
}[];

const selected = transcripts.filter((x) => !only || x.id === only);
if (selected.length * repeat > MAX_LLM_CALLS) {
  throw new Error(`Refusing ${selected.length * repeat} LLM calls; budget is ${MAX_LLM_CALLS}`);
}
const client = new Client({ host });
console.log("health:", JSON.stringify(await client.health()));

for (const t of selected) {
  for (let run = 1; run <= repeat; run += 1) {
    const message = `Score this call.\nMetadata: durationSec=${t.durationSec}, answered=${t.answered}\nGuardrails: ${guardrails.join(", ")}\nTranscript:\n<<<\n${t.text}\n>>>`;
    const { response } = await client.sessions.create({
      message,
      outputSchema: judgeVerdictSchema,
    });
    const result = await response.result();
    const parsed = judgeVerdictSchema.safeParse(result.data);
    console.log(`\n[${t.id}] run ${run} (expect: ${t.expect})`);
    console.log("raw:", JSON.stringify(result.data));
    console.log(
      parsed.success
        ? `valid; overall=${overallScore(parsed.data.scores)}`
        : `INVALID: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
}
