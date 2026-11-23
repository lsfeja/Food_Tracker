import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authenticate, userIdFor } from "./auth";
import type { AppContext, Env } from "./env";
import { nutrition } from "./routes/nutrition";
import { off } from "./routes/off";
import { scheduledSync, strava } from "./routes/strava";
import { training } from "./routes/training";

const app = new Hono<AppContext>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

// Every other API route requires an authenticated (Cloudflare Access) user.
app.use("*", async (c, next) => {
  const email = await authenticate(c.req.raw, c.env);
  if (!email) return c.json({ error: "Not authenticated (Cloudflare Access required)" }, 401);
  c.set("email", email);
  c.set("userId", await userIdFor(c.env.DB, email));
  await next();
});

app.get("/me", (c) => c.json({ email: c.get("email") }));
app.route("/", nutrition);
app.route("/", off);
app.route("/", training);
app.route("/", strava);

app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  console.error(error);
  return c.json({ error: "Internal error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  /** Cron (wrangler.toml): Strava sync for all connected users and history import. */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduledSync(env));
  },
} satisfies ExportedHandler<Env>;

export { app };
