# Smoke tests

Template: What was tested / How / Result / Follow-up needed

## Current status (2026-10-10)
- `tsc --noEmit` clean; `vitest run` → **44/44 pass**.
- Not yet exercised after the PM spec work (planned below): primary/secondary metric UI, guardrail panel, staged rollout, run report, real promotion/rollback, early-stop demo, last-2-digit cohorts.

## Planned tests (next agenda)
- Primary metric selector persists and appears in the experiment POST.
- Guardrail panel renders all 9 with live status.
- Staged rollout view shows gate status (lift, Λ ≥ 5, Λ ≥ 20, PM approval) and cooldown.
- Run report reads the backend report + decisions; `Evidence` renders the method + p/Λ.
- Promotion/rollback call `PUT /traffic` and fail loudly.
- Early-stop demo surfaces a scale-down event.
- Simulated-mode labels; "no data" not 0%.

## Log

### G1 cohort model
- Tested: cohort per last digit, re-called GLID updates cohort. How: `npx vitest run src/test/performance-data.test.ts`. Result: pass.
### G3 mSPRT
- Tested: numeric-integral match, mirror symmetry, little data, clearly below, fixed-seed peeking simulation (1500 runs; mSPRT <= 5%, naive repeated z-test higher). How: `src/test/sequential-test.test.ts`. Result: pass.
### G4 scale policy / G5 audit client
- Tested: risk steps, scale-up/down traffic math, scale-down after strong evidence, autoscale off, simulated audit stage order + cancel. How: `scale-policy.test.ts`, `audit-client.test.ts`. Result: pass. Full suite 33 tests passing, `tsc --noEmit` clean.

### Chrome check (G2,G4,G5,G6,G8)
- Tested /, /pipeline (cards, call window, end call confirm, audit stepper to result), /scale-up (autoscale ON, scale-down of C fired with toast), /setup (pickers present), 0 console errors on /setup. Result: pass.

### G10 root selection bug
- Reproduced: leaderboard rows opened the sheet but the big version cards did nothing. After fix: unit tests (2) pass; Chrome: row click opens sheet.
### G11 scrollbars/tooltips
- Chrome: hover on the collapse toggle and the call Mute button shows the styled tooltip with arrow. Scrollbar styling checked by CSS only.
### G12 backend wiring (backend started locally with AUDITOR=fake)
- `/scale-up`: pill "Live backend", traffic A 75 / C 0 after a backend scale-down. `/`: real backend KPIs (small sample). `/pipeline`: audit via SSE completed with overall 3.0 (fake auditor). Fallback path covered by unit tests.
- Caveat (2026-10-10): the "Live backend" pill is not honest when the calls/outcomes are client-synthetic (see G30).

### G13/G15/G16 Chrome checks (real)
- `/`: skeleton path exists (not captured); verdict renders on two lines; chips show Meeting Fixed selected. Sidebar collapsed state persisted after reload.
- `/setup`: Baseline/Challenger chips visible, diff updates. Bell first-click and /prompts, /scorecard chips not re-checked.
- Gates: tsc clean, vitest 37 passing, eslint clean on touched files, prettier applied.

### Chip radius token
- `--radius-chip: 7px`; Chrome /scale-up risk-appetite control shows rounded-rect corners. Live backend: Version B scaled 22.5 -> 32.5 pp in the log, p-values shown. Gates: tsc clean, vitest 37/37.

### G18 pre-prod gate (Chrome, backend with fake judge)
- /setup step 2: before a run all four checks show "Not run"; "Run smoke tests" then showed all four "Passed" and "Gate: Passed". Unreachable path covered by code review only.
- Caveat (2026-10-10): the backend `gate()` currently ignores non-real runs, so the UI gate can stay pending in other builds — fixed on the backend side.
### G19/G20
- tsc clean, vitest 37/37, eslint clean on touched files. /prompts versions, rubric save, notification prefs and the refactored call window NOT clicked in Chrome this round.
### G21 real voice
- Unit tests (`call-session.test.ts`, 7): state/role mapping, start + transcript mapping, audio level, 503 -> unavailable, mic errors, stop, mute/unmute. Real microphone/audio NOT tested.
- Chrome: /pipeline call window shows no textbox; Start call with the backend returning 503 shows "Voice agent for Version B is not set up yet". Gates: tsc clean, vitest 44/44.

### Impact analysis table headings
- Fixed overlapping version headings by allowing wrapping, assigning room to metric and delta columns, and keeping a 520px minimum table width inside the horizontal scroll container.
- Verification: whitespace check passed. TypeScript check reports existing undefined-index errors in `week-on-week.tsx:70-71`; browser layout not rechecked this round.
