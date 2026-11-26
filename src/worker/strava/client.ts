import { decrypt, encrypt } from "../crypto";
import type { Env } from "../env";
import { currentBlock, RateLimitedError, record, reserve } from "./rateLimiter";

export const PROVIDER = "strava";
const API = "https://www.strava.com/api/v3";
const OAUTH = "https://www.strava.com/oauth";
export const SCOPE = "activity:read_all";

export class StravaError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

/** The connection was revoked or never existed. */
export class NotConnectedError extends StravaError {
  constructor() {
    super("Strava is not connected. Please connect again in Settings.");
  }
}

export function isConfigured(env: Env): boolean {
  return Boolean(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY);
}

export function authorizeURL(env: Env, redirectUri: string, state: string): string {
  const url = new URL(`${OAUTH}/authorize`);
  url.search = new URLSearchParams({
    client_id: env.STRAVA_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: SCOPE,
    state,
  }).toString();
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

async function tokenRequest(env: Env, params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID ?? "", client_secret: env.STRAVA_CLIENT_SECRET ?? "", ...params }).toString(),
  });
  if (response.status === 400 || response.status === 401) throw new NotConnectedError();
  if (!response.ok) throw new StravaError(`Strava returned an error (HTTP ${response.status}).`, response.status);
  return (await response.json()) as TokenResponse;
}

export const exchangeCode = (env: Env, code: string) => tokenRequest(env, { code, grant_type: "authorization_code" });

export const athleteName = (token: TokenResponse) =>
  [token.athlete?.firstname, token.athlete?.lastname]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ") || null;

/** Stores tokens encrypted (insert or update). */
export async function saveConnection(env: Env, userId: string, token: TokenResponse, scope: string): Promise<void> {
  const secret = env.TOKEN_ENCRYPTION_KEY!;
  const [access, refresh] = await Promise.all([encrypt(token.access_token, secret), encrypt(token.refresh_token, secret)]);
  await env.DB.prepare(
    `INSERT INTO connections (user_id, provider, athlete_id, athlete_name, access_token, refresh_token, expires_at, scope, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET athlete_id = COALESCE(excluded.athlete_id, athlete_id),
       athlete_name = COALESCE(excluded.athlete_name, athlete_name), access_token = excluded.access_token,
       refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, scope = excluded.scope, last_error = NULL`,
  )
    .bind(userId, PROVIDER, token.athlete?.id !== undefined ? String(token.athlete.id) : null, athleteName(token), access, refresh, token.expires_at, scope, Date.now())
    .run();
}

interface ConnectionRow {
  user_id: string;
  athlete_id: string | null;
  athlete_name: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  last_sync_at: number | null;
  last_error: string | null;
}

export async function loadConnection(env: Env, userId: string): Promise<ConnectionRow | null> {
  return env.DB.prepare("SELECT * FROM connections WHERE user_id = ? AND provider = ?").bind(userId, PROVIDER).first<ConnectionRow>();
}

/** Authorized, rate-limited API access for one user. Refreshes the token when needed. */
export class StravaClient {
  private accessToken: string | null = null;

  constructor(
    private readonly env: Env,
    private readonly userId: string,
    private connection: ConnectionRow,
  ) {}

  static async forUser(env: Env, userId: string): Promise<StravaClient> {
    const connection = await loadConnection(env, userId);
    if (!connection) throw new NotConnectedError();
    return new StravaClient(env, userId, connection);
  }

  get athleteId() {
    return this.connection.athlete_id;
  }

  private async token(forceRefresh = false): Promise<string> {
    const secret = this.env.TOKEN_ENCRYPTION_KEY!;
    if (!forceRefresh && this.connection.expires_at - Date.now() / 1000 > 120) {
      this.accessToken ??= await decrypt(this.connection.access_token, secret);
      return this.accessToken;
    }
    let refreshToken: string;
    try {
      refreshToken = await decrypt(this.connection.refresh_token, secret);
    } catch {
      throw new NotConnectedError();
    }
    let token: TokenResponse;
    try {
      token = await tokenRequest(this.env, { refresh_token: refreshToken, grant_type: "refresh_token" });
    } catch (error) {
      if (error instanceof NotConnectedError) {
        // The refresh token was revoked (e.g. app access removed on strava.com).
        await this.env.DB.prepare("DELETE FROM connections WHERE user_id = ? AND provider = ?").bind(this.userId, PROVIDER).run();
      }
      throw error;
    }
    await saveConnection(this.env, this.userId, token, this.connection.scope);
    this.connection = { ...this.connection, expires_at: token.expires_at };
    this.accessToken = token.access_token;
    return token.access_token;
  }

  async get<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
    let retried = false;
    for (;;) {
      await reserve(this.env.DB, PROVIDER);
      const url = new URL(`${API}/${path}`);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
      const response = await fetch(url, { headers: { Authorization: `Bearer ${await this.token(retried)}`, Accept: "application/json" } });
      await record(this.env.DB, PROVIDER, response.headers, response.status);
      if (response.status === 401 && !retried) {
        // Token rejected although not expired: refresh once and retry.
        retried = true;
        continue;
      }
      if (response.status === 401) throw new NotConnectedError();
      if (response.status === 429) {
        throw new RateLimitedError((await currentBlock(this.env.DB, PROVIDER)) ?? Date.now() + 15 * 60 * 1000);
      }
      if (!response.ok) throw new StravaError(`Strava returned an error (HTTP ${response.status}).`, response.status);
      return (await response.json()) as T;
    }
  }

  /** Revokes the app's access (best effort). */
  async deauthorize(): Promise<void> {
    try {
      const token = await this.token();
      await fetch(`${OAUTH}/deauthorize`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch {
      // Ignore: the connection is removed locally anyway.
    }
  }
}

// MARK: Models

export interface SummaryActivity {
  id: number;
  name?: string;
  type?: string;
  sport_type?: string;
  start_date: string;
  start_date_local?: string;
  elapsed_time?: number;
  moving_time?: number;
  distance?: number;
  total_elevation_gain?: number;
  trainer?: boolean;
  kilojoules?: number;
  /** Watts from a power meter (not estimated). */
  device_watts?: boolean;
}

export interface DetailedActivity {
  id: number;
  calories?: number;
  kilojoules?: number;
}

export interface ImportedActivity {
  externalId: string;
  name: string;
  type: string;
  startAt: number;
  day: string;
  durationS: number;
  distanceM: number;
  elevationM: number;
  isIndoor: boolean;
  hasPower: boolean;
  activeKcal: number;
  kcalEstimated: boolean;
  detailsComplete: boolean;
}

/** Reported calories, else ≈ kJ of work (rides with power), else 0. */
export function resolveCalories(reported: number | null | undefined, kilojoules: number | null | undefined): { kcal: number; estimated: boolean } {
  if (reported && reported > 0) return { kcal: Math.round(reported), estimated: false };
  if (kilojoules && kilojoules > 0) return { kcal: Math.round(kilojoules), estimated: true };
  return { kcal: 0, estimated: false };
}

export function toImported(summary: SummaryActivity, calories: number | null, detailsComplete: boolean): ImportedActivity {
  const resolved = resolveCalories(calories, summary.kilojoules);
  const type = summary.sport_type ?? summary.type ?? "Workout";
  const startAt = Date.parse(summary.start_date);
  // start_date_local is the local wall time with a "Z" suffix: its date is the local day.
  const day = (summary.start_date_local ?? summary.start_date).slice(0, 10);
  return {
    externalId: String(summary.id),
    name: summary.name?.trim() || "Activity",
    type,
    startAt: Number.isFinite(startAt) ? startAt : 0,
    day,
    durationS: summary.moving_time ?? summary.elapsed_time ?? 0,
    distanceM: summary.distance ?? 0,
    elevationM: summary.total_elevation_gain ?? 0,
    isIndoor: Boolean(summary.trainer) || type === "VirtualRide" || type === "VirtualRun",
    hasPower: Boolean(summary.device_watts),
    activeKcal: resolved.kcal,
    kcalEstimated: resolved.estimated,
    detailsComplete,
  };
}
