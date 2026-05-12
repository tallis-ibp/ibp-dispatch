import { z, ZodType } from 'zod';

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function parseBody<T>(schema: ZodType<T>, body: unknown): ParseResult<T> {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: result.error!.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', '),
  };
}

export function parseParams<T>(schema: ZodType<T>, params: unknown): ParseResult<T> {
  return parseBody(schema, params);
}

export const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
export const crewKeyParam = z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/);
