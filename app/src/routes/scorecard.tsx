import { createFileRoute } from "@tanstack/react-router";
import { Scorecard } from "@/components/vani/scorecard";
import { metadata } from "@/components/vani/data";
export const Route = createFileRoute("/scorecard")({
  head: () =>
    metadata(
      "Scorecard",
      "Compare VANI prompt quality, performance metrics and guardrails with transparent evidence.",
    ),
  component: Scorecard,
});
