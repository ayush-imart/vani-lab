import type { Context } from "hono";
import { ZodError } from "zod";
import type { ErrorEnvelope } from "../contract";
import { log } from "./logger";

type ErrorCode = ErrorEnvelope["error"]["code"];

export class AppError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 500 | 503,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, "not_found", `${what} not found`);
export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "bad_request", message, details);
export const conflict = (message: string) => new AppError(409, "conflict", message);

function envelope(code: ErrorCode, message: string, details?: unknown): ErrorEnvelope {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export function handleError(err: unknown, c: Context): Response {
  if (err instanceof AppError) {
    return c.json(envelope(err.code, err.message, err.details), err.status);
  }
  if (err instanceof ZodError) {
    return c.json(envelope("validation_error", "Invalid request", err.issues), 400);
  }
  // Never leak internals to the client; log the error name/message only.
  log.error("unhandled", { error: err instanceof Error ? err.message : String(err) });
  return c.json(envelope("internal", "Internal server error"), 500);
}

export function notFoundHandler(c: Context): Response {
  return c.json(envelope("not_found", `No route ${c.req.method} ${c.req.path}`), 404);
}
