import { HTTPException } from "hono/http-exception";

/** 400 with a message. */
export function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

export function notFound(message = "Not found"): never {
  throw new HTTPException(404, { message });
}

/** Parses a JSON body or throws 400. */
export async function jsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    badRequest("Invalid JSON body");
  }
}

export const isDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function requireDay(value: unknown, name = "day"): string {
  if (!isDay(value)) badRequest(`${name} must be YYYY-MM-DD`);
  return value;
}

export function num(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function optNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
