# Sarvam Voice Agents: findings

## Platform
- Voice Agents live at indus.sarvam.ai/samvaad. Build (agents, canvas, instructions, speakers), deploy (phone numbers, inbound, campaigns, deploy with code), monitor (analytics). The pipeline is ASR -> LLM -> TTS, 11 Indian languages plus English, code-mixed speech supported, models self-hosted in India. [S1] [L: sarvam-knowledge-base/voice-agents-overview.txt]
- Quickstart: Agents (Build) -> Create from scratch -> Canvas -> Instructions tab (greeting + system prompt) -> Settings / voice -> test agent -> Phone Numbers. The page does not say where org / workspace / app ids are shown. [S2]
- Edits go to a mutable draft; a commit makes an immutable version; deployments, campaigns and evals use committed versions. [S3]

## Browser SDK (what the call window uses)
- Package `sarvam-conv-ai-sdk`, browser entry `sarvam-conv-ai-sdk/browser` (`ConversationAgent`, `BrowserAudioInterface`). Config: org_id, workspace_id, app_id, optional `version` (latest committed if omitted), user identifier and type, `interaction_type` CALL, sample rates 8000/16000 in and 16000/22050 out. Callbacks: transcript (role USER or BOT), state (IDLE, CONNECTING, CONNECTED, LISTENING, SPEAKING, ERROR), audio level, events. `start()` from a click, `waitForConnect`, `stop()`, `mute()` / `unmute()`. No reconnection: create a new agent after a drop. [S4]
- Docs recommend a server-side proxy: set `baseUrl` to your backend and leave `apiKey` empty. [S4]
- The backend implementation read the package source (v0.0.42): runtime base `https://apps.sarvam.ai/api/app-runtime/`, header `X-API-Key`, signed WebSocket URL returned to the browser. This is not confirmed by the docs and has not been run against a real agent. [L: backend/src/services/sessions.ts]

## Keys and ids
- Voice Agents key: dashboard Settings -> API Key -> Create API key; keep it server-side. The header name and scope are not documented on that page. [S5]
- [O] The Settings -> API Key page shows the Workspace id and Org id (copy icons). At inspection no key existed, the Agents list was empty, Usage was empty, and there were 89 credits.
- [O] With the Voice Agents key, `GET apps.sarvam.ai/api/app-runtime/.../apps/does-not-exist/url` returned 404 (valid key). The Model API key via `X-API-Key` returned 401 "Invalid API key format"; via `api-subscription-key` it returned 422 (X-API-Key required). So the two keys are different kinds.
- `SARVAM_LLM_API_KEY`: the hackathon says teams get "an LLM key"; its purpose is not documented in the provided files. [L: provided-data/hackathon/faq.txt]
- Security incident (2026-10-09): the voice key value was printed once in tool output because of a `keys.env` typo. The typo is fixed; rotation is recommended.

## MCP
- Hosted Voice Agents MCP `https://mcp.sarvam.ai/voice-agents`: OAuth 2.1 via Sarvam SSO, token about 24 hours, no API key in config. Tools include `configure_agent`, `configure_deployment`, `place_test_call`, `run_eval`. Install: `claude mcp add --transport http sarvam-voice-agents https://mcp.sarvam.ai/voice-agents`, then `/mcp` -> Authenticate. [S3]
- Docs MCP `https://docs.sarvam.ai/_mcp/server` (searchDocs); API MCP `uvx sarvam-mcp` needs SARVAM_API_KEY in the shell environment. [S6]
- [O] `claude mcp list`: sarvam-docs connected; sarvam-api connected (warns the env var is missing); sarvam-voice-agents "Needs authentication" (only the user can complete OAuth).

## Open questions
- One agent with three committed versions vs three agents for A/B/C (the versioning page was not retrievable).
- Whether the Instructions field accepts the 159k-character prompt.
- Cost per call minute vs the 89 credits.

## Sources
- S1 https://docs.sarvam.ai/conversations/overview
- S2 https://docs.sarvam.ai/conversations/quickstart
- S3 https://docs.sarvam.ai/conversations/mcp
- S4 https://docs.sarvam.ai/conversations/deploy/sdks/web
- S5 https://docs.sarvam.ai/conversations/settings/api-key
- S6 https://docs.sarvam.ai/api-reference-docs/developer-tools/mcp
