/// <reference types="@cloudflare/workers-types" />

/** Bindings, variables and secrets of the Worker (see wrangler.toml). */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  /** Cloudflare Access team domain, e.g. "yourteam.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access application audience (AUD) tag. */
  ACCESS_AUD?: string;
  /** Local development only: user email when no Access header is present. */
  DEV_USER_EMAIL?: string;

  // Secrets (wrangler secret put …)
  STRAVA_CLIENT_ID?: string;
  STRAVA_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
}

export interface AppVariables {
  userId: string;
  email: string;
}

export type AppContext = { Bindings: Env; Variables: AppVariables };
