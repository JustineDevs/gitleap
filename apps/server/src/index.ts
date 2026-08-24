import "./lib/tracing";
import { createContext } from "@gitleap/api/context";
import { appRouter } from "@gitleap/api/routers/index";
import { auth } from "@gitleap/auth";
import { env } from "@gitleap/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { checkRateLimit } from "./lib/rate-limit";
import { withTracing } from "./lib/tracing";

export const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use("/api/auth/*", async (c, next) => {
  const rate = await checkRateLimit(c.req.raw as unknown as Parameters<typeof checkRateLimit>[0]);
  if (rate.denied) return c.json({ error: "RATE_LIMITED" }, 429);
  await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use("/trpc/*", async (c, next) => {
  if (c.req.method === "POST") {
    const origin = c.req.header("origin");
    const cliRequest = c.req.header("x-gitleap-client") === "cli";
    if (origin !== env.CORS_ORIGIN && !(cliRequest && !origin))
      return c.json({ error: "CSRF_REJECTED" }, 403);
  }
  const rate = await checkRateLimit(c.req.raw as unknown as Parameters<typeof checkRateLimit>[0]);
  if (rate.denied) return c.json({ error: "RATE_LIMITED" }, 429);
  await next();
});

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

app.get("/", (c) => {
  return c.text("OK");
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

export default { fetch: withTracing(app.fetch) };
