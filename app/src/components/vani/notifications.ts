// Tiny external store so any page can push an alert into the shell's notification panel.
import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { notificationSchema, type Notification } from "@/lib/api-contract";
import { z } from "zod/v4";

export type AppNotification = {
  id: number | string;
  title: string;
  detail: string;
  to: string;
  at: number;
  unread: boolean;
  source: "system" | "autoscale";
};

const seed: AppNotification[] = [
  ["Decision waiting for approval", "/scorecard"],
  ["Version C flagged for review", "/scorecard"],
  ["Pre-prod evaluations passed", "/pipeline"],
  ["Test window ends in 5 days", "/scorecard"],
].map(([title, to], i) => ({
  id: -(i + 1),
  title: title as string,
  detail: "Sample alert",
  to: to as string,
  at: Date.UTC(2026, 9, 9, 8, 0, 0) - (i + 1) * 3_600_000,
  unread: i < 3,
  source: "system",
}));

const SYNC_MS = 8000;
let local: AppNotification[] = [];
let remote: AppNotification[] | null = null;
let items: AppNotification[] = seed;
let nextId = 1;
const listeners = new Set<() => void>();
const recompute = () => {
  items = [...local, ...(remote ?? seed)];
  listeners.forEach((l) => l());
};

const fromBackend = (n: Notification): AppNotification => ({
  id: n.id,
  title: n.title,
  detail: n.body,
  to: n.kind === "info" ? "/" : "/scale-up",
  at: Date.parse(n.createdAt) || Date.now(),
  unread: !n.read,
  source: n.kind === "info" ? "system" : "autoscale",
});

// Local push, used only while the backend is unreachable (the backend creates its own notifications).
export function pushNotification(n: Pick<AppNotification, "title" | "detail" | "to" | "source">) {
  local = [{ ...n, id: nextId++, at: Date.now(), unread: true }, ...local];
  recompute();
}

export const hasBackendNotifications = () => remote !== null;

export function markAllRead() {
  local = local.map((n) => ({ ...n, unread: false }));
  if (remote) {
    remote = remote.map((n) => ({ ...n, unread: false }));
    void api("/notifications/read-all", { method: "POST" }).catch(() => undefined);
  }
  recompute();
}

const listSchema = z.object({ items: z.array(notificationSchema) });

async function syncOnce() {
  try {
    const res = await api("/notifications", { schema: listSchema });
    remote = res.items.map(fromBackend);
  } catch {
    remote = null;
  }
  recompute();
}

// Poll the backend; falls back to the seeded sample alerts when it is unreachable.
export function startNotificationSync(): () => void {
  void syncOnce();
  const timer = setInterval(() => void syncOnce(), SYNC_MS);
  return () => clearInterval(timer);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useNotifications = () =>
  useSyncExternalStore(
    subscribe,
    () => items,
    () => seed,
  );
