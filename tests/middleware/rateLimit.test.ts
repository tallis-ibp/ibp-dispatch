import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRateLimiter } from '../../src/middleware/rateLimit.js';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });
    expect(limiter('192.168.1.1')).toBe(true);
    expect(limiter('192.168.1.1')).toBe(true);
    expect(limiter('192.168.1.1')).toBe(true);
  });

  it('blocks requests over the limit', () => {
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });
    limiter('192.168.1.1');
    limiter('192.168.1.1');
    expect(limiter('192.168.1.1')).toBe(false);
  });

  it('allows requests again after window expires', () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    limiter('192.168.1.1');
    expect(limiter('192.168.1.1')).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(limiter('192.168.1.1')).toBe(true);
  });

  it('tracks IPs independently', () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    expect(limiter('10.0.0.1')).toBe(true);
    expect(limiter('10.0.0.2')).toBe(true);
    expect(limiter('10.0.0.1')).toBe(false);
  });
});
