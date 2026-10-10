import { PageTitle } from "./common";
import { Autoscale } from "./autoscale";
import { RolloutPanel } from "./rollout-panel";

// Scale-up page: the experiment-scoped rollout plan plus autoscale evidence. The old local-only
// segment map and "Scale to a new segment" dialog were removed because they never persisted.
export function ScaleUp() {
  return (
    <>
      <PageTitle
        eyebrow="EXPERIMENT / SCALE-UP"
        title="Grow the winner. Keep control."
        description="The rollout plan for the selected experiment and the autoscale evidence behind each step."
      />
      <RolloutPanel />
      <Autoscale />
    </>
  );
}
