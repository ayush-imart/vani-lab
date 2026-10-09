// The one place the frontend talks to the VANI Lab backend (contract: backend/API_CONTRACT.md,
// schemas copied to ./api-contract.ts). Every caller keeps a synthetic fallback for when the
// backend is unreachable; `useBackendStatus` tells the UI which source it is showing.
import { useSyncExternalStore } from "react";
import type { z } from "zod/v4";

type EnvWithApi = { VITE_API_URL?: string; PROD?: boolean };
const env = (import.meta as unknown as { env?: EnvWithApi }).env;
const configuredApiOrigin = env?.VITE_API_URL ?? (env?.PROD ? "/api/vani" : "http://localhost:8787");
export const API_URL = configuredApiOrigin.replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 4000;

export type BackendStatus = "unknown" | "online" | "offline";
let status: BackendStatus = "unknown";
const listeners = new Set<() => void>();
function setStatus(next: BackendStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getBackendStatus = () => status;
export const useBackendStatus = () =>
  useSyncExternalStore(subscribe, getBackendStatus, () => "unknown" as BackendStatus);

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Network failures flip the status to offline; HTTP errors from a reachable backend do not.
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; schema?: z.ZodType<T> } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const init: RequestInit = { method: options.method ?? "GET", signal: controller.signal };
    if (options.body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${API_URL}${path}`, init);
    setStatus("online");
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        (json as { error?: { message?: string } } | null)?.error?.message ?? res.statusText;
      throw new ApiError(message, res.status);
    }
    return options.schema ? options.schema.parse(json) : (json as T);
  } catch (error) {
    if (!(error instanceof ApiError) && !isParseError(error)) setStatus("offline");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isParseError(error: unknown) {
  return typeof error === "object" && error !== null && "issues" in error;
}

export const apiUrl = (path: string) => `${API_URL}${path}`;
