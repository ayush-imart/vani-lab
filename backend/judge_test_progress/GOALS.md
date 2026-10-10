# Judge (Eve agent) local test: goals

Source plan: `C:\Users\Imart\.claude\plans\stateful-crafting-lark.md` (Auditor/Judge, sarvam-30b, transcripts in) + user ask "test the eve agent locally". PM spec: [docs/pm-guardrails-and-autoscale-spec.md](../../docs/pm-guardrails-and-autoscale-spec.md).

| # | Goal | Status | Covers |
|---|------|--------|--------|
| G1 | Offline checks: types, unit tests, `eve build` | ✅ Done (smoke tested) | Plan: Verification |
| G2 | Local runtime up: `eve dev --no-ui` | ✅ Done (health ready; `info` not re-checked) | Plan: Auditor contract |
| G3 | Sarvam reachability | ⚠️ Done with known issue: sarvam-30b retired, sarvam-105b works | Plan: model route |
| G4 | Judge e2e on synthetic transcripts via Eve client + outputSchema | ✅ Done (10/10 valid after token-budget fix) | Plan: Auditor contract |
| G5 | Quality + robustness | ⚠️ Partly done: injection resisted; callbackRequested/meetingFixed prompt tweak not re-verified | Plan: Verification |
| G6 | **Emit IndiaMART evaluator JSON** (PM data basis) so every metric works on simulated/replayed/live calls | ⬜ Not started | PM spec: Data basis |
| G7 | **Emit all 9 guardrail signals** (fake meetings, early drop, DNC, looping, repeat, unanswered, system-dropped, P95 latency, talk-over) | ⬜ Not started | PM spec: Guardrails |
| G8 | **Pre-prod regression suite** (8 scripted personas with unambiguous right answers) | ⬜ Not started | PM spec: Pre-prod |
| G9 | Report coverage % next to every evaluator-based metric; return the actual model id | ⬜ Not started | PM spec + audit |

## Update log
- 2026-10-10: added G6–G9. The judge output must match IndiaMART's evaluator JSON formats before it can feed the PM spec's metrics/guardrails.
- 2026-10-09: G1 done; G2/G3 done with issues; G4 in progress.
- 2026-10-09: root cause of empty answers = reasoning budget; fixed in agent/agent.ts. Default sarvam-105b, effort low, 5-call cap. Later work continues in backend/dev_progress and project_progress.

Evidence: [docs/judge-model-findings.md](../../docs/judge-model-findings.md), [PM spec](../../docs/pm-guardrails-and-autoscale-spec.md)
