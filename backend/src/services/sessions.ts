// Live voice session scaffold for Sarvam Voice Agents (browser sarvam-conv-ai-sdk).
// The browser gets only non-secret ids plus a baseUrl that points back at this API. The SDK then does
//   GET {baseUrl}orgs/{org}/workspaces/{ws}/apps/{app}/url?interaction_type=call&version=..&user_identifier=..
// with an (empty) X-API-Key header; the proxy below forwards that call to Sarvam and adds the real key
// (SARVAM_VOICE_API_KEY, server-side only). Sarvam returns { url, reference_id }; the signed, single-use
// WebSocket URL goes straight to the browser, so audio never passes through this API.
// Verified by reading sarvam-conv-ai-sdk 0.0.42 (dist/modules/socket-manager.js); no call to Sarvam made yet.
import type { VersionSlot } from "../contract";
import { AppError, badRequest } from "../lib/errors";

export const SARVAM_RUNTIME_BASE = "https://apps.sarvam.ai/api/app-runtime/";
const ALLOWED_QUERY = ["interaction_type", "version", "user_identifier", "user_identifier_type"];

export type VoiceConfig = {
  orgId?: string | undefined;
  workspaceId?: string | undefined;
  appIds: Partial<Record<VersionSlot, string | undefined>>;
  apiKey?: string | undefined; // SARVAM_VOICE_API_KEY, never returned to clients
  publicApiUrl: string;
};

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<Response>;

const unavailable = (message: string) => new AppError(503, "unavailable", message);

export function createSessionService(config: VoiceConfig, fetchImpl: FetchLike = fetch) {
  const baseUrl = `${config.publicApiUrl.replace(/\/$/, "")}/sarvam/`;
  const known = (org: string, ws: string, app: string): boolean =>
    org === config.orgId &&
    ws === config.workspaceId &&
    Object.values(config.appIds).some((id) => id !== undefined && id === app);

  return {
    create(versionId: VersionSlot) {
      const appId = config.appIds[versionId];
      if (!config.orgId || !config.workspaceId || !appId) {
        throw unavailable(
          `Voice agent for version ${versionId} is not configured (SARVAM_ORG_ID, SARVAM_WORKSPACE_ID, SARVAM_APP_ID_${versionId})`,
        );
      }
      return {
        versionId,
        orgId: config.orgId,
        workspaceId: config.workspaceId,
        appId,
        baseUrl,
        inputSampleRate: 16000 as const,
        outputSampleRate: 16000 as const,
      };
    },

    // Forwards the signed-URL request of the SDK. Only exact org/workspace/app ids from env are allowed.
    async proxySignedUrl(org: string, ws: string, app: string, query: Record<string, string>) {
      if (!config.apiKey) throw unavailable("Voice agents API key is not configured (SARVAM_VOICE_API_KEY)");
      if (!known(org, ws, app)) throw badRequest("Unknown organisation, workspace or app");
      const params = new URLSearchParams();
      ALLOWED_QUERY.forEach((k) => {
        const v = query[k];
        if (v !== undefined) params.set(k, v);
      });
      const url = `${SARVAM_RUNTIME_BASE}orgs/${encodeURIComponent(org)}/workspaces/${encodeURIComponent(ws)}/apps/${encodeURIComponent(app)}/url?${params.toString()}`;
      const upstream = await fetchImpl(url, { method: "GET", headers: { "X-API-Key": config.apiKey } });
      return { status: upstream.status, body: await upstream.text() };
    },
  };
}
export type SessionService = ReturnType<typeof createSessionService>;
