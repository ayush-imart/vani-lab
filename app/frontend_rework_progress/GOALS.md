# Goals - frontend rework (synthetic data only)

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
| G9 | bencho.dev components | ⚠️ Blocked: sign-up needed, see TASK_LIST | New req |
| G10 | Bug: versions not selectable on `/` | ✅ Done (smoke tested) | Task 1 |
| G11 | Custom scrollbars + shared Tooltip | ✅ Done (smoke tested) | Task 5 |
| G12 | Wire frontend to backend (`lib/api.ts`, fallback) | ✅ Done (smoke tested; prompts versions not wired) | Task 3 |
| G13 | Motion smoothing (MotionConfig, AnimatedNumber, Crossfade, Reveal, layout reorder, sidebar fade) | ✅ Done (smoke tested; reduced-motion not toggled in browser) | New req |
| G14 | rareui.com review | ⚠️ Reviewed, nothing installed (see TASK_LIST) | New req |
| G15 | Dropdowns to chips (ChipSelect + More popover) | ✅ Done (smoke tested on /setup and /) | New req |
| G16 | UI audit fixes B1-B6 | ✅ Done (see TESTS) | New req |
| G17 | bencho.dev blocks | ⚠️ Partial: stepper idea re-implemented, no code copied | New req |
| G18 | Pre-prod gate wired (`preprod.tsx`) | ✅ Done (smoke tested vs backend) | New req |
| G19 | /versions (prompts), /rubric + notification prefs wired | ✅ Done (tsc/unit only; prompts+scorecard+prefs not clicked in Chrome) | New req |
| G20 | Call session interface (`call-session.ts`) | ✅ Done (scripted fallback) | New req |
| G21 | Real Sarvam voice call (sarvam-conv-ai-sdk) in the call window | ⚠️ Done with known issue: real audio untested (no Sarvam app ids, backend returns 503) | New req |

## Reserved for later (pending items)
- Real Sarvam voice session behind `createCallSession` (backend `POST /sessions` returns config; 503 until env set).
- `/versions/diff` and `/versions/{id}/history` (prompts page diffs locally).
- Experiments list on /setup (only `POST /experiments` on start is wired).
- Rubric / weights UI (`/rubric`), notification preferences (`/notifications/preferences`).
- Voice bot sessions (WebSocket `/calls/{version}`), regression metric, auth.
- Extension points: nav array in `shell.tsx`, one route file per screen in `src/routes/`.

## Update log
- 2026-10-09: G1-G6 implemented, unit-tested (vitest 33 passing). G7 pending visual check.
- 2026-10-09: G8, G10-G12 done. G9 blocked on bencho.dev sign-up.

Evidence: [UI libraries](../../docs/ui-libraries.md), [Sarvam voice agents](../../docs/sarvam-voice-agents.md)
