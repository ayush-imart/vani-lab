# skills.md: build journey and tools

Problem 5, Agent A/B Testing & Auto-Rollout. Product name: VANI Lab. Nothing below claims a measured business win: all rollout results in this repo come from a synthetic simulator, and no real prompt has been A/B tested on real traffic.

## What we built

- A staged A/B rollout engine for VANI prompt versions: define an experiment, assign calls by seller bucket, ramp traffic 10 -> 25 -> 50 -> 100%, decide a winner statistically, stop a worse variant early, keep an audit trail and a one-step rollback.
- A judge (Eve agent on `sarvam-105b`) that scores call transcripts 1-5 on five KPIs and runs a pre-production scenario gate.
- A frontend (TanStack Start) for setup, pipeline view, performance, scale-up, prompts and live voice calls.
- Three Sarvam Voice Agents (A/B/C) for live voice sessions through the Sarvam browser SDK.

## Statistical method (what the code does)

- Test: two-sample mSPRT on the primary metric lift (B minus A). Half-normal mixture over the true lift, scale tau = smallest win worth shipping (default +3 pts). Alpha 0.05. Always-valid p-value = min(1, 1 / running-max Lambda), so checking continuously does not inflate false positives for that one test. Code: `backend/src/stats/msprt-two-sample.ts`.
- Stage-stratified: lift is estimated per traffic stage and combined by inverse variance, so ramping traffic does not bias the lift.
- Assignment: last two digits of the seller GLID give 100 buckets; 10% = buckets 00-09, 25% = 00-24, etc. Stateless and repeatable, so a seller stays in one arm. Code: `backend/src/services/assignment.ts`.
- Gates: 10->25 needs lift >= -1 pt and guardrails ok; 25->50 needs lift >= +1 pt and Lambda >= 5; 50->100 needs lift >= smallest win, Lambda >= 20 and PM approval. 24 h minimum per stage and 24 h cooldown. 5% holdback for 7 days after promotion, with an alert if the lift shrinks by more than half.
- Early stop: primary proven worse (harm Lambda >= 20), lift at or below -1 pt with moderate evidence, or a guardrail proven worse, rolls traffic back to A.
- Guardrails (9, B vs A in the same run): fake meetings, early drop, do-not-call, bot looping, seller had to repeat, unanswered questions, system-dropped calls, slow replies (voice), talk-over (voice).
- Validity gates before any decision: sample-ratio mismatch (chi-square p < 0.001 pauses and freezes) and an outcome-coverage floor (80% judged by default).
- Secondary metrics and judge scores are reported but never used for a decision. If evidence is insufficient the verdict is "inconclusive", not a promotion.
- Every number comes from `backend/src/spec.ts`, taken from the PM spec in `docs/pm-guardrails-and-autoscale-spec.md`. Some values are the spec's own placeholders (pre-prod tolerances, coverage floor).

## Simulated vs real

| Part | Status |
| --- | --- |
| Rollout engine, statistics, guardrails, assignment, decision log, report | Real code, covered by tests (backend vitest 99/99, `tsc` clean) |
| `POST /simulations/rollout` | Synthetic paired calls through the real engine. In a simulated +5 pt run the variant was promoted at about day 3; a simulated bad variant (3.3% vs 18.3%) was stopped at 10% traffic after about 1.5 days. These show the method works as designed, not that any prompt improves meetings |
| Call outcomes used in the demo | Synthetic. No customer or call data is used in the demo or committed |
| Judge (Eve + `sarvam-105b`) | Real model calls; a small number were run (one real audit scored 4.1; a 10/10 valid-output smoke run). Judge scores are evidence only and do not drive decisions |
| Pre-prod gate | Scenarios are fixtures; the default fake judge always passes. The version prompt does not yet change the result |
| Voice sessions | Voice Agents A/B/C exist; the signed-URL proxy returned a session URL for A. Full real-audio calls on every variant have not been verified in this repo's trackers |
| Persistence | In-memory on Render Free (state is lost on restart). Supabase SQL migrations exist but were never run against a Postgres, so Supabase-backed persistence is unverified |

## Known limitations

- Guardrail multiplicity: 9 guardrails run as simultaneous always-valid tests, each at alpha 0.05, so the familywise false-rollback risk is higher than 5%. We saw this in a simulated +5 pt run: do-not-call was flagged "proven worse" during holdback although the simulation had no real harm there. This is a spec-design question for the PM (for example a corrected per-guardrail alpha); we did not change it.
- The stage-combined lift assumes the true lift is the same in every stage and uses a normal approximation; arms with fewer than 30 calls in a stage are skipped.
- SRM assumes answered-call volume is uniform over the 100 GLID buckets.
- Baselines for Positive outcome (~18%) and Callback fixed (~6.2%) are approximate in the spec and should be recomputed.
- No ingest de-duplication: the same call posted twice counts twice.
- Judge-to-outcome mapping is not defined, so audited calls do not feed rollout evidence.

## Tools and how we used them

- Sarvam: Voice Agents (live calls, browser SDK `sarvam-conv-ai-sdk`), `sarvam-105b` as judge model (needed `reasoning_effort: low` and a larger token budget), Sarvam docs MCP for API details.
- Eve (agent framework) for the judge service; Hono + zod for the API; vitest for tests; TypeScript throughout.
- Frontend: TanStack Start, Tailwind.
- Deploy: Vercel Hobby (frontend and proxy that injects the API bearer), Render Free (API + Eve), Supabase (planned persistence).
- Claude Code as the coding assistant, with parallel sub-agents for backend, frontend, docs and review. Humans set the scope, supplied the PM spec and reviewed decisions.

## Build journey

1. Frontend rework and backend API with audits, SSE, performance feed, versions, experiments, a one-sample autoscale test, notifications, pre-prod gate and a voice-session scaffold.
2. Judge: `sarvam-30b` was retired; `sarvam-105b` ran out of output budget until `reasoning_effort` was lowered.
3. Audits of the first engine found it tested each arm against an absolute threshold (not B vs A) and had no run report, promotion or rollback.
4. PM spec adopted as the source of truth; engine rebuilt as B-vs-A mSPRT with guardrails, staged rollout, SRM and coverage gates, holdback, report and simulator.
5. Honesty fixes: nullable metrics ("no data" instead of 0%), explicit units, labelled synthetic data, auth only when `NODE_ENV=production`.

## Reproduce

```powershell
cd backend; npm ci; npm run typecheck; npm test      # tsc clean, vitest 99/99 at last run
cd backend; npm run start:render                      # API on :8787
# POST /simulations/rollout {"scenario":"true_lift","trueLiftPts":5}   (synthetic)
# POST /simulations/rollout {"scenario":"bad_variant"}                  (synthetic early stop)
```

See `backend/API_CONTRACT.md` for every endpoint and `SUBMISSION.md` for the bundle checklist.
