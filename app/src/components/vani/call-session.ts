// Audio/transcript layer behind the call window. The real implementation talks to a Sarvam voice agent
// through the official browser SDK; the API key never reaches the browser (the backend proxies the
// signed-URL request, see backend/API_CONTRACT.md `/sessions`). The scripted bot is only used when
// VITE_SCRIPTED_CALLS=1 (dev flag).
import { ApiError, api } from "@/lib/api";
import { sessionConfigSchema } from "@/lib/api-contract";
import type { z } from "zod/v4";
import type { CallTurn } from "./audit-client";
import { openingLine } from "./call-script";
import type { VersionId } from "./performance-data";

export type CallSessionState =
  "idle" | "connecting" | "listening" | "speaking" | "ended" | "unavailable" | "error";

export type CallSessionEvents = {
  onState: (state: CallSessionState) => void;
  onTranscript: (turn: CallTurn) => void;
  /** Audio level 0..1 (output while the agent speaks, microphone while listening). */
  onLevel: (level: number) => void;
  onError: (message: string) => void;
};

export interface CallSession {
  /** Must be called from a user gesture (microphone permission, audio context). */
  start(): Promise<void>;
  stop(): Promise<void>;
  setMuted(muted: boolean): void;
}

export type SessionConfig = z.infer<typeof sessionConfigSchema>;

// Minimal slice of the SDK's ConversationAgent that the adapter uses (also what tests fake).
export interface AgentLike {
  start(): Promise<void>;
  stop(): Promise<void>;
  waitForConnect(timeoutSeconds?: number): Promise<boolean>;
  mute(): void;
  unmute(): void;
}
export type AgentCallbacks = {
  transcriptCallback: (msg: { role: string; content: string }) => Promise<void>;
  stateCallback: (state: string, previous: string) => void;
  audioLevelCallback: (level: { direction: string; rms: number; peak: number }) => void;
  endCallback: () => Promise<void>;
};
export type SarvamDeps = {
  fetchSession: (version: VersionId) => Promise<SessionConfig>;
  createAgent: (config: SessionConfig, callbacks: AgentCallbacks) => Promise<AgentLike>;
};

const CONNECT_TIMEOUT_S = 10;
const MIC_ERRORS: Record<string, string> = {
  NotAllowedError:
    "Microphone access was blocked. Allow the microphone in the browser and try again.",
  NotFoundError: "No microphone was found. Connect one and try again.",
  NotReadableError: "The microphone is in use by another application.",
};

export function friendlyError(error: unknown): string {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  const known = MIC_ERRORS[name];
  if (known) return known;
  return error instanceof Error && error.message ? error.message : "The voice call failed.";
}

const defaultDeps: SarvamDeps = {
  fetchSession: (version) =>
    api("/sessions", { method: "POST", body: { versionId: version }, schema: sessionConfigSchema }),
  createAgent: async (config, callbacks) => {
    const sdk = await import("sarvam-conv-ai-sdk/browser");
    return new sdk.ConversationAgent({
      apiKey: "", // the backend proxy adds the real key; it must never be in the browser
      baseUrl: config.baseUrl,
      config: {
        user_identifier_type: "custom",
        user_identifier: `vani-lab-${crypto.randomUUID()}`,
        org_id: config.orgId,
        workspace_id: config.workspaceId,
        app_id: config.appId,
        interaction_type: sdk.InteractionType.CALL,
        input_sample_rate: config.inputSampleRate,
        output_sample_rate: 16000,
      },
      audioInterface: new sdk.BrowserAudioInterface(),
      transcriptCallback: callbacks.transcriptCallback as never,
      stateCallback: callbacks.stateCallback as never,
      audioLevelCallback: callbacks.audioLevelCallback as never,
      endCallback: callbacks.endCallback,
    });
  },
};

// SDK states: idle, connecting, connected, listening, speaking, error.
export function mapAgentState(state: string): CallSessionState {
  switch (state) {
    case "connecting":
    case "connected":
      return "connecting";
    case "listening":
      return "listening";
    case "speaking":
      return "speaking";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

export function mapRole(role: string): CallTurn["speaker"] {
  return role === "user" ? "seller" : "bot";
}

export function createSarvamSession(
  version: VersionId,
  events: CallSessionEvents,
  deps: SarvamDeps = defaultDeps,
): CallSession {
  let agent: AgentLike | null = null;
  let stopped = false;
  let muted = false;
  let current: CallSessionState = "idle";
  const setState = (state: CallSessionState) => {
    current = state;
    events.onState(state);
  };

  return {
    async start() {
      stopped = false;
      setState("connecting");
      let config: SessionConfig;
      try {
        config = await deps.fetchSession(version);
      } catch (error) {
        // 503 means the Sarvam app for this version is not configured yet.
        if (error instanceof ApiError && error.status === 503) {
          setState("unavailable");
          return;
        }
        setState("error");
        events.onError("Could not reach the voice service. Is the backend running?");
        return;
      }
      try {
        agent = await deps.createAgent(config, {
          transcriptCallback: async (msg) => {
            if (msg.content?.trim())
              events.onTranscript({ speaker: mapRole(msg.role), text: msg.content });
          },
          stateCallback: (state) => {
            if (!stopped) setState(mapAgentState(state));
          },
          audioLevelCallback: (level) => {
            // Output level while the agent speaks, microphone level otherwise.
            const wanted = current === "speaking" ? "output" : "input";
            if (level.direction === wanted) events.onLevel(Math.min(1, Math.max(0, level.rms)));
          },
          endCallback: async () => {
            if (!stopped) setState("ended");
          },
        });
        await agent.start();
        const connected = await agent.waitForConnect(CONNECT_TIMEOUT_S);
        if (!connected) throw new Error("Could not connect to the voice agent in time.");
        if (muted) agent.mute();
      } catch (error) {
        setState("error");
        events.onError(friendlyError(error));
        await agent?.stop().catch(() => undefined);
        agent = null;
      }
    },
    async stop() {
      stopped = true;
      const active = agent;
      agent = null;
      if (active) await active.stop().catch(() => undefined);
      setState("ended");
    },
    setMuted(next) {
      muted = next;
      if (!agent) return;
      if (next) agent.mute();
      else agent.unmute();
    },
  };
}

// Dev-only scripted bot, behind VITE_SCRIPTED_CALLS=1.
export function createScriptedSession(version: VersionId, events: CallSessionEvents): CallSession {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    async start() {
      events.onState("listening");
      events.onTranscript({ speaker: "bot", text: openingLine(version) });
      events.onState("speaking");
      timer = setTimeout(() => events.onState("listening"), 2200);
    },
    async stop() {
      if (timer) clearTimeout(timer);
      events.onState("ended");
    },
    setMuted() {},
  };
}

type EnvWithFlag = { VITE_SCRIPTED_CALLS?: string };
const scriptedEnabled = () =>
  (import.meta as unknown as { env?: EnvWithFlag }).env?.VITE_SCRIPTED_CALLS === "1";

export function createCallSession(version: VersionId, events: CallSessionEvents): CallSession {
  return scriptedEnabled()
    ? createScriptedSession(version, events)
    : createSarvamSession(version, events);
}
