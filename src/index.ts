import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";

const app = createApp();
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: Number(process.env.PORT ?? 3008) }, (info) => {
  console.log(`classificador de views em http://127.0.0.1:${info.port}`);
});

process.on("SIGINT", () => server.close());
process.on("SIGTERM", () => server.close());
