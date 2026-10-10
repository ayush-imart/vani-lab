import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import {
  createSarvamSession,
  friendlyError,
  mapAgentState,
  mapRole,
  type AgentCallbacks,
  type AgentLike,
  type CallSessionEvents,
  type CallSessionState,
  type SarvamDeps,
  type SessionConfig,
} from "@/components/vani/call-session";

const config: SessionConfig = {
  versionId: "B",
  orgId: "org",
  workspaceId: "ws",
  appId: "app",
  baseUrl: "http://localhost:8787/sarvam/",
  inputSampleRate: 16000,
  outputSampleRate: 16000,
};

function setup(overrides: Partial<SarvamDeps> = {}, agentOverrides: Partial<AgentLike> = {}) {
  const states: CallSessionState[] = [];
  const turns: { speaker: string; text: string }[] = [];
  const levels: number[] = [];
  const errors: string[] = [];
  const events: CallSessionEvents = {
    onState: (s) => states.push(s),
    onTranscript: (t) => turns.push(t),
    onLevel: (l) => levels.push(l),
    onError: (m) => errors.push(m),
  };
  let callbacks: AgentCallbacks | undefined;
  const agent: AgentLike = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    waitForConnect: vi.fn().mockResolvedValue(true),
    mute: vi.fn(),
    unmute: vi.fn(),
    ...agentOverrides,
  };
  const deps: SarvamDeps = {
    fetchSession: vi.fn().mockResolvedValue(config),
    createAgent: vi.fn(async (_c, cb) => {
      callbacks = cb;
      return agent;
    }),
    ...overrides,
  };
  const session = createSarvamSession("B", events, deps);
  return {
    session,
    agent,
    deps,
    states,
    turns,
    levels,
    errors,
    cb: () => callbacks as AgentCallbacks,
  };
}

describe("call session adapter", () => {
  it("maps SDK states and roles", () => {
    expect(mapAgentState("connecting")).toBe("connecting");
    expect(mapAgentState("connected")).toBe("connecting");
    expect(mapAgentState("listening")).toBe("listening");
    expect(mapAgentState("speaking")).toBe("speaking");
    expect(mapAgentState("error")).toBe("error");
    expect(mapAgentState("idle")).toBe("idle");
    expect(mapRole("user")).toBe("seller");
    expect(mapRole("bot")).toBe("bot");
  });

  it("starts the agent, waits for the connection and maps transcripts", async () => {
    const t = setup();

    await t.session.start();
    await t.cb().transcriptCallback({ role: "bot", content: "Namaste" });
    await t.cb().transcriptCallback({ role: "user", content: "haan" });
    await t.cb().transcriptCallback({ role: "user", content: "   " });

    expect(t.agent.start).toHaveBeenCalled();
    expect(t.agent.waitForConnect).toHaveBeenCalledWith(10);
    expect(t.turns).toEqual([
      { speaker: "bot", text: "Namaste" },
      { speaker: "seller", text: "haan" },
    ]);
  });

  it("forwards SDK state and the right audio level", async () => {
    const t = setup();
    await t.session.start();

    t.cb().stateCallback("listening", "connected");
    t.cb().audioLevelCallback({ direction: "input", rms: 0.2, peak: 0.3 });
    t.cb().audioLevelCallback({ direction: "output", rms: 0.9, peak: 1 });
    t.cb().stateCallback("speaking", "listening");
    t.cb().audioLevelCallback({ direction: "output", rms: 0.5, peak: 0.6 });

    expect(t.states.at(-1)).toBe("speaking");
    expect(t.levels).toEqual([0.2, 0.5]);
  });

  it("reports unavailable when the backend answers 503", async () => {
    const t = setup({ fetchSession: vi.fn().mockRejectedValue(new ApiError("not set up", 503)) });

    await t.session.start();

    expect(t.states.at(-1)).toBe("unavailable");
    expect(t.deps.createAgent).not.toHaveBeenCalled();
  });

  it("shows a friendly microphone error", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const t = setup({}, { start: vi.fn().mockRejectedValue(denied) });

    await t.session.start();

    expect(t.states.at(-1)).toBe("error");
    expect(t.errors[0]).toMatch(/Microphone access was blocked/);
    expect(friendlyError(Object.assign(new Error("x"), { name: "NotFoundError" }))).toBe("");
    expect(friendlyError(Object.assign(new Error("x"), { name: "NotReadableError" }))).toMatch(
      /in use/,
    );
  });

  it("stops the agent and ends the session, ignoring later SDK states", async () => {
    const t = setup();
    await t.session.start();

    await t.session.stop();
    t.cb().stateCallback("listening", "speaking");

    expect(t.agent.stop).toHaveBeenCalledTimes(1);
    expect(t.states.at(-1)).toBe("ended");
  });

  it("mutes and unmutes the agent", async () => {
    const t = setup();
    await t.session.start();

    t.session.setMuted(true);
    t.session.setMuted(false);

    expect(t.agent.mute).toHaveBeenCalledTimes(1);
    expect(t.agent.unmute).toHaveBeenCalledTimes(1);
  });
});
