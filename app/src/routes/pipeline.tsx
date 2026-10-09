import { createFileRoute } from "@tanstack/react-router";
import { Pipeline } from "@/components/vani/pipeline";
import { metadata } from "@/components/vani/data";
export const Route = createFileRoute("/pipeline")({
  head: () =>
    metadata(
      "Live Pipeline",
      "Follow VANI prompt experiments from definition to live evidence and safer decisions.",
    ),
  component: Pipeline,
});
