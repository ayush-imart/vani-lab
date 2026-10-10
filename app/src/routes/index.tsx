import { createFileRoute, redirect } from "@tanstack/react-router";
import { metadata } from "@/components/vani/data";
export const Route = createFileRoute("/")({
  head: () =>
    metadata(
      "Experiments",
      "Every VANI prompt experiment with its status. Open one to scope the app to it.",
    ),
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/experiments", search: location.search as never });
  },
});
