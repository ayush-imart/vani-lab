# Sarvam agent configuration as code

`backend/sarvam/agents.json` is the desired-state manifest for the three Sarvam apps selected by A/B/C. Prompt text is sourced from `app/src/components/vani/data.ts#versionPrompts`; the browser SDK sends only the selected app ID and does not override the prompt.

## Sync flow

1. Apply `Aparna - Support Agent` on Bulbul V4 as the urgent Hindi female support voice; verify it against the IndiaMART `main_vani` reference during follow-up.
2. Use the authenticated official `sarvam-voice-agents` MCP from a session where its agent-management tools are exposed.
3. For each slot, read the manifest and its prompt export, apply the complete greeting, instructions, voice, language, and required settings with `configure_agent`, then commit an immutable version.
4. Read the committed versions back and verify the app IDs still map to A/B/C. Keep the manifest and committed provider state in sync.

The manifest selects `Aparna - Support Agent` because it is a Hindi female support voice, with the observed speaking speed, pitch, per-language setting and starting language recorded as configurable fields. The live C agent was observed with an empty Instructions field, a buyer-help-desk greeting, and `Shubh` selected; A and B were previously observed with `Shubh`. Those settings do not represent the seller-meeting prompt variants in this repository. Do not treat the desired manifest as already applied.

Sarvam MCP requires OAuth and exposes typed configuration tools; it does not take a static API token in Codex config. The Codex server entry is global/local configuration and is not committed to this repository.
