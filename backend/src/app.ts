import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { cors } from "hono/cors";
import { handleError, notFoundHandler } from "./lib/errors";
import { log } from "./lib/logger";
import { domainRoutes, type Services } from "./registry";

type RateWindow = { startedAt: number; count: number };
const defaultLimit = { count: 60, windowMs: 60_000 };
const routeLimits: Record<string, { count: number; windowMs: number }> = {
  "POST /audits": { count: 2, windowMs: 60_000 },
  "POST /preprod/runs": { count: 1, windowMs: 15 * 60_000 },
  "POST /sessions": { count: 10, windowMs: 60_000 },
  "GET /sarvam/url": { count: 10, windowMs: 60_000 },
};

// The window map is owned by each app instance so separate builds (tests, multiple apps) do not
// share limiter state.
function allowRequest(windows: Map<string, RateWindow>, route: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const key = route;
  const limit = routeLimits[route] ?? defaultLimit;
  const current = windows.get(key);
  if (!current || now - current.startedAt >= limit.windowMs) {
    windows.set(key, { startedAt: now, count: 1 });
    if (windows.size > 1000) {
      for (const [entry, window] of windows) {
        if (now - window.startedAt >= 15 * 60_000) windows.delete(entry);
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
  windows.set(key, { ...current, count: current.count + 1 });
  return { allowed: true, retryAfter: 0 };
}

function refundRequest(windows: Map<string, RateWindow>, route: string): void {
  const current = windows.get(route);
  if (current && current.count > 0) windows.set(route, { ...current, count: current.count - 1 });
}

export function buildApp(services: Services, corsOrigins: string[], apiSharedSecret?: string): Hono {
  const app = new Hono();
  const requestWindows = new Map<string, RateWindow>();
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
    // No secret configured (local dev, or a misconfigured deploy): the request log above still
    // records it and the rate limiter below still applies, but the bearer check is skipped.
    if (!apiSharedSecret) return next();
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
    const key = isSignedUrl ? "GET /sarvam/url" : route;
    const rate = allowRequest(requestWindows, key);
    if (!rate.allowed) {
      c.header("Retry-After", String(rate.retryAfter));
      return c.json({ error: { code: "unavailable", message: "Demo request limit reached. Try again shortly." } }, 429);
    }
    await next();
    // Metered routes only spend budget on requests that were accepted: a rejected request (4xx,
    // e.g. validation) did no costly work, so it must not lock out the next valid one.
    if (key in routeLimits && c.res.status >= 400) refundRequest(requestWindows, key);
  });
  domainRoutes.forEach((make) => app.route("/", make(services)));
  app.onError(handleError);
  app.notFound(notFoundHandler);
  return app;
}
