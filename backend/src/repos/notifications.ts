import type { Notification, NotificationPrefs } from "../contract";
import type { CollectionFactory } from "./collection";

export interface NotificationRepo {
  list(): Promise<Notification[]>; // oldest first
  get(id: string): Promise<Notification | undefined>;
  save(n: Notification): Promise<Notification>;
  getPrefs(): Promise<NotificationPrefs | undefined>;
  savePrefs(prefs: NotificationPrefs): Promise<NotificationPrefs>;
}

export function createNotificationRepo(make: CollectionFactory): NotificationRepo {
  const rows = make<Notification>("notifications");
  const prefs = make<NotificationPrefs & { id: string }>("notification_preferences");
  return {
    list: () => rows.list(),
    get: (id) => rows.get(id),
    save: (n) => rows.put(n),
    getPrefs: async () => {
      const row = await prefs.get("default");
      return row ? { inApp: row.inApp, gchat: row.gchat, whatsapp: row.whatsapp } : undefined;
    },
    savePrefs: async (p) => {
      await prefs.put({ ...p, id: "default" });
      return p;
    },
  };
}
