# Judge model findings

- `sarvam-30b` is retired on the live API: HTTP 400 "has been deprecated ... use sarvam-105b, sarvam-105b-conversations". `/v1/models` lists only those two; `/v2/models` lists glm5.3, gemma4 and sarvam-105b. [O] [S1]
- The docs list sarvam-105b-conversations at the same price as sarvam-105b; sources disagree on the figures, so confirm in billing. [S2]
- Root cause of the empty judge answers: `sarvam-105b` is a reasoning model, and its default output budget ran out while reasoning (`finish_reason: "length"`, empty content). About half of the calls through Eve were empty, and a direct probe with the full prompt gave 11 empty answers in 12 calls. [O]
- Fix: `providerOptions.sarvam {max_tokens: 8000, reasoning_effort: "low"}` in `backend/agent/agent.ts`; Eve also needs `modelContextWindowTokens` for models it doesn't know. After the fix: 10 of 10 valid, 0 empty. [O] [L: backend/agent/agent.ts]
- Scores on synthetic transcripts: good 4.1, no_answer 1.0 to 1.6, no_meeting 1.6, callback 2.3, injection 1.0 to 1.6 (never all 5s). `callbackRequested` scored 5 on a bot-offered callback before the prompt tweak; the tweak is unverified. [O] [L: backend/judge_test_progress/TESTS.md]
- User rule: LLM smoke tests are capped at 5 calls; guard in `backend/scripts/judge-smoke.ts`.

## Sources
- S1 `GET https://api.sarvam.ai/v1/models` and `/v2/models` (observed)
- S2 https://docs.sarvam.ai/api-reference-docs/pricing
- Eve docs bundled at `backend/node_modules/eve/docs/agent-config.md`
