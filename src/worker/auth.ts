import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./env";

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function teamHost(domain: string): string {
  return domain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function cookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("Cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

/**
 * Identifies the user. Cloudflare Access protects the app; there is no own login.
 *
 * - With ACCESS_TEAM_DOMAIN + ACCESS_AUD configured, the signed Access JWT
 *   (`Cf-Access-Jwt-Assertion` header or `CF_Authorization` cookie) is verified and
 *   its email is used. This prevents spoofing the email header by reaching the
 *   Worker around Access (e.g. via *.workers.dev).
 * - Otherwise the `Cf-Access-Authenticated-User-Email` header is used.
 * - Local development falls back to DEV_USER_EMAIL.
 *
 * Returns the lower-cased email or null if the request is not authenticated.
 */
export async function authenticate(request: Request, env: Env): Promise<string | null> {
  const headerEmail = request.headers.get("Cf-Access-Authenticated-User-Email")?.trim().toLowerCase() || undefined;

  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const token = request.headers.get("Cf-Access-Jwt-Assertion") ?? cookie(request, "CF_Authorization");
    if (!token) return null;
    const team = teamHost(env.ACCESS_TEAM_DOMAIN);
    let jwks = jwksByTeam.get(team);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
      jwksByTeam.set(team, jwks);
    }
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: env.ACCESS_AUD });
      const email = typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
      if (!email) return null;
      if (headerEmail && headerEmail !== email) return null;
      return email;
    } catch {
      return null;
    }
  }

  if (headerEmail) return headerEmail;
  if (env.DEV_USER_EMAIL) return env.DEV_USER_EMAIL.trim().toLowerCase();
  return null;
}

const userIdCache = new Map<string, string>();

/** Finds or creates the user row for an email (cached per isolate). */
export async function userIdFor(db: D1Database, email: string): Promise<string> {
  const cached = userIdCache.get(email);
  if (cached) return cached;
  const now = Date.now();
  await db
    .prepare("INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, ?, ?)")
    .bind(crypto.randomUUID(), email, now)
    .run();
  const row = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
  if (!row) throw new Error("User could not be created");
  await db.prepare("INSERT OR IGNORE INTO settings (user_id, updated_at) VALUES (?, ?)").bind(row.id, now).run();
  userIdCache.set(email, row.id);
  return row.id;
}
