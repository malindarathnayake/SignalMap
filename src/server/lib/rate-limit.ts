import type { RedisAdapter } from './redis.types.ts';

export function getMinuteWindowKey(prefix: string, ip: string, date?: Date): string {
  const d = date ?? new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${prefix}:${ip}:${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  retryAfterSeconds: number;
}

export async function rateLimit(
  redis: RedisAdapter,
  key: string,
  limit: number,
  windowSeconds = 60,
): Promise<RateLimitResult> {
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, windowSeconds);
  }

  if (current > limit) {
    return { allowed: false, current, limit, retryAfterSeconds: windowSeconds };
  }

  return { allowed: true, current, limit, retryAfterSeconds: 0 };
}
