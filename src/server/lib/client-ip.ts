import type { IncomingMessage } from 'node:http';

const TRUSTED_PROXY = process.env.TRUSTED_PROXY === '1' || process.env.TRUSTED_PROXY === 'true';

export function getClientIp(req: IncomingMessage): string {
  if (TRUSTED_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    if (raw && typeof raw === 'string') {
      // First entry of XFF is the original client IP per RFC 7239
      const first = raw.split(',')[0]?.trim();
      if (first) return first;
    }
    const cfIp = req.headers['cf-connecting-ip'];
    const cfRaw = Array.isArray(cfIp) ? cfIp[0] : cfIp;
    if (cfRaw && typeof cfRaw === 'string') return cfRaw;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

// Test-only: read TRUSTED_PROXY at call time (not module init) so tests can flip it
export function getClientIpDynamic(req: IncomingMessage): string {
  const trusted = process.env.TRUSTED_PROXY === '1' || process.env.TRUSTED_PROXY === 'true';
  if (trusted) {
    const xff = req.headers['x-forwarded-for'];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    if (raw && typeof raw === 'string') {
      const first = raw.split(',')[0]?.trim();
      if (first) return first;
    }
    const cfIp = req.headers['cf-connecting-ip'];
    const cfRaw = Array.isArray(cfIp) ? cfIp[0] : cfIp;
    if (cfRaw && typeof cfRaw === 'string') return cfRaw;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
