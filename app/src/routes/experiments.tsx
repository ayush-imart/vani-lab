import { createFileRoute } from "@tanstack/react-router";
import { Experiments } from "@/components/vani/experiments";
import { metadata } from "@/components/vani/data";
export const Route = createFileRoute("/experiments")({
  head: () =>
    metadata(
      "Experiments",
      "Track live and past A/B test experiments with traffic, timelines, metrics and impact.",
    ),
  component: Experiments,
});
