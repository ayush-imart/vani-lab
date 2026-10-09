# Smoke tests

Template: What was tested / How / Result / Follow-up needed

## Log

### G1 cohort model
- Tested: cohort per last digit, re-called GLID updates cohort. How: `npx vitest run src/test/performance-data.test.ts`. Result: pass.
### G3 mSPRT
- Tested: numeric-integral match, mirror symmetry, little data, clearly below, fixed-seed peeking simulation (1500 runs, rate at boundary; mSPRT <= 5%, naive repeated z-test higher). How: `src/test/sequential-test.test.ts`. Result: pass.
### G4 scale policy / G5 audit client
- Tested: risk steps, scale-up/down traffic math, scale-down after strong evidence, autoscale off, simulated audit stage order + cancel. How: `scale-policy.test.ts`, `audit-client.test.ts`. Result: pass. Full suite 33 tests passing, `tsc --noEmit` clean.

### Chrome check (G2,G4,G5,G6,G8)
- Tested /, /pipeline (cards, call window, end call confirm, audit stepper to result), /scale-up (autoscale ON, scale-down of C fired with toast), /setup (pickers present), 0 console errors on /setup. Result: pass. Calling UI re-verified after rework.

### G10 root selection bug
- Reproduced: leaderboard rows opened the sheet but the big version cards did nothing. After fix: unit tests (2) pass; Chrome: row click opens sheet.
### G11 scrollbars/tooltips
- Chrome: hover on the collapse toggle and the call Mute button shows the styled tooltip with arrow. Scrollbar styling checked by CSS only (no overflow visible in screenshots).
### G12 backend wiring (backend started locally with AUDITOR=fake)
- `/scale-up`: pill "Live backend", traffic A 75 / C 0 after a backend scale-down, toast shown. `/`: real backend KPIs (small sample). `/pipeline`: audit via SSE completed with overall 3.0 (fake auditor), proving the backend path. Fallback path covered by unit tests (api offline) and earlier synthetic runs.

### G13/G15/G16 Chrome checks (real)
- `/`: skeleton path exists (not captured); verdict renders on two lines with live numbers; chips show Meeting Fixed selected (aria-checked true, others false). KPI value changed 9.1% to 9.0% during polling and `.num-flash` highlight was present; the 0.1 step is too small to observe intermediate tween frames. Reduced-motion was NOT toggled in the browser (code relies on MotionConfig reducedMotion="user" and useReducedMotion).
- Sidebar collapsed on /setup: logo, toggle and icons share one column (screenshot); after reload the collapsed state persisted (`app-shell is-collapsed`).
- `/setup`: Baseline/Challenger chips visible, diff updates (screenshot). Notification bell first-click and /prompts, /scorecard chips not re-checked in Chrome.
- Gates: tsc clean, vitest 37 passing, eslint clean on touched files, prettier applied.

### Chip radius token
- `--radius-chip: 7px` defined once in `:root`, used by .chip, .pill, .segmented, .perf-chip. Chrome /scale-up: risk-appetite control shows rounded-rect corners (not pills). Live backend: Version B scaled 22.5 -> 25 -> 27.5 -> 30 -> 32.5 pp in the log, p-values shown. Gates after: tsc clean, vitest 37/37.

### G18 pre-prod gate (Chrome, backend with fake judge)
- /setup step 2: before a run all four checks show "Not run" with gate pill; clicking "Run smoke tests" then showed all four "Passed" and "Gate: Passed" (fake judge always passes, so this is backend data, not a hardcode). Unreachable path covered by code review only (not exercised in browser).
### G19/G20
- tsc clean, vitest 37/37, eslint clean on touched files. /prompts versions, rubric save, notification prefs and the refactored call window were NOT clicked in Chrome this round (the backend `/versions`, `/rubric`, `/notifications/preferences` were confirmed to answer via curl).

### G21 real voice
- Unit tests (`call-session.test.ts`, 7): state/role mapping, start + waitForConnect + transcript mapping (USER->seller), audio level direction, 503 -> unavailable and no agent created, NotAllowedError/NotFound/NotReadable messages, stop() stops the agent and ignores later states, mute/unmute. Real microphone/audio NOT tested (no Sarvam app configured; cannot test audio here).
- Chrome: /pipeline call window shows no textbox; Start call with the backend returning 503 shows "Voice agent for Version B is not set up yet" and a disabled Start button. Gates: tsc clean, vitest 44/44.
