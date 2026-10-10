// Version slots (A/B/C) of the experiment in scope; null = no experiment selected or unknown,
// in which case screens show every version as before.
import { useEffect, useState } from "react";
import { useExperimentId } from "@/lib/experiment-scope";
import { experimentSlots, listExperiments, listVersions } from "@/lib/experiments-api";

export function scopeIds<T extends string>(
  all: readonly T[],
  slots: string[] | null,
  isExperimentScoped = false,
): T[] {
  if (!slots) return isExperimentScoped ? [...all].slice(0, 2) : [...all];
  const scoped = all.filter((id) => slots.includes(id));
  return (scoped.length > 0 ? scoped : [...all]).slice(0, 2);
}

export function useScopedSlots(): string[] | null {
  const experimentId = useExperimentId();
  const [slots, setSlots] = useState<string[] | null>(null);
  useEffect(() => {
    if (!experimentId) {
      setSlots(null);
      return;
    }
    let alive = true;
    Promise.all([listExperiments(), listVersions()])
      .then(([exps, versions]) => {
        const exp = exps.find((e) => e.id === experimentId);
        if (alive) setSlots(exp ? experimentSlots(exp, versions) : null);
      })
      .catch(() => alive && setSlots(null));
    return () => {
      alive = false;
    };
  }, [experimentId]);
  return slots;
}
