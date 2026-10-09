import { Hono } from "hono";
import { notificationPrefsSchema } from "../contract";
import { parseBody } from "../lib/http";
import type { NotificationService } from "../services/notifications";

export const notificationRoutes = (n: NotificationService): Hono =>
  new Hono()
    .get("/notifications", async (c) => c.json(await n.list()))
    .get("/notifications/preferences", async (c) => c.json(await n.getPrefs()))
    .put("/notifications/preferences", async (c) =>
      c.json(await n.savePrefs(await parseBody(c, notificationPrefsSchema))),
    )
    .post("/notifications/read-all", async (c) => c.json({ updated: await n.markAllRead() }))
    .post("/notifications/:id/read", async (c) => c.json(await n.markRead(c.req.param("id"))));
