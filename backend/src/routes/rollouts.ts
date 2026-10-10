import { Hono } from "hono";
import {
  assignmentQuerySchema,
  balanceCheckRequestSchema,
  rolloutStartSchema,
  simulationRequestSchema,
} from "../contract";
import { badRequest } from "../lib/errors";
import { parseBody, parseQuery } from "../lib/http";
import { specSnapshot } from "../spec";
import { armFor, balanceCheck, bucketOf, treatmentBuckets } from "../services/assignment";
import { runSimulation } from "../services/rollout-sim";
import type { RolloutService } from "../services/rollouts";

// An empty body means "defaults"; a non-empty body must be valid JSON.
const optionalBody = async (c: { req: { text: () => Promise<string> } }): Promise<unknown> => {
  const raw = (await c.req.text()).trim();
  if (raw === "") return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("Body must be valid JSON");
  }
};

export const rolloutRoutes = (rollouts: RolloutService): Hono =>
  new Hono()
    .get("/spec", (c) => c.json(specSnapshot()))
    .get("/rollouts", async (c) => c.json({ items: await rollouts.listRuns() }))
    .post("/experiments/:id/start", async (c) =>
      c.json(await rollouts.start(c.req.param("id"), rolloutStartSchema.parse(await optionalBody(c))), 201),
    )
    .get("/experiments/:id/rollout", async (c) => c.json(await rollouts.state(c.req.param("id"))))
    .post("/experiments/:id/rollout/tick", async (c) => c.json(await rollouts.tick(c.req.param("id"))))
    .post("/experiments/:id/rollout/approve", async (c) => c.json(await rollouts.approve(c.req.param("id"))))
    .post("/experiments/:id/rollout/resume", async (c) => c.json(await rollouts.resume(c.req.param("id"))))
    .post("/experiments/:id/rollout/rollback", async (c) => c.json(await rollouts.rollback(c.req.param("id"))))
    .post("/experiments/:id/rollout/stop", async (c) => c.json(await rollouts.stop(c.req.param("id"))))
    .get("/experiments/:id/rollout/decisions", async (c) =>
      c.json({ items: await rollouts.decisions(c.req.param("id")) }),
    )
    .get("/experiments/:id/rollout/report", async (c) => c.json(await rollouts.report(c.req.param("id"))))
    .get("/experiments/:id/assignment", async (c) => {
      const { glid } = parseQuery(c, assignmentQuerySchema);
      return c.json(await rollouts.assign(c.req.param("id"), glid));
    })
    .get("/assignment", (c) => {
      const { glid, pct } = parseQuery(c, assignmentQuerySchema);
      const bucket = bucketOf(glid);
      return c.json({ bucket, treatmentPct: pct, arm: armFor(bucket, pct), treatmentBuckets: treatmentBuckets(pct) });
    })
    .post("/assignment/balance", async (c) => {
      const body = await parseBody(c, balanceCheckRequestSchema);
      return c.json(balanceCheck(body.sellers, body.pct));
    })
    .post("/simulations/rollout", async (c) =>
      c.json(await runSimulation(await parseBody(c, simulationRequestSchema))),
    );
