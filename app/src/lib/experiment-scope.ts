// Global experiment scope (Phase E1/E3). The selected experiment lives in the URL (`?exp=<id>`)
// so links are shareable; localStorage remembers the last choice when the URL has none.
import { useSyncExternalStore } from "react";

export const EXP_PARAM = "exp";
export const EXP_STORAGE_KEY = "vani.experiment";
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

// Exact rules, no guessing: a valid URL id wins, then a valid stored id, else nothing selected.
export function resolveExperimentId(urlValue: unknown, stored: string | null): string | null {
  if (typeof urlValue === "string" && ID_PATTERN.test(urlValue)) return urlValue;
  if (stored && ID_PATTERN.test(stored)) return stored;
  return null;
}

// Appends experimentId to an API path when an experiment is selected (backend filter is optional).
export function withExperiment(path: string, experimentId: string | null): string {
  if (!experimentId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}experimentId=${encodeURIComponent(experimentId)}`;
}

function readStored(): string | null {
  try {
    return localStorage.getItem(EXP_STORAGE_KEY);
  } catch {
    return null; // storage unavailable (private window): URL still works
  }
}

let current: string | null = null;
const listeners = new Set<() => void>();

export function getExperimentId(): string | null {
  return current;
}

export function setExperimentId(next: string | null): void {
  if (next !== null && !ID_PATTERN.test(next)) return;
  try {
    if (next) localStorage.setItem(EXP_STORAGE_KEY, next);
    else localStorage.removeItem(EXP_STORAGE_KEY);
  } catch {
    /* storage unavailable: in-memory + URL only */
  }
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

// Called by the shell whenever the URL search changes.
export function syncExperimentFromUrl(urlValue: unknown): string | null {
  const id = resolveExperimentId(urlValue, readStored());
  setExperimentId(id);
  return id;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useExperimentId = () =>
  useSyncExternalStore(subscribe, getExperimentId, () => null);
