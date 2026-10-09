import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { cors } from "hono/cors";
import { handleError, notFoundHandler } from "./lib/errors";
import { log } from "./lib/logger";
import { domainRoutes, type Services } from "./registry";

type RateWindow = { startedAt: number; count: number };
const requestWindows = new Map<string, RateWindow>();
const defaultLimit = { count: 60, windowMs: 60_000 };
const routeLimits: Record<string, { count: number; windowMs: number }> = {
  "POST /audits": { count: 2, windowMs: 60_000 },
  "POST /preprod/runs": { count: 1, windowMs: 15 * 60_000 },
  "POST /sessions": { count: 10, windowMs: 60_000 },
  "GET /sarvam/url": { count: 10, windowMs: 60_000 },
};

function allowRequest(route: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const key = route;
  const limit = routeLimits[route] ?? defaultLimit;
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= limit.windowMs) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    if (requestWindows.size > 1000) {
      for (const [entry, window] of requestWindows) {
        if (now - window.startedAt >= 15 * 60_000) requestWindows.delete(entry);
      }
    }
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit.count) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((limit.windowMs - (now - current.startedAt)) / 1000)),
    };
  }
  requestWindows.set(key, { ...current, count: current.count + 1 });
  return { allowed: true, retryAfter: 0 };
}

export function buildApp(services: Services, corsOrigins: string[], apiSharedSecret?: string): Hono {
  const app = new Hono();
  app.use(
    "*",
    cors({
      origin: corsOrigins,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "X-API-Key", "Authorization"],
    }),
  );
  // Request log: method, path, status, duration. No query strings, bodies or headers.
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    log.info("request", { method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - start });
  });
  app.use("*", async (c, next) => {
    if (c.req.path === "/health" || c.req.method === "OPTIONS") return next();
    if (!apiSharedSecret) {
      return c.json({ error: { code: "unavailable", message: "API authentication is not configured" } }, 503);
    }
    const expected = apiSharedSecret;
    const supplied = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!supplied) {
      return c.json({ error: { code: "unavailable", message: "API authentication is required" } }, 401);
    }
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
      return c.json({ error: { code: "unavailable", message: "API authentication is required" } }, 401);
    }
    await next();
  });
  app.use("*", async (c, next) => {
    if (c.req.path === "/health" || c.req.method === "OPTIONS") return next();
    const route = `${c.req.method} ${c.req.path}`;
    const isSignedUrl = route.startsWith("GET /sarvam/") && route.endsWith("/url");
    const rate = allowRequest(isSignedUrl ? "GET /sarvam/url" : route);
    if (!rate.allowed) {
      c.header("Retry-After", String(rate.retryAfter));
      return c.json({ error: { code: "unavailable", message: "Demo request limit reached. Try again shortly." } }, 429);
    }
    await next();
  });
  domainRoutes.forEach((make) => app.route("/", make(services)));
  app.onError(handleError);
  app.notFound(notFoundHandler);
  return app;
}
