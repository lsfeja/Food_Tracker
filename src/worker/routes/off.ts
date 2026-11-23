import { Hono } from "hono";
import { draftFromOFF, type FoodDraft, isDraftComplete, type OFFProduct } from "../../shared/food";
import type { AppContext } from "../env";
import { badRequest } from "../http";

/**
 * Open Food Facts proxy: sets the required User-Agent (browsers can't) and caches
 * responses at the edge. Search only runs on explicit user action (OFF rate limit).
 */
export const off = new Hono<AppContext>();

const USER_AGENT = "Foodtracker/2.0 (web; private use)";
const FIELDS = "code,product_name,product_name_de,product_name_en,generic_name,brands,nutriments,serving_quantity";

async function cachedJSON(url: string, ttlSeconds: number, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<{ status: number; body: unknown }> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(url);
  const hit = await cache.match(key);
  if (hit) return { status: hit.status, body: await hit.json() };
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (response.ok || response.status === 404) {
    const stored = new Response(JSON.stringify(body), {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttlSeconds}` },
    });
    ctx.waitUntil(cache.put(key, stored));
  }
  return { status: response.status, body };
}

off.get("/off/product/:code", async (c) => {
  const code = c.req.param("code").replace(/\D/g, "");
  if (!code) badRequest("Invalid barcode");
  const { status, body } = await cachedJSON(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=${FIELDS}`, 86_400, c.executionCtx);
  if (status === 404) return c.json(null);
  if (status < 200 || status >= 300) return c.json({ error: `Open Food Facts returned HTTP ${status}` }, 502);
  const data = body as { status?: unknown; product?: OFFProduct } | null;
  if (!data?.product || data.status === 0) return c.json(null);
  return c.json(draftFromOFF(data.product, code));
});

off.get("/off/search", async (c) => {
  const query = (c.req.query("q") ?? "").trim();
  if (!query) return c.json([]);
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.search = new URLSearchParams({ search_terms: query, search_simple: "1", action: "process", json: "1", page_size: "25", fields: FIELDS }).toString();
  const { status, body } = await cachedJSON(url.toString(), 3_600, c.executionCtx);
  if (status < 200 || status >= 300) return c.json({ error: `Open Food Facts returned HTTP ${status}` }, 502);
  const products = ((body as { products?: OFFProduct[] } | null)?.products ?? []) as OFFProduct[];
  const drafts: FoodDraft[] = products.map((p) => draftFromOFF(p)).filter((d): d is FoodDraft => d !== null && isDraftComplete(d));
  return c.json(drafts);
});
