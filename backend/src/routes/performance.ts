import { Hono } from "hono";
import { z } from "zod";
import { callIngestSchema, leaderboardQuerySchema } from "../contract";
import { parseBody, parseQuery } from "../lib/http";
import type { PerformanceService } from "../services/performance";

const callsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  since: z.coerce.number().optional(),
});

export const performanceRoutes = (perf: PerformanceService): Hono =>
  new Hono()
    .post("/calls", async (c) => c.json(await perf.ingest(await parseBody(c, callIngestSchema)), 201))
    .get("/calls", async (c) => {
      const q = parseQuery(c, callsQuery);
      return c.json({ items: await perf.recent(q.limit, q.since) });
    })
    .get("/metrics/versions", async (c) => c.json({ items: await perf.versionMetrics() }))
    .get("/metrics/cohorts", async (c) => c.json({ items: await perf.cohorts() }))
    .get("/metrics/verdict", async (c) => c.json(await perf.verdict()))
    .get("/leaderboard", async (c) => {
      const q = parseQuery(c, leaderboardQuerySchema);
      return c.json({ ...q, items: await perf.leaderboard(q.sort, q.order) });
    });
