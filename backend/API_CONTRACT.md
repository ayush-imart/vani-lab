# VANI Lab backend HTTP contract

Base URL `http://localhost:8787` (frontend: `VITE_API_URL`). JSON everywhere. CORS allows `http://localhost:5173` (and 127.0.0.1:5173), methods GET/POST/PUT/DELETE/OPTIONS. Zod schemas: `backend/src/contract/index.ts` (copy it; depends only on `zod`). **Auth.** `/health` is public (and `OPTIONS` preflight). Every other route requires `Authorization: Bearer <API_SHARED_SECRET>` when the server has `API_SHARED_SECRET` set; the secret (min 32 chars) is mandatory only when `NODE_ENV=production` (env validation fails without it). Without a secret (local dev) the bearer check is skipped. Missing or wrong token -> `401 {error:{code:"unavailable"}}`. The hosted frontend reaches the API through a Vercel proxy that injects the bearer; the browser never holds it. A per-route rate limit also applies (default 60 req/min; `POST /audits` 2/min, `POST /preprod/runs` 1 per 15 min, `POST /sessions` and the Sarvam `/url` proxy 10/min) -> `429` with `Retry-After`.

**Error envelope** (all non-2xx): `{ "error": { "code": "validation_error|bad_request|not_found|conflict|internal", "message": string, "details"?: any } }`. 400 validation, 404 not found, 409 conflict, 500 internal.

GLIDs are never returned in full: only `glidLast5`. Cohort = `glid % 10` (last digit), 0-9.

## Audits (Eve agent judge)
- `POST /audits` body `{version:"A|B|C", transcript:[{speaker:"bot|seller",text}], durationSec, answered?:boolean(default true)}` -> `202 {auditId}`.
- `GET /audits/{id}/events` SSE (`data: <json>` per message, replayed from the start for late subscribers, stream closes after `result` or `error`):
  - `{type:"stage", stage:"transcript|guardrails|kpis|overall|saved", status:"running|done"}` (in that order)
  - `{type:"result", overall:1-5, kpis:{meetingFixed,callDuration,answerRate,locationConfirmed,callbackRequested}, weights:{meetingFixed:number,callDuration:number,answerRate:number,locationConfirmed:number,callbackRequested:number}, kpiBreakdown?:{meetingFixed:{reason,evidence?},callDuration:{reason,evidence?},answerRate:{reason,evidence?},locationConfirmed:{reason,evidence?},callbackRequested:{reason,evidence?}}, guardrails:[{name,passed,reason}], guardrailsPassed, notes?}` (sent after `saved` done). `weights` are the active rubric weights used to calculate the score. `kpiBreakdown` is optional for legacy records or judge outputs that did not provide rationale; clients must show it only when present and must not infer reasons from scores or transcript.
  - `{type:"error", message}` (also on cancel: "cancelled")
- `GET /audits/{id}` -> AuditRecord (`status running|done|error|cancelled`, kpis, overall, weights, optional `kpiBreakdown` with the same five KPI keys and `{reason,evidence?}` values, guardrails[{name,passed,reason}], guardrailsPassed, notes, model). The breakdown is optional for older records or judge outputs without rationale; clients must not infer it.
- `GET /audits?version=&status=&guardrailsPassed=true|false&limit=50` -> `{items: AuditRecord[]}` newest first.
- `DELETE /audits/{id}` -> `200 {id,status}`; cancels a running audit; idempotent for finished ones.
- Overall = weighted mean of the 5 KPI scores using the active rubric weights (computed in code).

## Rubric
- `GET /rubric` -> `{primaryMetric, weights:{kpi:number}, guardrails:string[], updatedAt}`.
- `PUT /rubric` body same minus `updatedAt`; weights must sum to 1 (+-0.01). Default primary `meetingFixed`, weights 0.4/0.15 x4.

## Performance
- `POST /calls` (ingest finished call) body `{glid, version, at?(epoch ms), durationSec, outcome:{answered,meetingFixed,locationConfirmed,callbackRequested}, scores?:{5 KPIs 1-5}, channel?:"text|voice"(default text), failed?:boolean, evaluator?:{evaluator tags; missing tags = "not fully judged yet"}, experimentId?:string}` -> `201 CallRecord`. Also feeds the legacy autoscale evidence (Meeting Fixed trial/success on that version). With `experimentId` the call is attached to that experiment (unknown id -> 404); the current `stage` (treatment %) is stamped server-side only while the rollout run is `running` or `paused`. `CallRecord.source` is `ingest|audit|simulated`; simulated calls never enter `/metrics`. **Idempotent:** a call with the same masked GLID (last 5 digits + bucket), `version`, client `at` and `experimentId` as a stored ingest returns that stored record with `200` and records no second autoscale outcome. Dedup needs a client `at`; without it the server stamps "now" and every post is a new call, so retrying clients must send `at`.
- All four reads below (`/calls`, `/metrics/versions`, `/metrics/cohorts`, `/leaderboard`) accept an optional `experimentId=<id>` query: only calls stamped with that experiment count; unknown id -> 404.
- `GET /calls?limit=100&since=<epoch ms>` -> `{items: CallRecord[]}` newest first (poll this for the live feed).
- `GET /metrics/versions` -> `{items:[{version,calls,outcomeCalls,meetingFixedPct,avgDurationSec,answerPct,locationConfirmedPct,callbackRequestedPct,units}]}` (all of A,B,C). `calls` counts every call (incl. score-only audit calls); `outcomeCalls` is the denominator of the rate fields. **Rate/average fields are `number | null`: `null` means no data (no call with an outcome), never 0.** `units` = `{pct:"percent of calls with a boolean outcome", avgDurationSec:"seconds"}`. These are boolean-outcome rates, NOT the 1-5 judge scores of `/leaderboard`.
- `GET /metrics/cohorts` -> `{items:[10 x {digit,calls,lastCallAt,byVersion:{A?:{calls,scores|null}}}]}`.
- `GET /metrics/verdict` -> `{primaryMetric, baseline:"A", versions:[{...versionMetrics, deltaVsBaseline:{meetingFixedPp,...}}], note}` (inputs only). Each `deltaVsBaseline` value is `null` when either side has no data; `*Pp` are percentage points, `avgDurationSec` is seconds.
- `GET /leaderboard?sort=overall|<kpi>&order=desc|asc` -> `{sort,order,items:[{rank,version,calls,scores:{overall,5 KPIs}|null}]}` (mean 1-5 JUDGE scores over calls that carried scores; not a rate; `scores:null` = no scored calls).

## Versions and experiments
- `GET /versions`, `POST /versions {label,promptText,changelog,parentId?,slot?}` (immutable; save-as-new) -> 201. `GET /versions/{id}`, `GET /versions/{id}/history` (ancestor chain, newest first), `GET /versions/diff?from=&to=` -> `{from,to,lines:[{op:same|add|del,text}],added,removed}`. Seeded ids `A`,`B`,`C`.
- `GET /experiments`, `POST /experiments {name,goal,primaryMetric,guardrails[],baselineVersionId,challengerVersionId}` -> 201, `GET /experiments/{id}`.

## Traffic and autoscale
- `GET /traffic` / `PUT /traffic {A,B,C}` (percent, sums to 100). Initial 50/25/25.
- `GET /autoscale/settings` / `PUT` partial `{autoscale,riskAppetite:conservative|moderate|fast,thresholdPct}`; defaults ON, moderate, 12. Returns also `stepPoints` (1 / 2.5 / 10).
- `POST /autoscale/outcomes {version,trials,successes}` -> 202 (adds Meeting Fixed evidence; applied on next tick).
- `POST /autoscale/tick` -> `{traffic, decisions[]}` runs the mSPRT evaluation now. A scheduler also ticks (dev: every 5 s).
- `GET /autoscale/state` -> traffic, settings, alpha, minTrials, evidence per version (below/above tests with `pValue,logLR,trials,successes,decision`), pending, totals.
- `GET /autoscale/decisions?limit=50` -> `{items:[{id,at,version,decision:scale-up|scale-down,trafficBefore,trafficAfter,pValue,logLR,trials,successes,alpha,thresholdPct,method:"mSPRT"}]}`.
- Baseline A is never scaled; scale-down returns the version's traffic to A and creates a notification.

## Notifications
- `GET /notifications` -> `{items, unread}`; `POST /notifications/{id}/read`; `POST /notifications/read-all`; `GET/PUT /notifications/preferences {inApp,gchat,whatsapp}` (gchat/whatsapp are stubs; nothing is sent externally).

## Audits create calls (changed)
- `POST /audits` accepts optional `glid` (number or digit string). It is masked and never stored on the audit; a synthetic 10-digit id is generated when omitted.
- When an audit finishes, a call row is added (`source:"audit"`, masked GLID, version, KPI scores + overall) so leaderboard, cohorts and `GET /calls` include audited calls.
- Such calls have no `outcome` (CallRecord.outcome is now optional) and do NOT feed autoscale evidence: the judge gives 1-5 scores, and turning a score into a yes/no meeting would be a heuristic. Rates in `/metrics/versions` use only calls that carry `outcome`; `calls` counts all. Decision pending from the user.

## Pre-prod gate (new)
Checks (ids): `language_matching`, `consent_before_meeting`, `respect_dnc`, `polite_objection_handling`.
- `GET /preprod/scenarios` -> `{checks:[{id,label,description}], scenarios:[{id,name,check,severity:"blocker|major|minor",description,expected:"pass|fail",transcript}]}` (8 synthetic scenarios, 2 per check).
- `POST /preprod/runs {versionId, scenarioIds?, real?:false}` -> `202 {runId}`. Default judge is the fake auditor (always passes). `real:true` uses the Eve judge, needs the server on AUDITOR=eve, max 4 scenarios, one LLM call each (counts against the budget).
- `GET /preprod/runs/{id}` -> `{id,versionId,status:"running|done|error",real,results:[{scenarioId,check,severity,expected,passed,ok,reason,model}],error?,startedAt,completedAt?}`.
- `GET /preprod/gate?versionId=` -> `{versionId,status:"pass|fail|pending",lastRunId?,checks:[{id,label,status,reasons[],scenarios:[{scenarioId,status,severity,reason?}]}]}`. Latest result per scenario across finished runs; `pending` until every scenario of a check has a result; a minor-severity failure is listed but does not fail the check.
- Limit: the simulator is a fixture (the scenario transcript), so results do not yet depend on the version prompt. A prompt-driven simulator plugs into `ScenarioSimulator` (src/services/preprod-scenarios.ts).

## Live voice sessions (scaffold, Sarvam Voice Agents; no Sarvam call made yet)
- `POST /sessions {versionId:"A|B|C"}` -> `{versionId,orgId,workspaceId,appId,baseUrl,inputSampleRate:16000,outputSampleRate:16000}`; 503 `unavailable` when SARVAM_ORG_ID / SARVAM_WORKSPACE_ID / SARVAM_APP_ID_<slot> are missing. No secret is returned.
- Browser: `new ConversationAgent({ apiKey: "", baseUrl: <baseUrl from the response>, config:{org_id, workspace_id, app_id, interaction_type: InteractionType.CALL, input_sample_rate:16000, output_sample_rate:16000, user_identifier, user_identifier_type:"custom"}, audioInterface: new BrowserAudioInterface() })` from `sarvam-conv-ai-sdk/browser`.
- `GET /sarvam/orgs/{org}/workspaces/{ws}/apps/{app}/url?interaction_type=&version=&user_identifier=&user_identifier_type=` is the proxy the SDK calls (found in sarvam-conv-ai-sdk 0.0.42 source). It adds `X-API-Key` from SARVAM_VOICE_API_KEY and forwards to `https://apps.sarvam.ai/api/app-runtime/`; only the configured org/workspace/app ids and those four query keys pass. Sarvam answers `{url, reference_id}`; the signed single-use WebSocket URL goes straight from Sarvam to the browser, so audio never touches this API.
- CORS allows headers `Content-Type, X-API-Key, Authorization`.
- Error envelope has a new code `unavailable` (503).

## Staged rollout / A-B engine (PM spec)
Source of every number: `backend/src/spec.ts`. Zod schemas: `backend/src/contract/rollout.ts` (re-exported by `contract/index.ts`). Errors: 404 unknown experiment or no run, 409 conflict (run already exists / not running), 400 validation or PM-bound violation (`details` lists each violation).

**Method.** One run per experiment: control slot (baseline version) vs challenger slot. Assignment uses the final GLID digit as one of 10 fixed units: at 10% only GLIDs ending in 0 receive treatment; at 20%, endings 0 and 1; each added digit contributes exactly 10%. Treatment is deterministic and cumulative, so an assigned seller keeps the same arm as the rollout advances. Stages advance in 10% increments from the configured start through 90%, followed by a gated promotion to 100%. The final promotion requires PM approval; after promotion, a 10% control holdback (one terminal-digit unit) is preserved for 7 days, so effective treatment remains at 90% during that period. Minimum 24 h per stage plus 24 h cooldown. Winner decision = two-sample mSPRT on the primary lift (B - A), half-normal mixture with tau = smallest win worth shipping (default 3 pts), alpha 0.05, stage-stratified (inverse-variance) so ramping does not bias the lift; always-valid p = min(1, 1/peak Lambda). Gates: 10->20 lift >= -1 pt and guardrails ok; 20->90 lift >= +1 pt and Lambda >= 5; at 90->100 lift >= smallest win, Lambda >= 20 and PM approval. Nine guardrails are compared B vs A in the same run (fake meetings: B > 1.5 x A proven; slow replies: P95 +0.5 s; the rest: proven worse). Validity gates run before every decision: SRM chi-square p < 0.001 pauses and freezes; an outcome-coverage floor (default 80% judged) holds decisions. Secondary metrics and judge scores are reported but never decide (`usedForDecision:false`). Known limitation: nine simultaneous always-valid guardrail tests, each alpha 0.05, inflate the familywise false-rollback risk (see `SUBMISSION.md`).

- `GET /spec` -> spec snapshot `{source, primaries, secondaries, guardrails, preprod, stats, stages, rollout, assignment, engineGuards, pmDefaults}`.
- `POST /experiments/{id}/start` body (all optional) `{primary: meetingFixed|positiveOutcome|conversationReach|callbackFixed, smallestWinPts(1-5), startPct(10-80, multiple of 10), maxLengthDays(1-30), requirePmApproval, minStageHours, cooldownHours, holdbackPct(0 or 10), holdbackDays(3-14), harmlessGateMinLiftPts, moderateGateMinLiftPts, moderateGateMinLambda, coverageFloor, guardrailTolerancePts:{<guardrailId>:pts}, channel:"text|voice", windowStart, windowEnd, allowSimulatedGate:boolean}` -> `201 RolloutRun`. The challenger's pre-prod gate (`GET /preprod/gate/{versionId}` logic) must be `pass` (run records `preprodGate:"pass"`), else 409 unless `allowSimulatedGate:true` (demo override: `preprodGate:"simulated"`, and the start decision's reason records the override and the gate status). Gates, tolerances and coverage may only be made stricter; stage time and cooldown only longer (else 400). A future `windowStart` leaves the run `scheduled`. A second start for the same experiment is 409.
- `GET /rollouts` -> `{items: RolloutRun[]}`.
- `GET /experiments/{id}/rollout` -> `{run, evidence, nextGate}` (`nextGate` = plain-language next requirement or null).
- `POST /experiments/{id}/rollout/tick` -> `RolloutDecision`; evaluates now and may hold, advance, step down, roll back, pause or promote. On a run that is not `running` (paused, scheduled before its window, or finished) it returns a `hold`/`not_running` result that is **not** appended to the decision log.
- `POST /experiments/{id}/rollout/approve` -> `RolloutRun`; PM approval for the final 90 -> 100 promotion. 409 unless the run is `running` in the ramp phase at its final stage (normally 90%). Any engine step down clears the approval (`pmApproved:false`).
- `POST /experiments/{id}/rollout/resume` -> `RolloutRun`; PM resumes a `paused` run (e.g. after an SRM freeze): status `running`, `frozen:false`, same stage; logged as `resume`/`resumed` with actor `pm`. 409 if the run is not paused. The engine never unfreezes a paused run by itself.
- `POST /experiments/{id}/rollout/rollback` -> `RolloutRun`; challenger back to 0%, verdict `rolled_back_manually`.
- `POST /experiments/{id}/rollout/stop` -> `RolloutRun`; ends the run (status `ended`).
- `GET /experiments/{id}/rollout/decisions` -> `{items: RolloutDecision[]}` (audit trail).
- `GET /experiments/{id}/rollout/report` -> `{run, method:{name,alpha,tau,notes[]}, evidence, decisions[], impact:{basis:"holdback_lift|stopping_lift|none",liftPts|null,note}, verdict|null, generatedAt}`.
- `GET /experiments/{id}/assignment?glid=<digits>` -> `{experimentId, bucket, arm:"treatment|control", slot, stagePct}` (`bucket` is the final digit 0-9; everyone is control unless the run is running or paused).
- `GET /assignment?glid=<digits>&pct=10` -> `{bucket, treatmentPct, arm, treatmentBuckets}` (stateless helper; `pct` 0 or a multiple of 10 through 100, default 10).
- `POST /assignment/balance` body `{pct(1-100), sellers:[{glid,leadType,firstCall}]}` (2..100000 sellers) -> balance report for that split (thresholds are spec placeholders).
- `POST /simulations/rollout` body `{scenario:"true_lift|bad_variant|no_difference"(default true_lift), trueLiftPts(-30..30, default +5), baselinePct, badVariantPct(default 3.3), callsPerDay(100-10000, default 2350), days(1-30, default 7), evaluateEveryHours(1-24, default 12), primary, approveAtFinalGate(default true), controlSlot, challengerSlot, seed}` -> simulation result with a decision timeline. **SYNTHETIC**: it runs the real engine on generated paired calls in a throwaway in-memory store; it never touches `/metrics`, live runs or real data, and is not evidence about any prompt.

**Key DTOs** (`contract/rollout.ts`):
- `RolloutRun`: `{id, experimentId, status: scheduled|running|paused|completed|rolled_back|ended, phase: ramp|holdback|done, verdict?: winner|losing|inconclusive|rolled_back_manually, primary, channel, controlSlot, challengerSlot, settings, stages[], stagePct, traffic:{control,treatment}, frozen, pmApproved, preprodGate: pass|simulated, simulated, windowStart, windowEnd?, startedAt, stageEnteredAt, lastChangeAt, endedAt?, holdback?}`.
- `RolloutEvidence`: `{primary, primaryId, holdback|null, guardrails[], validity:{srm, coverage}, failedCalls, secondary[], judgeEvidence, calls:{total,judged}}`. `primary` (LiftEvidence) has `rateControl, rateTreatment, liftPts, stdErrPts` as `number | null` (null = no data), per-stage rows, `lambdaBenefit/lambdaHarm`, running-peak `peakLambda*`, always-valid `pBenefit/pHarm`, `assumptions[]`. `guardrails[].status` is `ok|watch|blocked|rollback|not_applicable`; its rate and excess fields are nullable. `secondary[]` values are nullable, and `judgeEvidence` is a mean 1-5 judge score (not a rate).
- `RolloutDecision`: `{id, experimentId, at, actor: engine|pm, action, trigger, reason, phase, stage, fromStage, toStage, trafficBefore, trafficAfter, lambdaBenefit, lambdaHarm, peakLambdaBenefit, peakLambdaHarm, liftPts|null, guardrailStatus, srmPValue|null, coverage|null, method, evidence}`. `action` is one of start|hold|advance|promote|step_down|rollback|pause|resume|end|complete|alert|approve; `trigger` is a closed enum in `contract/rollout.ts` (e.g. `gate_met`, `srm_failed`, `primary_proven_worse`, `guardrail_proven_worse`, `awaiting_pm_approval`, `holdback_lift_shrank`, `pm_rollback`).

## Voice sessions and auth
The Sarvam `/url` proxy goes through the same bearer check as every other route. On the hosted setup the browser must call it through the Vercel proxy (`PUBLIC_API_URL` = the proxy), because a direct call without the bearer gets 401.

## Reserved (not built)
Regression metric, per-user auth/RLS, prompt-driven pre-prod simulation, GChat/WhatsApp senders, autoscale evidence from audits (needs a decision), ingest idempotency, multi-experiment scoping in the UI (Phase E in project_progress, noted only).
