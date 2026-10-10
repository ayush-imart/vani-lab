import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { Performance } from "@/components/vani/performance";

describe("Performance version selection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
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

  it("shows details in a centered dialog with KPI, score and cohort grids, and Esc closes it", { timeout: 20000 }, async () => {
    render(
      <TooltipProvider>
        <Performance />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open details for Version B" }));

    const dialog = await screen.findByRole("dialog", { name: /Version B/ });
    expect(dialog).toHaveClass("version-dialog");
    expect(within(dialog).getByRole("group", { name: "KPIs" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Scores (1 to 5)" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: /Cohorts/ })).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), {
      timeout: 8000,
    });
  });
});
