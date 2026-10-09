import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { Performance } from "@/components/vani/performance";

describe("Performance version selection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens version details when a version card is clicked", async () => {
    render(
      <TooltipProvider>
        <Performance />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open details for Version B" }));

    expect(screen.getByText(/Detailed stats/)).toBeInTheDocument();
  });

  it("opens version details when a leaderboard row is clicked", async () => {
    render(
      <TooltipProvider>
        <Performance />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Details for Version A" }));

    expect(screen.getByText(/Detailed stats/)).toBeInTheDocument();
  });
});
