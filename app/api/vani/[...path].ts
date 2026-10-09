import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

type VercelRequest = IncomingMessage & {
  ip?: string;
  method?: string;
  url?: string;
};

type RateWindow = { startedAt: number; count: number };
const rateWindows = new Map<string, RateWindow>();
const API_PREFIX = "/api/vani";
const GENERAL_LIMIT = { count: 60, windowMs: 60_000 };
const ROUTE_LIMITS: Record<string, { count: number; windowMs: number }> = {
  "POST /audits": { count: 2, windowMs: 60_000 },
  "POST /preprod/runs": { count: 1, windowMs: 15 * 60_000 },
  "POST /sessions": { count: 10, windowMs: 60_000 },
  "GET /sarvam/url": { count: 10, windowMs: 60_000 },
};
const MAX_BODY_BYTES = 1_000_000;

function getClientIp(request: VercelRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  return request.ip ?? (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]) ?? "unknown";
}

function allowRequest(ip: string, route: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const key = `${ip}:${route}`;
  const limit = ROUTE_LIMITS[route] ?? GENERAL_LIMIT;
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= limit.windowMs) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    if (rateWindows.size > 1000) {
      for (const [entry, window] of rateWindows) {
        if (now - window.startedAt >= 15 * 60_000) rateWindows.delete(entry);
      }
    }
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit.count) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((limit.windowMs - (now - current.startedAt)) / 1000)) };
  }
  rateWindows.set(key, { ...current, count: current.count + 1 });
  return { allowed: true, retryAfter: 0 };
}

async function readBody(request: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export default async function handler(request: VercelRequest, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  if (!["GET", "POST", "PUT", "DELETE", "OPTIONS"].includes(method)) {
    response.writeHead(405, { Allow: "GET, POST, PUT, DELETE, OPTIONS" }).end();
    return;
  }

  const backendUrl = process.env["VANI_BACKEND_URL"];
  const backendToken = process.env["VANI_BACKEND_TOKEN"];
  if (!backendUrl || !backendToken) {
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { code: "unavailable", message: "Backend proxy is not configured" } }));
    return;
  }

  const incomingUrl = new URL(request.url ?? API_PREFIX, "https://vani-lab.invalid");
  if (!incomingUrl.pathname.startsWith(`${API_PREFIX}/`) && incomingUrl.pathname !== API_PREFIX) {
    response.writeHead(404).end();
    return;
  }
  const target = new URL(backendUrl);
  target.pathname = `${target.pathname.replace(/\/$/, "")}/${incomingUrl.pathname.slice(API_PREFIX.length).replace(/^\//, "")}`;
  target.search = incomingUrl.search;

  const routeKey = `${method} ${target.pathname}`;
  const isSignedUrl = routeKey.startsWith("GET /sarvam/") && routeKey.endsWith("/url");
  const rateKey = isSignedUrl ? "GET /sarvam/url" : ROUTE_LIMITS[routeKey] ? routeKey : method;
  const rate = allowRequest(getClientIp(request), rateKey);
  if (!rate.allowed) {
    response.writeHead(429, { "Retry-After": String(rate.retryAfter), "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { code: "unavailable", message: "Demo request limit reached. Try again shortly." } }));
    return;
  }

  let body: Buffer | undefined;
  try {
    if (method !== "GET" && method !== "HEAD") body = await readBody(request);
  } catch {
    response.writeHead(413, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { code: "bad_request", message: "Request body is too large" } }));
    return;
  }

  try {
    const headers = new Headers({
      Authorization: `Bearer ${backendToken}`,
      "X-Forwarded-For": getClientIp(request),
      "Cache-Control": "no-store",
    });
    const contentType = request.headers["content-type"];
    const accept = request.headers.accept;
    if (typeof contentType === "string") headers.set("Content-Type", contentType);
    if (typeof accept === "string") headers.set("Accept", accept);
    const requestInit: RequestInit = { method, headers };
    if (body?.length) requestInit.body = body.toString("utf8");
    const upstream = await fetch(target, requestInit);
    response.statusCode = upstream.status;
    ["content-type", "cache-control", "retry-after"].forEach((name) => {
      const value = upstream.headers.get(name);
      if (value) response.setHeader(name, value);
    });
    if (!upstream.body) {
      response.end();
      return;
    }
    await pipeline(Readable.fromWeb(upstream.body as NodeReadableStream<Uint8Array>), response);
  } catch {
    if (response.headersSent) return;
    response.writeHead(502, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { code: "unavailable", message: "Backend is temporarily unavailable" } }));
  }
}

export const config = { api: { bodyParser: false } };
