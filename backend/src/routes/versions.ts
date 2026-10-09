import { Hono } from "hono";
import { z } from "zod";
import { createVersionSchema } from "../contract";
import { parseBody, parseQuery } from "../lib/http";
import type { VersionService } from "../services/versions";

const diffQuery = z.object({ from: z.string().min(1), to: z.string().min(1) });

export const versionRoutes = (versions: VersionService): Hono =>
  new Hono()
    .get("/versions", async (c) => c.json({ items: await versions.list() }))
    .post("/versions", async (c) =>
      c.json(await versions.create(await parseBody(c, createVersionSchema)), 201),
    )
    .get("/versions/diff", async (c) => {
      const q = parseQuery(c, diffQuery);
      return c.json(await versions.diff(q.from, q.to));
    })
    .get("/versions/:id/history", async (c) =>
      c.json({ items: await versions.history(c.req.param("id")) }),
    )
    .get("/versions/:id", async (c) => c.json(await versions.get(c.req.param("id"))));
