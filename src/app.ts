import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { classify, validateViews } from "./classifier.ts";

export function createApp() {
  const app = new Hono();
  app.use("/classify", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: "corpo excede 16 KB" }, 413) }));
  app.get("/health", (c) => c.json({ ok: true }));
  app.post("/classify", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || !("views" in body)) {
      return c.json({ error: "envie um objeto JSON com o campo views" }, 400);
    }
    const error = validateViews(body.views);
    if (error) return c.json({ error }, 400);
    return c.json(classify(body.views as number[]));
  });
  return app;
}
