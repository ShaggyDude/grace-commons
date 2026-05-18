import type { Context } from "hono";

export function errorJson(c: Context, status: 400 | 401 | 403 | 404 | 409 | 500, err: string) {
  return c.json({ error: err }, status);
}
