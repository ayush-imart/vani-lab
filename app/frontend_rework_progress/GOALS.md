# Goals - frontend rework (synthetic data only)

PM spec: [docs/pm-guardrails-and-autoscale-spec.md](../../docs/pm-guardrails-and-autoscale-spec.md).

| # | Goal | Status | Covers |
|---|------|--------|--------|
| G1 | Cohort-by-last-digit data model + tests | ✅ Done (smoke tested) | Req 3 |
| G2 | Performance page (`/`): no chart, verdict, big KPIs, leaderboard, on-demand detail | ✅ Done (smoke tested) | Req 2 |
| G3 | mSPRT pure module + tests | ✅ Done (smoke tested) | Req 5 |
| G4 | Scale-up: autoscale, risk appetite, threshold, scale-down + notification | ✅ Done (smoke tested) | Req 5 |
| G5 | Live pipeline: cards only, call window, audit progress, auditClient | ✅ Done (smoke tested) | Req 1 |
| G6 | Setup version picker + remove decision block | ✅ Done (smoke tested) | Req 4 |
| G7 | Quality gates + Chrome verification | ⬜ Not started | all |
| G8 | Call window as a real calling UI | ✅ Done (smoke tested) | New req |
| G9 | bencho.dev components | ⚠️ Blocked: sign-up needed | New req |
| G10 | Bug: versions not selectable on `/` | ✅ Done (smoke tested) | Task 1 |
| G11 | Custom scrollbars + shared Tooltip | ✅ Done (smoke tested) | Task 5 |
| G12 | Wire frontend to backend (`lib/api.ts`, fallback) | ✅ Done (smoke tested; prompts versions not wired) | Task 3 |
| G13 | Motion smoothing | ✅ Done (smoke tested; reduced-motion not toggled) | New req |
| G14 | rareui.com review | ⚠️ Reviewed, nothing installed | New req |
| G15 | Dropdowns to chips (ChipSelect) | ✅ Done (smoke tested) | New req |
| G16 | UI audit fixes B1-B6 | ✅ Done (see TESTS) | New req |
| G17 | bencho.dev blocks | ⚠️ Partial: stepper re-implemented, no code copied | New req |
| G18 | Pre-prod gate wired (`preprod.tsx`) | ✅ Done (smoke tested vs backend) | New req |
| G19 | /versions, /rubric + notification prefs wired | ✅ Done (tsc/unit only) | New req |
| G20 | Call session interface (`call-session.ts`) | ✅ Done (scripted fallback) | New req |
| G21 | Real Sarvam voice call in the call window | ⚠️ Real audio untested (no Sarvam app ids) | New req |

## PM spec alignment + flow fixes (2026-10-10)
| # | Goal | Status | Covers |
|---|------|--------|--------|
| G22 | Primary metric selector (4 PM options) + secondary metrics panel | ⬜ Not started | PM spec |
| G23 | Guardrail panel (9 guardrails, status) | ⬜ Not started | PM spec |
| G24 | Staged rollout view (10/25/50/100, gates, cooldown, holdback) | ⬜ Not started | PM spec |
| G25 | Run report / audit trail (+ render the dead `Evidence`) | ⬜ Not started | Req 3 |
| G26 | Real promotion + rollback (`PUT /traffic`, experiment-tagged, loud failures) | ⬜ Not started | Req 4 |
| G27 | One-click early-stop demo | ⬜ Not started | Req 5 |
| G28 | Last-two-digit cohorts + observed-vs-target split + validity status | ⬜ Not started | PM spec |
| G29 | Persist experiment config (split, window, secondary metric) & surface errors | ⬜ Not started | Req 1 |
| G30 | Honest data labels; replace silent fallbacks; "no data" not 0% | ⬜ Not started | Audit findings |

## Reserved for later (pending items)
- Real Sarvam voice session behind `createCallSession` (backend `POST /sessions`; 503 until env set).
- `/versions/diff` and `/versions/{id}/history` (prompts page diffs locally).
- Experiments list on /setup (only `POST /experiments` on start is wired).
- Voice bot sessions (WebSocket `/calls/{version}`), regression metric, auth.
- Extension points: nav array in `shell.tsx`, one route file per screen in `src/routes/`.

## Update log
- 2026-10-10: PM spec adopted; added G22–G30 (primary/secondary metrics, guardrails, staged rollout, run report, real promote/rollback, early-stop demo, last-2-digit cohorts, honest data). Frontend suite **44/44**.
- 2026-10-09: G1-G6 implemented, unit-tested (vitest 33 passing). G7 pending visual check.
- 2026-10-09: G8, G10-G12 done. G9 blocked on bencho.dev sign-up.

Evidence: [UI libraries](../../docs/ui-libraries.md), [Sarvam voice agents](../../docs/sarvam-voice-agents.md), [PM spec](../../docs/pm-guardrails-and-autoscale-spec.md)
