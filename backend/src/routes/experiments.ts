import { Hono } from "hono";
import { createExperimentSchema } from "../contract";
import { parseBody } from "../lib/http";
import type { ExperimentService } from "../services/experiments";

export const experimentRoutes = (experiments: ExperimentService): Hono =>
  new Hono()
    .get("/experiments", async (c) => c.json({ items: await experiments.list() }))
    .post("/experiments", async (c) =>
      c.json(await experiments.create(await parseBody(c, createExperimentSchema)), 201),
    )
    .get("/experiments/:id", async (c) => c.json(await experiments.get(c.req.param("id"))));
