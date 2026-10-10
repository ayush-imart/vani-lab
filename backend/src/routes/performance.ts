import { Hono } from "hono";
import { z } from "zod";
import { callIngestSchema, leaderboardQuerySchema } from "../contract";
import { parseBody, parseQuery } from "../lib/http";
import type { PerformanceService } from "../services/performance";

const callsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  since: z.coerce.number().optional(),
  experimentId: z.string().min(1).optional(),
});
const scopeQuery = z.object({ experimentId: z.string().min(1).optional() });

export const performanceRoutes = (perf: PerformanceService): Hono =>
  new Hono()
    // Idempotent: a retried call (same masked GLID, bucket, version, at, experimentId) returns the
    // stored record with 200 and records no second autoscale outcome; a new call returns 201.
    .post("/calls", async (c) => {
      const { record, duplicate } = await perf.ingest(await parseBody(c, callIngestSchema));
      return c.json(record, duplicate ? 200 : 201);
    })
    .get("/calls", async (c) => {
      const q = parseQuery(c, callsQuery);
      return c.json({ items: await perf.recent(q.limit, q.since, q.experimentId) });
    })
    .get("/metrics/versions", async (c) =>
      c.json({ items: await perf.versionMetrics(parseQuery(c, scopeQuery).experimentId) }),
    )
    .get("/metrics/cohorts", async (c) => c.json({ items: await perf.cohorts(parseQuery(c, scopeQuery).experimentId) }))
    .get("/metrics/verdict", async (c) => c.json(await perf.verdict()))
    .get("/leaderboard", async (c) => {
      const q = parseQuery(c, leaderboardQuerySchema);
      const { experimentId } = parseQuery(c, scopeQuery);
      return c.json({ ...q, items: await perf.leaderboard(q.sort, q.order, experimentId) });
    });
