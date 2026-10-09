import { Hono } from "hono";
import { z } from "zod";
import {
  autoscaleSettingsUpdateSchema,
  outcomeUpdateSchema,
  trafficSplitSchema,
} from "../contract";
import { parseBody, parseQuery } from "../lib/http";
import type { AutoscaleService } from "../services/autoscale";

const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) });

export const autoscaleRoutes = (scale: AutoscaleService): Hono =>
  new Hono()
    .get("/traffic", async (c) => c.json(await scale.getTraffic()))
    .put("/traffic", async (c) => c.json(await scale.setTraffic(await parseBody(c, trafficSplitSchema))))
    .get("/autoscale/settings", async (c) => c.json(await scale.getSettings()))
    .put("/autoscale/settings", async (c) => {
      const patch = await parseBody(c, autoscaleSettingsUpdateSchema);
      return c.json(await scale.updateSettings(patch));
    })
    .post("/autoscale/outcomes", async (c) => {
      const o = await parseBody(c, outcomeUpdateSchema);
      await scale.recordOutcome(o.version, o.trials, o.successes);
      return c.json({ accepted: true }, 202);
    })
    .post("/autoscale/tick", async (c) => c.json(await scale.tick()))
    .get("/autoscale/state", async (c) => c.json(await scale.state()))
    .get("/autoscale/decisions", async (c) => {
      const q = parseQuery(c, limitQuery);
      return c.json({ items: await scale.decisions(q.limit) });
    });
