// Tiny external store so any page can push an alert into the shell's notification panel.
import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { getExperimentId, withExperiment } from "@/lib/experiment-scope";
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

const SYNC_MS = 8000;
let local: AppNotification[] = [];
let remote: AppNotification[] | null = null;
let items: AppNotification[] = [];
const EMPTY_NOTIFICATIONS: AppNotification[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const recompute = () => {
  items = [...local, ...(remote ?? [])];
  listeners.forEach((l) => l());
};

const fromBackend = (n: Notification): AppNotification => ({
  id: n.id,
  title: n.title,
  detail: n.body,
  to: n.kind === "info" ? "/performance" : "/scale-up",
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
    const res = await api(withExperiment("/notifications", getExperimentId()), {
      schema: listSchema,
    });
    remote = res.items.map(fromBackend);
  } catch {
    remote = null;
  }
  recompute();
}

// Poll the backend; unavailable notifications are omitted rather than replaced with sample alerts.
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
    () => EMPTY_NOTIFICATIONS,
  );
