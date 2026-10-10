# Findings and test log (real results only)

## Current status (2026-10-10, real)
- Backend: `tsc --noEmit` clean; `vitest run` → **99 / 99 pass**, 10 test files (re-run 2026-10-10; includes spec, two-sample mSPRT/stats, guardrails, rollout policy, rollout simulator and pre-prod gate tests).
- Frontend: last reported `tsc` clean and 44 / 44 (not re-run by the docs agent).
- Local backend on `:8787` was **down** before the auth fix (`loadEnv()` threw with no `API_SHARED_SECRET`; `buildApp()` returned 503 on every route). After the fix the secret is required only in production. Uncommitted.
- Rate limiter moved from module scope into `buildApp` so separate app instances (tests) no longer share window state. Uncommitted.
- Deploy: Render `/health` and Vercel `/api/vani/health` both 200.

## Planned tests (next agenda — PM spec alignment, Phase A)
> 2026-10-10: backend tests for most items below now exist (suite 99/99). Simulator tests (`rollout-sim.test.ts`): a +5 pt variant climbs and is never rolled back; a bad variant is rolled back at 10%; no true difference never reaches final promotion. Synthetic data only. Not yet covered: a repeated-simulation false-positive rate measurement, and a guardrail-multiplicity test (known limitation).

- **Spec constants:** snapshot test asserting every baseline, tolerance, stage, α/τ/Λ and validity number matches `docs/pm-guardrails-and-autoscale-spec.md`.
- **Two-sample mSPRT (B vs A):** empirical false-positive bound ≤ α under continuous peeking; detects a +3 pt lift at the spec sample sizes; stage-stratified combination.
- **Guardrails:** each of the 9 blocks / rolls back when B is proven worse beyond its live rule.
- **Staged rollout:** 10→25→50→100 gates, 24 h cooldown, 5% holdback / 7 days, automatic scale-down triggers.
- **Assignment:** last-two-digit buckets 00–99; 10% = 00–09; SRM χ² catches an imbalance (p < 0.001); outcome-coverage floor holds decisions.
- **Pre-prod gate:** fake runs count toward the gate (fixes the 2 failures); −2 pt primary tolerance; regression suite zero-failures; overfit flag.

## Findings
- **Sarvam models**: sarvam-30b retired (HTTP 400); live /v1 serves sarvam-105b and sarvam-105b-conversations (docs list identical price). sarvam-105b is a reasoning model: default output budget ran out ("length", empty answer). Fix: providerOptions.sarvam {max_tokens 8000, reasoning_effort "low"} -> 10/10 valid.
- **Voice Agents**: platform indus.sarvam.ai/samvaad; browser SDK `sarvam-conv-ai-sdk` (ConversationAgent, BrowserAudioInterface); needs org_id, workspace_id, app_id (+ optional version) and a Voice Agents API key kept server-side (proxy). Dashboard: 89 credits, no agents, no usage at inspection. Settings->API Key page shows org + workspace ids.
- **Voice key check**: X-API-Key against apps.sarvam.ai app-runtime returned 404 for a fake app (not 401) => key authenticates.
- **MCP**: sarvam-docs connected; sarvam-api connected (warns SARVAM_API_KEY not in the shell env); sarvam-voice-agents needs OAuth (user must do it in /mcp).
- **Drive data**: Best-Time-to-Call (530k attempts), Global Context seller dataset (bot calls + turns), PS07 persona files (bot calls, evaluator outputs, call turns, 5000-call recording sample), call_recordings (713 mp3), "Current Definitions of Call Quality Matrix" (dead air >5s, looping, WER, fatal/non-fatal), buyer-side VANI prompt docx. Contains real seller names: internal use only, never upload, aggregates only.
- **Deployment (researched, third-party sources, verify)**: Supabase free (500 MB, pauses after 7 days idle, no backups); Vercel Hobby is non-commercial; Render free web service sleeps (~1 min cold start) and has no persistent disk; autoscale scheduler needs an external cron tick.
- **UI libs**: bencho.dev = copy-paste interaction demos, code behind sign-in, no CLI/registry, browser tool could not read code, none imported. rareui.com = free `npx shadcn@latest add swamimalode07/rare-ui/<name>`, nothing installed. beui.dev (checked via fetch, not Chrome) = MIT, 138 animated components on Motion + Tailwind 4, shadcn registry (`shadcn add @beui/<name>`), has Voice Orb (voice-reactive visual), charts, command palette; MCP is Pro only; no table or call components; docs at /docs/theme, /docs/motion-patterns, /llms.txt, GitHub starc007/ui-components. Fits better than bencho for this app (already uses Motion + shadcn).

## Audit findings (2026-10-10, read-only)
- **Decision engine**: mSPRT is genuine and tested, but the "winner" is an **absolute-threshold** test (12%), not B-vs-A; no multiplicity control; the experiment entity is inert (no window, no start/stop, not wired to traffic); promotion to "remaining traffic" and a run-report endpoint do not exist.
- **Frontend flow**: config (traffic split, window, secondary metric) is **not persisted**; there is no run-report screen; promotion and rollback are **local-only** previews; several screens silently fall back to synthetic data while still showing "Live backend".
- **Metrics/judge**: judge output never feeds rollout (score-only calls); two incompatible "meetingFixed" definitions (boolean rate vs 1–5); all-audit versions show 0% instead of "no data"; no ingest idempotency; `onCompleted` failures are swallowed.

## Test log
- 2026-10-10 (docs agent): backend `npx tsc --noEmit` clean; `npx vitest run` 10 files, 99 / 99 pass. Simulator (synthetic): +5 pt variant promoted ~day 3; bad variant stopped at 10% ~1.5 days. A simulated +5 pt run showed do-not-call falsely "proven worse" during holdback (guardrail multiplicity; PM spec question, unchanged).
- 2026-10-10: backend `tsc` clean; `vitest run` 33/35 (2 preprod); frontend `tsc` clean; `vitest run` 44/44.
- 2026-10-09 app: tsc clean, vitest 37/37 (frontend agent report). Backend: tsc clean, vitest 35/35, eve build OK (backend agent report). Both run before final voice work.
- 2026-10-09 judge: 10/10 valid after token fix; 1 real audit via POST /audits scored 4.1.
- Not verified: Supabase SQL/adapter, voice proxy against live Sarvam, real audio, reduced-motion in browser, bell first-click, bencho/rareui imports.

## Evidence docs (citations)
See [docs/README.md](../docs/README.md): [Sarvam voice agents](../docs/sarvam-voice-agents.md), [Judge model](../docs/judge-model-findings.md), [Drive data + VANI prompt](../docs/drive-data-and-vani-prompt.md), [Deployment](../docs/deployment-options.md), [UI libraries](../docs/ui-libraries.md), [PM guardrails + auto-scale spec](../docs/pm-guardrails-and-autoscale-spec.md).
