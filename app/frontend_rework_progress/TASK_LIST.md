# Task list

> **Next agenda (2026-10-10):** align the frontend to the PM spec [docs/pm-guardrails-and-autoscale-spec.md](../../docs/pm-guardrails-and-autoscale-spec.md) and fix the end-to-end flow gaps. Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.

## NEXT AGENDA — PM spec alignment (UI)

### Configure the test
- [ ] **F-A1. Primary metric selector** — the four PM options (Meeting Fixed default, Positive outcome, Conversation reach, Callback fixed) with the per-primary extra guardrail explained; persist it with the experiment.
- [ ] **F-A2. Secondary metrics panel** — show the per-primary secondary metrics with baselines (31.0%, 2.1%, 11.8%, 15.4%, 47.6%, …); reported with significance, never promote/block.
- [ ] **F-A3. Persist the experiment config.** Extend the `POST /experiments` body + `createExperimentSchema` with `trafficSplit`, `window {start,end}`, `secondaryMetric`; stop swallowing the POST error.
- [ ] **F-A4. Start size 5–25% (default 10%)**, smallest-win input 1–5 pts (default 3), max test length (default 7 days); stricter-only inputs.

### Guardrails & rollout
- [ ] **F-A5. Guardrail panel** — show all 9 guardrails (baseline, tolerance, live rule) and their live status (ok / watch / proven worse → rolled back).
- [ ] **F-A6. Staged rollout view** — stages 10 → 25 → 50 → 100 with per-gate status (lift thresholds, Λ ≥ 5, Λ ≥ 20, PM approval), 24 h cooldown, 5% holdback / 7 days.
- [ ] **F-A7. Run report / audit trail** — one screen reading the run report + decisions + `/experiments/{id}`: target vs observed split, both metrics, significance (method + p / Λ), the decision, and the promotion/rollback history. Render the existing (currently dead) `Evidence` component.
- [ ] **F-A8. Real promotion + rollback.** Wire the `/scale-up` `confirm()` and "Roll back" to `PUT /traffic`, tag with experiment id, and fail loudly (no local-only "Simulated" toasts).
- [ ] **F-A9. Early-stop demo** — a one-click "run a clearly-worse variant" that drives the autoscale run and surfaces the scale-down event (or render the orphaned `.early-stop-section`).
- [ ] **F-A10. Assignment view** — last-two-digit buckets (00–99) and observed-vs-target split, with the SRM/coverage validity status.

### Honesty & data
- [ ] **F-A11. Label simulated modes.** Screens that post client-synthetic calls/outcomes currently read "Live backend"; show "Simulated (round-tripped)" instead and stop posting synthetic calls by default.
- [ ] **F-A12. "No data" not 0%.** A version with only audit calls must not render 0% meeting-fixed.
- [ ] **F-A13. Replace silent `.catch(() => undefined)`** in `setup.tsx`, `prompts.tsx`, `notifications.ts`, `scorecard.tsx` with visible sample-data banners/toasts.
- [ ] **F-A14. Cohort model to last-two digits** (`/` weak-cohort callout, `cohorts` view) to match the backend.

## Quality gates (next)
- [ ] `tsc` + `vitest` green (**currently 44/44**).
- [ ] New tests: primary selector persists; guardrail panel renders; staged gate status; run report reads the backend; promotion calls `PUT /traffic`; early-stop demo; simulated-mode labels.
- [ ] Chrome check of `/setup` (run report step), `/scale-up`, `/`.

## G1 - Cohort model
- [x] performance-data.ts: aggregate per last-digit cohort (0-9), re-called GLID updates its cohort
- [x] Update performance-data.test.ts
- [ ] Move to last-two-digit cohorts (0-99) per PM spec (F-A14)

## G2 - Performance page
- [x] Remove recharts chart + metric select
- [x] Verdict (max 2 lines, exact comparison)
- [x] Big Meeting Fixed KPI (editable) + secondary KPI cards
- [x] Leaderboard with sort; row click opens detail sheet
- [x] Weak-cohort callout (per digit)
- [x] Clean unused perf CSS

## G3 - mSPRT
- [x] Research formulation
- [x] sequential-test.ts + vitest (little data, clearly below, fixed-seed peeking simulation)
- [ ] Two-sample B-vs-A mSPRT in the UI engine (mirror backend, F-A6/A7)

## G4 - Scale-up
- [x] Autoscale ON default, risk appetite (+1 / +2.5 / +10 pp)
- [x] Threshold X% input, mSPRT scale-down detection, audit display
- [x] Notification store (shell panel) + sonner toast
- [ ] Replace risk-appetite/threshold with staged rollout + gates (F-A6)

## G5 - Pipeline
- [x] auditClient service module (typed, simulated timers)
- [x] Cards-only page, call window, end-call confirm, live audit stepper
- [x] BACKEND_NEEDS.md

## G6 - Setup / scorecard
- [x] Version pickers for diff
- [x] Remove "Promising, but not proven yet" decision block + below
- [ ] Primary metric (4 options) + secondary metrics + persisted window/split (F-A1/A2/A3)

## G8 - Call window as a real calling UI (new requirement)
- [x] Inspect calling-interface components online in Chrome
- [x] Rebuild call-window.tsx: avatar, timer, speaking indicator/waveform, mute/keypad/speaker, red End call, collapsed captions

## G9 - Maximise components from bencho.dev (new requirement)
- [x] Open bencho.dev, learn distribution method (registry / CLI / copy-paste)
- [ ] Use fitting components for call window, performance cards, leaderboard, setup picker, scale-up controls (only if safe)

## G7 - Gates
- [ ] tsc, vitest, eslint, prettier, routing test, Chrome screenshots

## G10 - Root selection bug
- [x] Root cause: the version cards on `/` were plain divs with no click handler (only the leaderboard rows opened details). Fixed: cards are buttons opening the detail sheet; rows are keyboard focusable. Regression test `performance-select.test.tsx`.

## G11 - Scrollbars and tooltips
- [x] Global thin token-coloured scrollbars (`styles.css`)
- [x] `Tip` helper (`common.tsx`) over shadcn Tooltip; arrow, token colours, reduced-motion; single `TooltipProvider` in `__root.tsx`; native `title=` removed from icon buttons/info badges

## G12 - Backend wiring
- [x] `src/lib/api.ts` (VITE_API_URL, default http://localhost:8787, status store), `src/lib/api-contract.ts` (copy of backend zod)
- [x] Audits (`audit-client.ts`), notifications, autoscale (`autoscale-source.ts`), performance (`performance-source.ts`), setup POST /experiments
- [x] Shell pill shows "Live backend" vs "Backend unreachable: synthetic data"
- [ ] Make the "Live backend" pill honest about simulated round-trips (F-A11)

## G13 - Motion audit (abrupt changes found and fixed)
- [x] Route change: PageTransition fade/slide (shell)
- [x] Sidebar collapse; state persisted in localStorage
- [x] Notification panel and user menu: AnimatePresence fade/slide
- [x] KPI numbers, star scores, autoscale traffic/calls/rate/p-value: AnimatedNumber tween
- [x] Verdict text: Crossfade; leaderboard rows reorder; autoscale event rows
- [x] Conditional blocks: setup locked banner, custom goal fields, errors, step panels, prompts find bar, scale-up overlap, scorecard info, call window phase swap
- [ ] Not changed (Radix handles enter/exit already): modals, sheets, alert dialog, popovers, sonner toasts, tooltips

## G14 - rareui.com
- Free shadcn registry: `npx shadcn@latest add swamimalode07/rare-ui/<name>`. Candidates: animatedcounter, stepplayer, notificationbell, voicenote. None installed (decision for the user).

## G15 - Chips instead of dropdowns
- [x] `chips.tsx` ChipSelect (ToggleGroup, "More" popover when more than 5). Converted: Performance primary metric, Setup baseline/challenger/traffic/baseline share, Prompts compare, Scorecard compare x2 + primary metric + preview state.

## G16 - UI audit B1-B6
- [x] B1 collapsed sidebar centred and persisted; [x] B2 skeleton while probing on `/`; [x] B3 verdict two lines; [x] B4 call tooltips side=top; [x] B5 mojibake replaced with a middle dot; [ ] B5b bell first-click not reproduced/verified; [x] B6 footnote and pills follow data source (segment map now "Local preview")

## G17 - bencho.dev (signed in)
- Code is viewable per block but not copyable via the tooling; nothing imported. Re-implemented the Drag stepper idea as `number-stepper.tsx`. rareui candidates remain uninstalled.

## G18-G20
- [x] `preprod.tsx`: GET /preprod/gate, POST /preprod/runs -> {runId}, poll GET /preprod/runs/{id}; states Not run / Running / Passed / Failed, never shows Passed without data
- [x] `prompts.tsx`: GET /versions, POST /versions save-as-new; `scorecard.tsx`: GET/PUT /rubric; shell: GET/PUT /notifications/preferences
- [x] `call-session.ts`: start/stop/setMuted/sendText + onState/onTranscript/onSpeaking/onLevel

## G21 - Real voice call
- [x] `sarvam-conv-ai-sdk@0.0.42`; `call-session.ts` adapter (state/transcript/level mapping, 503 -> unavailable)
- [x] Call window: Start call, state text, waveform, collapsed captions, mute, End call, transcript + durationSec + answered to POST /audits
- [ ] Real end-to-end audio: blocked until SARVAM_ORG_ID/WORKSPACE_ID/APP_ID_x are set in the backend

## Notes / blockers
- 2026-10-10: PM spec adopted — the frontend must show a per-experiment primary metric, secondary metrics, 9 guardrails, staged rollout, and a run report; promotion/rollback must be real.
- 2026-10-09: `Evidence` in common.tsx is exported but unused (it is the intended significance block — reuse it in the run report).
- 2026-10-09: Setup step 4 'pending-slot' text left untouched.
- 2026-10-09 PAUSED (G9 rest): bencho.dev needs a sign-in to copy code; no registry URL.
