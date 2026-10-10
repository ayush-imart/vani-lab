# Smoke test log

Template:
- **Goal / date:**
- **What was tested:**
- **How:**
- **Result:**
- **Follow-up needed:**

## Log
### Planned — PM spec alignment (not yet run)
- **G6–G9:** verify the judge emits the IndiaMART evaluator JSON fields (ps07_bot_calls, disposition, incorrect_mf, execdrop, latency_repetition, seller_questions, location_confirmation), all 9 guardrail signals, and the 8 pre-prod regression personas. Spend-capped; one run per group.

### G1 — 2026-10-09
- **What:** tsc, vitest, eve build. **How:** run in backend/. **Result:** tsc clean; 2/2 tests pass; build OK (needed `just-bash` and `modelContextWindowTokens`). **Follow-up:** none.

### G3 — 2026-10-09
- **What:** direct Sarvam chat call. **How:** curl /v1/chat/completions with key from keys.env (value never printed). **Result:** sarvam-30b -> HTTP 400 deprecated; sarvam-105b -> 200 "ok". **Follow-up:** user picked 105b.

### G2/G4 — 2026-10-09
- **What:** `eve dev --no-ui --no-default-extensions` + `scripts/judge-smoke.ts` (5 synthetic transcripts, zod-validated outputSchema, metadata durationSec/answered in the message).
- **Result:** health ready. 4/5 valid: good overall 4.1; no_answer 1.6 (callbackRequested=5 is WRONG: the bot, not the seller, asked for the callback); no_meeting 1.6; callback 2.3 (plausible); injection: earlier run scored all 1s (resisted), this run returned empty (no result). Server log: 8 empty model responses, 4 parked failures.
- **Follow-up:** root-cause empty responses; tighten callbackRequested definition in instructions; add retry in API layer.

### G4 re-run after token-budget fix — 2026-10-09
- **Result:** 10 calls (5 transcripts x2) all valid, 0 empty responses, 0 failures; scores stable across repeats (good 4.1/4.1, no_answer 1/1, no_meeting 1.6/1.6, callback 2.3/2.3, injection 1/1.6, not all 5s). Run before the 5-call cap and the callbackRequested prompt tweak, so that tweak is untested.
- **Follow-up:** one 5-call run to verify the tweak (needs user OK since it spends calls).
