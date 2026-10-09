import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, getBackendStatus } from "@/lib/api";

describe("api module", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("marks the backend offline when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));

    await expect(api("/traffic")).rejects.toThrow();

    expect(getBackendStatus()).toBe("offline");
  });

  it("marks the backend online and surfaces the error envelope on HTTP errors", async () => {
    const body = { error: { code: "not_found", message: "nope" } };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 404 })),
    );

    await expect(api("/audits/x")).rejects.toBeInstanceOf(ApiError);

    expect(getBackendStatus()).toBe("online");
  });
});
