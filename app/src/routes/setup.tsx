import { createFileRoute } from "@tanstack/react-router";
import { Setup } from "@/components/vani/setup";
import { metadata } from "@/components/vani/data";
export const Route = createFileRoute("/setup")({
  head: () =>
    metadata(
      "Experiment Setup",
      "Define a hypothesis, traffic allocation, evaluation metrics and a safe VANI experiment.",
    ),
  component: Setup,
});
