# What the backend must provide (frontend assumptions)

STATUS: the backend now publishes `backend/API_CONTRACT.md`; the frontend copy of its zod schemas is `src/lib/api-contract.ts` and the single client is `src/lib/api.ts`. The sections below are the original assumptions; where they differ, API_CONTRACT.md wins. Wired: /audits (+SSE), /calls, /metrics/cohorts, /metrics/versions, /autoscale/*, /notifications, POST /experiments. Not wired yet: /versions, /rubric, /notifications/preferences, /leaderboard (UI aggregates cohorts itself).

All UI data is synthetic today. Boundaries to swap: `audit-client.ts`, `scale-policy.ts` (`simulateBatch`), `performance-data.ts`.

## 1. Call audit (Eve agent powered by Sarvam) - `components/vani/audit-client.ts`
`AuditClient.submit(request, onEvent)` is the only call site (`call-window.tsx`).

- `POST /audits`
  - body: `{ version: "A"|"B"|"C", transcript: [{ speaker: "bot"|"seller", text }], durationSec }`
  - 202 response: `{ auditId }`
- `GET /audits/{auditId}/events` (Server-Sent Events, one JSON per event):
  - `{ "type": "stage", "stage": "transcript"|"guardrails"|"kpis"|"overall"|"saved", "status": "running"|"done" }` (each stage running then done, in this order)
  - `{ "type": "result", "overall": 1-5, "kpis": { "<kpiKey>": 1-5 }, "guardrailsPassed": boolean }` (after `saved`... or before; UI shows it when it arrives)
  - `{ "type": "error", "message": string }`
- `DELETE /audits/{auditId}` to cancel (UI calls `handle.cancel()` on unmount).
- Real calls to the bot (voice, not the scripted echo bot in `call-script.ts`) need a session endpoint, e.g. WebSocket `/calls/{version}`.

## 2. Performance feed - `performance-data.ts`
- Stream or poll of finished calls: `{ glid, version, scores: {overall, meetingFixed, callDuration, answerRate, locationConfirmed, callbackRequested}, at }`.
- Cohort = `glid % 10` (last digit), exactly 10 cohorts. The UI aggregates per cohort; the backend may also send the aggregates.
- KPI rates for the big numbers and verdict (`KPI_SNAPSHOT`): per version Meeting Fixed %, Call duration s, Answer %, Location confirmed %, Callback requested %.

## 3. Autoscale - `scale-policy.ts`, `sequential-test.ts`, `autoscale.tsx`
- Per version stream of `{ trials, successes }` for the primary metric (Meeting Fixed). Today simulated each 800 ms.
- Server-side owner of the traffic split: `GET/PUT /traffic` with `{ A, B, C }` in percent; scale-up moves `step` points from baseline A to the version, scale-down returns all of the version's traffic to A.
- Settings to persist: `autoscale` (default ON), `riskAppetite`, `thresholdPct`.
- Notifications: the UI pushes to its own panel + toast. A backend should also notify (e.g. WhatsApp/GChat) on scale-down.
- Decision method is mSPRT (Bernoulli, Beta(1,1) mixing truncated to the tested side of the threshold, alpha 0.05, min 50 calls). If the backend runs the test, it must return `{ pValue, logLR, trials, successes, decision }` so the UI can show the evidence.

## Decisions made by the frontend (overrule here)
- Risk appetite steps in percentage points per step: Conservative +1, Moderate +2.5, Fast +10. The brief said conservative +5 but "decide by yourself"; +1 keeps conservative < moderate < fast.
- Scale-up = version's rate reliably ABOVE the threshold; scale-down = reliably BELOW (two mSPRT tests). After any action the version's evidence restarts.
- The baseline A is never scaled up or down.
- mSPRT: alpha 0.05, mixing Beta(1,1), minTrials 50 (operational guard only). Bernoulli form, so no Normal tau is used.

## Backend status (added by the backend agent, 2026-10-09)
Implemented in `backend/` (see `backend/API_CONTRACT.md`): audits + SSE, performance feed/leaderboard/cohorts, traffic/autoscale/decisions/tick, notifications, versions, experiments, rubric, pre-prod gate (`/preprod/*`), voice session scaffold (`POST /sessions`, `/sarvam/...` proxy). Audits now also create score-only call rows. Still open: autoscale evidence from audits (needs a user decision), prompt-driven pre-prod simulation, regression metric, auth.
