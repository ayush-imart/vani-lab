import { defineAgent } from "eve";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const sarvam = createOpenAICompatible({
  name: "sarvam",
  baseURL: "https://api.sarvam.ai/v1",
  headers: { "api-subscription-key": process.env.SARVAM_API_KEY ?? "" },
});

export default defineAgent({
  model: sarvam(process.env.SARVAM_JUDGE_MODEL ?? "sarvam-105b"),
  modelContextWindowTokens: 64_000, // sarvam-30b is retired; 105b context is 128K, 64K is a safe lower bound
  // sarvam-105b is a reasoning model: the default output budget can run out mid-reasoning (finish_reason "length", empty answer).
  modelOptions: { providerOptions: { sarvam: { max_tokens: 8000, reasoning_effort: "low" } } },
});
