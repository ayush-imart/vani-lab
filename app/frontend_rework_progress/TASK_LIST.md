# Task list

## G1 - Cohort model
- [x] performance-data.ts: aggregate per last-digit cohort (0-9), re-called GLID updates its cohort
- [x] Update performance-data.test.ts

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

## G4 - Scale-up
- [x] Autoscale ON default, risk appetite (+1 / +2.5 / +10 pp)
- [x] Threshold X% input, mSPRT scale-down detection, audit display
- [x] Notification store (shell panel) + sonner toast

## G5 - Pipeline
- [x] auditClient service module (typed, simulated timers)
- [x] Cards-only page, call window, end-call confirm, live audit stepper
- [x] BACKEND_NEEDS.md

## G6 - Setup / scorecard
- [x] Version pickers for diff
- [x] Remove "Promising, but not proven yet" decision block + below (found in scorecard.tsx, not setup)

## G8 - Call window as a real calling UI (new requirement)
- [x] Inspect calling-interface components online in Chrome
- [x] Rebuild call-window.tsx: avatar, timer, speaking indicator/waveform, mute/keypad/speaker, red End call, collapsed captions

## G9 - Maximise components from bencho.dev (new requirement)
- [x] Open bencho.dev, learn distribution method (registry / CLI / copy-paste)
- [ ] Use fitting components for call window, performance cards, leaderboard, setup picker, scale-up controls (only if safe)

## G7 - Gates
- [ ] tsc, vitest, eslint, prettier, routing test, Chrome screenshots

## Notes / blockers
- 2026-10-09: The "Promising, but not proven yet. Inconclusive" block was in `scorecard.tsx` (decision banner), not `setup.tsx`. Removed the banner and everything below it (rejection panel, outcome preview toggle, scale-recap, evidence + rejection modals). `Evidence` in common.tsx is no longer used on any page; left exported.
- Setup step 4 'pending-slot' text (a different block) left untouched.
- 2026-10-09 PAUSED (G9 rest): bencho.dev is a gallery of interactive blocks; viewing/copying code is behind its 'Join for free' sign-up, and no shadcn registry / npx command / docs link was found on the page. I cannot create an account, so no bencho component was imported. Needs the user to sign in and give a registry URL or snippet. Call window was built from shared shadcn primitives (Dialog, Collapsible, Button, Progress) + lucide icons + global CSS tokens instead; no new deps.
- 2026-10-09 NEEDED FROM USER for bencho.dev: bencho.dev exposes no registry URL, npx/shadcn CLI or MCP (checked home, a block page, footer links: only Blocks/Sounds/Finds/Bench, Mobbin sponsor, Privacy, Licence). Block code looks gated behind "Join for free" (account sign-up), which I cannot do. To continue, the user must either sign in and paste the block code/registry URL, or confirm which blocks to copy.

## G10 - Root selection bug
- [x] Root cause: the version cards on `/` were plain divs with no click handler (only the leaderboard rows opened details). Fixed: cards are buttons opening the detail sheet; rows are keyboard focusable. Regression test `performance-select.test.tsx`.

## G11 - Scrollbars and tooltips
- [x] Global thin token-coloured scrollbars (`styles.css`)
- [x] `Tip` helper (`common.tsx`) over shadcn Tooltip; arrow, token colours, reduced-motion; single `TooltipProvider` in `__root.tsx`; native `title=` removed from icon buttons/info badges

## G12 - Backend wiring
- [x] `src/lib/api.ts` (VITE_API_URL, default http://localhost:8787, status store), `src/lib/api-contract.ts` (copy of backend zod, imported from zod/v4)
- [x] Audits (`audit-client.ts`: POST /audits + SSE, fallback to simulated), notifications (poll /notifications), autoscale (`autoscale-source.ts`), performance (`performance-source.ts`), setup POST /experiments
- [x] Shell pill shows "Live backend" vs "Backend unreachable: synthetic data"

## G13 - Motion audit (abrupt changes found and fixed)
- [x] Route change: PageTransition fade/slide (shell)
- [x] Sidebar collapse: width + label fade/clip (brand text, WORKSPACE, nav labels, nav dot, bottom block); state persisted in localStorage
- [x] Notification panel and user menu: AnimatePresence fade/slide
- [x] KPI numbers, star scores, autoscale traffic/calls/rate/p-value: AnimatedNumber tween + fading highlight
- [x] Verdict text: Crossfade keyed by structure, numbers tween
- [x] Leaderboard rows reorder: motion.tr layout; version cards hover/press; pipeline cards hover (y only, mascots untouched)
- [x] Autoscale event rows: AnimatePresence + layout
- [x] Conditional blocks: setup locked banner, custom goal fields, same-version note, errors, step panels (FadeIn), prompts find bar / Unsaved pill / error, scale-up overlap + date error, scorecard info, call window phase swap and audit result
- [ ] Not changed (Radix handles enter/exit already): modals, sheets, alert dialog, popovers, sonner toasts, tooltips

## G14 - rareui.com
- Free, open source, shadcn registry, no sign-up: `npx shadcn@latest add swamimalode07/rare-ui/<name>`; MCP page at /mcp. 22 components. Fitting ones: animatedcounter (odometer digits, needs only `motion`), stepplayer, notificationbell, voicenote. NOT installed: my Motion AnimatedNumber already tweens values calmly, and an odometer spin is more motion than the user asked for. Decision for the user: say which of these to add.

## G15 - Chips instead of dropdowns
- [x] `chips.tsx` ChipSelect (ToggleGroup, "More" popover when more than 5). Converted: Performance primary metric, Setup baseline/challenger/traffic/baseline share, Prompts compare, Scorecard compare x2 + primary metric + preview state, Scale-up preview state. User menu and notification panel stay custom panels.

## G16 - UI audit B1-B6
- [x] B1 collapsed sidebar centred and persisted; [x] B2 skeleton while probing on `/`; [x] B3 verdict two lines; [x] B4 call tooltips side=top, waveform and reply box unchanged as instructed; [x] B5 mojibake replaced with a middle dot; [ ] B5b bell first-click not reproduced/verified; [x] B6 footnote and pills follow data source (segment map now "Local preview")

## G17 - bencho.dev (signed in)
- Code is viewable per block (Install / Usage / Code / How it works, copy buttons), no CLI or registry. Blocks are dark, self-styled interaction concepts (voice-note 14 KB "not a recorder"; stepper ~4.6 KB). The browser tool blocks code text from being returned to me, so I cannot copy block code reliably, and most blocks do not map to dashboard surfaces. Imported: none. Re-implemented the Drag stepper idea as `number-stepper.tsx` (tap/hold +/-), used for the scale-down threshold. Needs user decision: if specific blocks are wanted, paste their code.
- rareui: no component installed (see G14); animatedcounter/stepplayer/notificationbell remain candidates.

## G18-G20
- [x] `preprod.tsx`: GET /preprod/gate, POST /preprod/runs -> {runId}, poll GET /preprod/runs/{id}; states Not run / Running / Passed / Failed, reasons, unreachable label, never shows Passed without data
- [x] `prompts.tsx`: GET /versions list, POST /versions save-as-new (parentId, changelog), local fallback labelled; `scorecard.tsx`: GET/PUT /rubric (weights normalised); shell: GET/PUT /notifications/preferences (inApp, gchat, whatsapp)
- [x] `call-session.ts`: start/stop/setMuted/sendText + onState/onTranscript/onSpeaking/onLevel; scripted bot is the fallback; call window uses it; textbox kept

## G21 - Real voice call
- [x] `sarvam-conv-ai-sdk@0.0.42` installed; `call-session.ts` adapter (dynamic import of the browser SDK, apiKey "", baseUrl from POST /sessions, state/transcript/level mapping, friendly mic errors, 503 -> unavailable); scripted bot only with VITE_SCRIPTED_CALLS=1
- [x] Call window: Start call button (user gesture), state text, level-driven waveform, collapsed captions, mute, End call stops the agent, real transcript + durationSec + answered sent to POST /audits; reply textbox/Send and the fake speaker toggle removed
- [ ] Real end-to-end audio: blocked until SARVAM_ORG_ID/WORKSPACE_ID/APP_ID_x are set in the backend

