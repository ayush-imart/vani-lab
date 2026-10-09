import { createFileRoute } from "@tanstack/react-router";
import { Prompts } from "@/components/vani/prompts";
import { metadata } from "@/components/vani/data";
export const Route = createFileRoute("/prompts")({
  head: () =>
    metadata(
      "Prompts",
      "Edit, compare and version VANI voice agent prompts without overwriting saved versions.",
    ),
  component: Prompts,
});
