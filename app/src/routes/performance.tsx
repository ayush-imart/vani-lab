import { createFileRoute } from "@tanstack/react-router";
import { Performance } from "@/components/vani/performance";
import { metadata } from "@/components/vani/data";
export const Route = createFileRoute("/performance")({
  head: () =>
    metadata(
      "Performance",
      "Live performance of every VANI prompt version by seller cohort, with a ranked leaderboard.",
    ),
  component: Performance,
});
