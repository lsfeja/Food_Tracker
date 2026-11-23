import { SELF } from "cloudflare:test";

/** Calls the API as `email` (each test uses its own user, so data never collides). */
export function api(email: string) {
  return async <T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> => {
    const response = await SELF.fetch(`https://app.test/api${path}`, {
      method,
      headers: { "Cf-Access-Authenticated-User-Email": email, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, data: (text ? JSON.parse(text) : null) as T };
  };
}
