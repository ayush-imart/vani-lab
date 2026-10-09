# Findings and test log (real results only)

## Findings
- **Sarvam models**: sarvam-30b retired (HTTP 400); live /v1 serves sarvam-105b and sarvam-105b-conversations (docs list identical price). sarvam-105b is a reasoning model: default output budget ran out ("length", empty answer). Fix: providerOptions.sarvam {max_tokens 8000, reasoning_effort "low"} -> 10/10 valid.
- **Voice Agents**: platform indus.sarvam.ai/samvaad; browser SDK `sarvam-conv-ai-sdk` (ConversationAgent, BrowserAudioInterface); needs org_id, workspace_id, app_id (+ optional version) and a Voice Agents API key kept server-side (proxy). Dashboard: 89 credits, no agents, no usage at inspection. Settings->API Key page shows org + workspace ids.
- **Voice key check**: X-API-Key against apps.sarvam.ai app-runtime returned 404 for a fake app (not 401) => key authenticates.
- **MCP**: sarvam-docs connected; sarvam-api connected (warns SARVAM_API_KEY not in the shell env); sarvam-voice-agents needs OAuth (user must do it in /mcp).
- **Drive data**: Best-Time-to-Call (530k attempts), Global Context seller dataset (bot calls + turns), PS07 persona files (bot calls, evaluator outputs, call turns, 5000-call recording sample), call_recordings (713 mp3), "Current Definitions of Call Quality Matrix" (dead air >5s, looping, WER, fatal/non-fatal), buyer-side VANI prompt docx. Contains real seller names: internal use only, never upload, aggregates only.
- **Deployment (researched, third-party sources, verify)**: Supabase free (500 MB, pauses after 7 days idle, no backups); Vercel Hobby is non-commercial; Render free web service sleeps (~1 min cold start) and has no persistent disk; autoscale scheduler needs an external cron tick.
- **UI libs**: bencho.dev = copy-paste interaction demos, code behind sign-in, no CLI/registry, browser tool could not read code, none imported. rareui.com = free `npx shadcn@latest add swamimalode07/rare-ui/<name>`, nothing installed. beui.dev (checked via fetch, not Chrome) = MIT, 138 animated components on Motion + Tailwind 4, shadcn registry (`shadcn add @beui/<name>`), has Voice Orb (voice-reactive visual), charts, command palette; MCP is Pro only; no table or call components; docs at /docs/theme, /docs/motion-patterns, /llms.txt, GitHub starc007/ui-components. Fits better than bencho for this app (already uses Motion + shadcn).

## Test log
- 2026-10-09 app: tsc clean, vitest 37/37 (frontend agent report). Backend: tsc clean, vitest 35/35, eve build OK (backend agent report). Both run before final voice work.
- 2026-10-09 judge: 10/10 valid after token fix; 1 real audit via POST /audits scored 4.1.
- Not verified: Supabase SQL/adapter, voice proxy against live Sarvam, real audio, reduced-motion in browser, bell first-click, bencho/rareui imports.

## Evidence docs (citations)
See [docs/README.md](../docs/README.md): [Sarvam voice agents](../docs/sarvam-voice-agents.md), [Judge model](../docs/judge-model-findings.md), [Drive data + VANI prompt](../docs/drive-data-and-vani-prompt.md), [Deployment](../docs/deployment-options.md), [UI libraries](../docs/ui-libraries.md).
