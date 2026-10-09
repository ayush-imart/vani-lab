# VANI Lab backend HTTP contract

Base URL `http://localhost:8787` (frontend: `VITE_API_URL`). JSON everywhere. CORS allows `http://localhost:5173` (and 127.0.0.1:5173), methods GET/POST/PUT/DELETE/OPTIONS. Zod schemas: `backend/src/contract/index.ts` (copy it; depends only on `zod`). No auth yet.

**Error envelope** (all non-2xx): `{ "error": { "code": "validation_error|bad_request|not_found|conflict|internal", "message": string, "details"?: any } }`. 400 validation, 404 not found, 409 conflict, 500 internal.

GLIDs are never returned in full: only `glidLast5`. Cohort = `glid % 10` (last digit), 0-9.

## Audits (Eve agent judge)
- `POST /audits` body `{version:"A|B|C", transcript:[{speaker:"bot|seller",text}], durationSec, answered?:boolean(default true)}` -> `202 {auditId}`.
- `GET /audits/{id}/events` SSE (`data: <json>` per message, replayed from the start for late subscribers, stream closes after `result` or `error`):
  - `{type:"stage", stage:"transcript|guardrails|kpis|overall|saved", status:"running|done"}` (in that order)
  - `{type:"result", overall:1-5, kpis:{meetingFixed,callDuration,answerRate,locationConfirmed,callbackRequested}, guardrailsPassed}` (sent after `saved` done)
  - `{type:"error", message}` (also on cancel: "cancelled")
- `GET /audits/{id}` -> AuditRecord (`status running|done|error|cancelled`, kpis, overall, guardrails[{name,passed,reason}], guardrailsPassed, notes, model).
- `GET /audits?version=&status=&guardrailsPassed=true|false&limit=50` -> `{items: AuditRecord[]}` newest first.
- `DELETE /audits/{id}` -> `200 {id,status}`; cancels a running audit; idempotent for finished ones.
- Overall = weighted mean of the 5 KPI scores using the active rubric weights (computed in code).

## Rubric
- `GET /rubric` -> `{primaryMetric, weights:{kpi:number}, guardrails:string[], updatedAt}`.
- `PUT /rubric` body same minus `updatedAt`; weights must sum to 1 (+-0.01). Default primary `meetingFixed`, weights 0.4/0.15 x4.

## Performance
- `POST /calls` (ingest finished call) body `{glid, version, at?(epoch ms), durationSec, outcome:{answered,meetingFixed,locationConfirmed,callbackRequested}, scores?:{5 KPIs 1-5}}` -> `201 CallRecord`. Also feeds the autoscale evidence (Meeting Fixed trial/success on that version).
- `GET /calls?limit=100&since=<epoch ms>` -> `{items: CallRecord[]}` newest first (poll this for the live feed).
- `GET /metrics/versions` -> `{items:[{version,calls,meetingFixedPct,avgDurationSec,answerPct,locationConfirmedPct,callbackRequestedPct}]}` (all of A,B,C).
- `GET /metrics/cohorts` -> `{items:[10 x {digit,calls,lastCallAt,byVersion:{A?:{calls,scores|null}}}]}`.
- `GET /metrics/verdict` -> `{primaryMetric, baseline:"A", versions:[{...versionMetrics, deltaVsBaseline:{meetingFixedPp,...}}], note}` (inputs only).
- `GET /leaderboard?sort=overall|<kpi>&order=desc|asc` -> `{sort,order,items:[{rank,version,calls,scores:{overall,5 KPIs}|null}]}` (mean 1-5 scores).

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

## Reserved (not built)
Regression metric, auth, Vercel deploy, prompt-driven pre-prod simulation, GChat/WhatsApp senders, autoscale evidence from audits (needs a decision).
