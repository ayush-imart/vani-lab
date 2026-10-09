import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { auditListQuerySchema, auditRequestSchema } from "../contract";
import { parseBody, parseQuery } from "../lib/http";
import type { AuditService } from "../services/audits";

export function auditRoutes(audits: AuditService): Hono {
  return new Hono()
    .post("/audits", async (c) => {
      const body = await parseBody(c, auditRequestSchema);
      return c.json({ auditId: await audits.start(body) }, 202);
    })
    .get("/audits", async (c) => {
      const q = parseQuery(c, auditListQuerySchema);
      return c.json({ items: await audits.list(q) });
    })
    .get("/audits/:id/events", async (c) => {
      const id = c.req.param("id");
      await audits.get(id); // 404 before opening the stream
      return streamSSE(c, async (stream) => {
        let finish: () => void = () => undefined;
        const ended = new Promise<void>((resolve) => {
          finish = resolve;
        });
        const queue: string[] = [];
        let flushing = Promise.resolve();
        const unsubscribe = await audits.subscribe(
          id,
          (e) => {
            queue.push(JSON.stringify(e));
            flushing = flushing.then(async () => {
              const data = queue.shift();
              if (data) await stream.writeSSE({ data });
            });
          },
          () => void flushing.then(finish),
        );
        stream.onAbort(() => {
          unsubscribe();
          finish();
        });
        await ended;
        await flushing;
        unsubscribe();
      });
    })
    .get("/audits/:id", async (c) => c.json(await audits.get(c.req.param("id"))))
    .delete("/audits/:id", async (c) => c.json(await audits.cancel(c.req.param("id"))));
}
