import { Hono } from "hono";
import { z } from "zod";
import { preprodRunRequestSchema } from "../contract";
import { parseBody, parseQuery } from "../lib/http";
import type { PreprodService } from "../services/preprod";

const gateQuery = z.object({ versionId: z.string().min(1) });

export const preprodRoutes = (preprod: PreprodService): Hono =>
  new Hono()
    .get("/preprod/scenarios", (c) => c.json(preprod.catalogue()))
    .post("/preprod/runs", async (c) => {
      const body = await parseBody(c, preprodRunRequestSchema);
      return c.json({ runId: await preprod.start(body) }, 202);
    })
    .get("/preprod/runs/:id", async (c) => c.json(await preprod.get(c.req.param("id"))))
    .get("/preprod/gate", async (c) => c.json(await preprod.gate(parseQuery(c, gateQuery).versionId)));
