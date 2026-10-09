import { Hono } from "hono";
import { sessionRequestSchema } from "../contract";
import { parseBody } from "../lib/http";
import type { SessionService } from "../services/sessions";

export const sessionRoutes = (sessions: SessionService): Hono =>
  new Hono()
    .post("/sessions", async (c) =>
      c.json(sessions.create((await parseBody(c, sessionRequestSchema)).versionId)),
    )
    // Base URL for the browser SDK (ConversationAgent baseUrl = <api>/sarvam/).
    .get("/sarvam/orgs/:org/workspaces/:ws/apps/:app/url", async (c) => {
      const r = await sessions.proxySignedUrl(
        c.req.param("org"),
        c.req.param("ws"),
        c.req.param("app"),
        c.req.query(),
      );
      return new Response(r.body, { status: r.status, headers: { "content-type": "application/json" } });
    });
