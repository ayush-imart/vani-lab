# Submission checklist and bundle plan (Problem 5)

Window: Sat 10 Oct 2026, 14:00-23:59 IST, one submission per team, late entries are not evaluated. Source: `hackathon-submission-guidelines/README.md`.

Status: `[x]` exists in the repo, `[ ]` still to do, `[!]` needs input from the team.

## Artifact map

| Required artifact | File / location | Status |
| --- | --- | --- |
| Problem statement + approach note | "Approach note" below, plus `README.md` and `problem-statement.md` | [x] draft below |
| `skills.md` (build journey and tools) | `skills.md` (root) | [x] |
| README | `README.md` | [x] |
| Code | `app/` (frontend), `backend/` (API, judge, rollout engine) | [x] |
| API reference | `backend/API_CONTRACT.md` | [x] |
| Run report (split, metrics, significance, decision) | `GET /experiments/{id}/rollout/report`; also the `/simulations/rollout` output | [x] code, [ ] saved sample |
| Sample outputs | `sample-outputs/` (to create): one saved simulation JSON per scenario (`true_lift`, `bad_variant`, `no_difference`), all labelled synthetic | [ ] |
| Early-stop demo (worse variant) | `POST /simulations/rollout {"scenario":"bad_variant"}` and the demo video | [x] code, [ ] video |
| Demo video, 5-7 min | shot list below | [ ] |
| Sarvam Agent ID / live link | Agent IDs from the Sarvam dashboard (A/B/C) and the deployed frontend URL | [!] team to paste, never commit keys |
| Team name and members | here, below | [!] |

Team name: `<TODO>`  Members: `<TODO>`  Agent IDs: `<TODO>`  Live link: `<TODO>`

## Approach note (draft)

Problem 5: test a VANI prompt change on a small traffic slice and roll out only the winner. VANI Lab assigns sellers to control or challenger by the last two GLID digits, ramps 10 -> 25 -> 50 -> 100%, and decides with a two-sample mSPRT (alpha 0.05, tau = smallest win worth shipping, stage-stratified). Nine guardrails are compared B vs A in the same run, and SRM plus outcome-coverage checks gate every decision. A clearly worse variant is rolled back to A automatically; promotion to 100% needs PM approval; every decision is logged and the report records method, evidence and verdict. Primary metric: Meeting Fixed; secondary metrics are reported but never decide.

Method summary, simulated-vs-real table and limitations: `skills.md`.

## Pre-submission checks

- [ ] `cd backend; npm run typecheck; npm test` (last verified: tsc clean, vitest 99/99).
- [ ] `cd app; npm run typecheck; npm test` re-run after the frontend agent finishes.
- [ ] No `keys.env`, tokens or customer/call data in the bundle (`git status`, grep for key names). `keys.env` is gitignored; do not copy it.
- [ ] Screenshots and video show synthetic data only; no real GLIDs, names or recordings.
- [ ] Every simulated number is labelled "simulated" on screen and in the narration.
- [ ] Deployed frontend loads; Render may be asleep (about 1 min cold start): open `/health` before recording.
- [ ] Submit once on the platform before 23:59 IST.

## Demo video shot list (5-7 min, synthetic data only)

Record on the simulator and clearly say "synthetic data" at the start and on the simulation screens. Do not show `keys.env`, the terminal environment, or real call data.

1. 0:00-0:40 Problem and hypothesis. Today a prompt change goes to all traffic on judgement. Variant B changes the opening/meeting ask; primary metric Meeting Fixed, secondaries and the nine guardrails.
2. 0:40-1:30 Setup. Show the two prompt versions (diff), start size 10%, window, PM bounds. Show `GET /spec` or the setup screen for the locked alpha 0.05 and stages.
3. 1:30-2:30 Assignment. Show a few GLID -> bucket -> arm lookups (`GET /assignment`), and the balance check on a synthetic seller list.
4. 2:30-3:45 Run and report, scenario `true_lift` (+5 pts, labelled simulated). Show stage progression, Lambda and lift, guardrails ok, SRM and coverage, the PM approval click at 50 -> 100, promotion and the holdback.
5. 3:45-4:45 Early stop, scenario `bad_variant` (labelled simulated). Show the harm evidence crossing the boundary, the rollback decision, and traffic returning to A (stopped at 10%).
6. 4:45-5:30 Audit trail and report: decision list with trigger and reason, method block, verdict, rollback control.
7. 5:30-6:15 Voice experience: one short live VANI call on a variant (only if the voice path is verified before recording; otherwise skip and say it is scaffolded).
8. 6:15-7:00 Close: what is real (engine, tests), what is simulated (outcomes), limits (guardrail multiplicity, in-memory persistence, no real traffic yet) and the next validation step: an A/A calibration on real calls, then a real 10% run.

## Open items before submitting

- [!] Team name, members, Sarvam agent IDs, live link.
- [ ] Create `sample-outputs/` from the simulator (synthetic) and the saved report.
- [ ] Record the video (C2).
- [ ] Persistence: Render Free is in-memory; Supabase was never verified. State this in the video if shown.
