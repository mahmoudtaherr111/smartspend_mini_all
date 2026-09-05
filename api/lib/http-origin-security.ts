import type { Hono } from "hono";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import type { OriginPolicy } from "./origin-policy";

export function applyOriginSecurity(app: Hono, policy: OriginPolicy) {
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    // CORS alone only prevents reading responses. Also reject disallowed
    // browser origins before a mutation runs, including JSON requests.
    if (origin !== undefined && !policy.isAllowedOrigin(origin)) {
      return c.json({ error: "مصدر الطلب غير مسموح به" }, 403);
    }
    await next();
  });
  app.use(
    "*",
    cors({
      origin: (origin) => (policy.isAllowedOrigin(origin) ? origin : undefined),
      credentials: true,
    }),
  );
  app.use("*", csrf({ origin: (origin) => policy.isAllowedOrigin(origin) }));
}
