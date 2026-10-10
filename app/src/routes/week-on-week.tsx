import { createFileRoute } from "@tanstack/react-router";
import { WeekOnWeek } from "@/components/vani/week-on-week";
import { metadata } from "@/components/vani/data";
export const Route = createFileRoute("/week-on-week")({
  head: () =>
    metadata(
      "Week-on-week",
      "Compare KPI scores week over week. Spot regressions and launch targeted A/B tests.",
    ),
  component: WeekOnWeek,
});
