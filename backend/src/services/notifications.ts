import type { Notification, NotificationPrefs, VersionSlot } from "../contract";
import { log } from "../lib/logger";
import { notFound } from "../lib/errors";
import { newId, nowIso } from "../lib/http";
import type { Repos } from "../repos";

// Sender interface. Only the log-only implementation exists; GChat / WhatsApp are stubs for later.
export interface NotificationSender {
  send(n: Notification, prefs: NotificationPrefs): Promise<void>;
}

export const logOnlySender: NotificationSender = {
  async send(n, prefs) {
    log.info("notification", { kind: n.kind, title: n.title, gchatStub: prefs.gchat, whatsappStub: prefs.whatsapp });
    // Reserved: if (prefs.gchat) post to Google Chat webhook; if (prefs.whatsapp) send WhatsApp message.
  },
};

export const DEFAULT_PREFS: NotificationPrefs = { inApp: true, gchat: false, whatsapp: false };

export function createNotificationService(repos: Repos, sender: NotificationSender = logOnlySender) {
  const getPrefs = async (): Promise<NotificationPrefs> =>
    (await repos.notifications.getPrefs()) ?? DEFAULT_PREFS;
  return {
    getPrefs,
    savePrefs: (prefs: NotificationPrefs) => repos.notifications.savePrefs(prefs),

    async notify(input: {
      kind: Notification["kind"];
      title: string;
      body: string;
      version?: VersionSlot;
    }): Promise<Notification> {
      const prefs = await getPrefs();
      const n: Notification = {
        id: newId("ntf"),
        kind: input.kind,
        title: input.title,
        body: input.body,
        ...(input.version ? { version: input.version } : {}),
        read: !prefs.inApp, // in-app disabled: stored as already read
        createdAt: nowIso(),
      };
      await repos.notifications.save(n);
      await sender.send(n, prefs);
      return n;
    },

    async list(): Promise<{ items: Notification[]; unread: number }> {
      const items = (await repos.notifications.list()).reverse();
      return { items, unread: items.filter((n) => !n.read).length };
    },

    async markRead(id: string): Promise<Notification> {
      const n = await repos.notifications.get(id);
      if (!n) throw notFound("Notification");
      return repos.notifications.save({ ...n, read: true });
    },

    async markAllRead(): Promise<number> {
      const all = await repos.notifications.list();
      const unread = all.filter((n) => !n.read);
      await Promise.all(unread.map((n) => repos.notifications.save({ ...n, read: true })));
      return unread.length;
    },
  };
}
export type NotificationService = ReturnType<typeof createNotificationService>;
