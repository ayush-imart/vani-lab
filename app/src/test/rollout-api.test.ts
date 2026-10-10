import { afterEach, describe, expect, it, vi } from "vitest";
import { rolloutAction, getDecisions } from "@/lib/rollout-api";

describe("rollout-api", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("POSTs approve to the rollout endpoint", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await rolloutAction("e 1", "approve");
    expect(f.mock.calls[0]![0]).toMatch(/\/experiments\/e%201\/rollout\/approve$/);
    expect(f.mock.calls[0]![1].method).toBe("POST");
  });
  it("rejects a malformed decisions payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"items":[{"id":1}]}')));
    await expect(getDecisions("e")).rejects.toBeTruthy();
  });
});
