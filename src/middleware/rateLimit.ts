interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

interface BucketEntry {
  count: number;
  resetAt: number;
}

export function createRateLimiter(opts: RateLimitOptions): (ip: string) => boolean {
  const buckets = new Map<string, BucketEntry>();

  return function check(ip: string): boolean {
    const now = Date.now();
    const entry = buckets.get(ip);

    if (!entry || now >= entry.resetAt) {
      buckets.set(ip, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }

    if (entry.count >= opts.maxRequests) return false;
    entry.count++;
    return true;
  };
}

export const generalLimiter = createRateLimiter({ maxRequests: 60, windowMs: 60_000 });
export const loginLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });
