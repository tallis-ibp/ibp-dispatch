import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseBody, parseParams } from '../../src/middleware/validate.js';

describe('parseBody', () => {
  const schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

  it('returns parsed data when valid', () => {
    const result = parseBody(schema, { date: '2026-05-12' });
    expect(result).toEqual({ ok: true, data: { date: '2026-05-12' } });
  });

  it('returns error when invalid', () => {
    const result = parseBody(schema, { date: 'not-a-date' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('date');
  });

  it('returns error when field missing', () => {
    const result = parseBody(schema, {});
    expect(result.ok).toBe(false);
  });
});
