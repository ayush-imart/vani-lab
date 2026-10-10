import { Hono } from "hono";
import { createExperimentSchema } from "../contract";
import { parseBody } from "../lib/http";
import type { ExperimentService } from "../services/experiments";
import { listRiskPresets } from "../services/risk-presets";

export const experimentRoutes = (experiments: ExperimentService): Hono =>
  new Hono()
    .get("/experiments", async (c) => c.json({ items: await experiments.list() }))
    .post("/experiments", async (c) =>
      c.json(await experiments.create(await parseBody(c, createExperimentSchema)), 201),
    )
    .get("/experiments/risk-presets", (c) => c.json({ items: listRiskPresets() }))
    .get("/experiments/:id", async (c) => c.json(await experiments.get(c.req.param("id"))))
    .get("/experiments/:id/start-settings", async (c) =>
      c.json(await experiments.startSettings(c.req.param("id"))),
    );
