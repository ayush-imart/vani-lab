import { Hono } from "hono";
import { rubricUpdateSchema } from "../contract";
import { parseBody } from "../lib/http";
import type { RubricService } from "../services/rubric";

export const rubricRoutes = (rubric: RubricService): Hono =>
  new Hono()
    .get("/rubric", async (c) => c.json(await rubric.get()))
    .put("/rubric", async (c) => c.json(await rubric.update(await parseBody(c, rubricUpdateSchema))));
