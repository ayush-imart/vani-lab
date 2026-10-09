# Judge (Eve agent) local test: goals

Source plan: `C:\Users\Imart\.claude\plans\stateful-crafting-lark.md` (Auditor/Judge, sarvam-30b, transcripts in) + user ask "test the eve agent locally".

| # | Goal | Status | Covers |
|---|------|--------|--------|
| G1 | Offline checks: types, unit tests, `eve build` | ✅ Done (smoke tested) | Plan: Verification |
| G2 | Local runtime up: `eve dev --no-ui` | ✅ Done (health ready; `info` not checked) | Plan: Auditor contract |
| G3 | Sarvam reachability | ⚠️ Done with known issue: sarvam-30b retired (HTTP 400), sarvam-105b works | Plan: model route |
| G4 | Judge e2e on synthetic transcripts via Eve client + outputSchema | ✅ Done (10/10 valid after token-budget fix) | Plan: Auditor contract |
| G5 | Quality + robustness | ⚠️ Partly done: stable over 2 repeats, injection did not yield all 5s; callbackRequested/meetingFixed prompt tweak not re-verified (5-call cap) | Plan: Verification |

## Update log
- 2026-10-09: folder created, nothing run yet.
- 2026-10-09: G1 done; G2/G3 done with issues; G4 in progress.
- 2026-10-09: root cause of empty answers = reasoning budget ('length'); fixed in agent/agent.ts. Default model now sarvam-105b, effort low, 5-call cap guard in scripts/judge-smoke.ts. Later work continues in backend/dev_progress and project_progress.
- 2026-10-09: empty answers were the reasoning token budget; fixed in agent/agent.ts. Default sarvam-105b, effort low, 5-call cap in scripts/judge-smoke.ts. Later work: backend/dev_progress and project_progress.

Evidence: [docs/judge-model-findings.md](../../docs/judge-model-findings.md)
