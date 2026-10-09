import { createFileRoute } from "@tanstack/react-router";
import { ScaleUp } from "@/components/vani/scale-up";
import { metadata } from "@/components/vani/data";
export const Route = createFileRoute("/scale-up")({
  head: () =>
    metadata(
      "Scale-up",
      "Review VANI traffic segments and safely preview a prompt rollout by GLID or mobile ending digit.",
    ),
  component: ScaleUp,
});
