// server/_shared/logger.ts
// Minimal structured JSON logger — no external deps, no console.log.

export interface LogExtras {
  [key: string]: unknown;
}

export interface Logger {
  info(event: string, extras?: LogExtras): void;
  warn(event: string, extras?: LogExtras): void;
  error(event: string, extras?: LogExtras): void;
}

type Level = 'info' | 'warn' | 'error';

/** Reserved base-field keys — extras that collide are stripped. */
const RESERVED = new Set(['ts', 'level', 'service', 'event']);

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val as object)) return '[Circular]';
      seen.add(val as object);
    }
    return val;
  });
}

function buildSafe(extras: LogExtras | undefined): Record<string, unknown> {
  if (!extras) return {};
  const safe: Record<string, unknown> = {};
  for (const k of Object.keys(extras)) {
    if (RESERVED.has(k)) continue;
    const v = extras[k];
    // Unwrap top-level Error instances so they serialize with message + stack.
    if (k === 'error' && v instanceof Error) {
      safe[k] = { message: v.message, stack: v.stack };
    } else {
      safe[k] = v;
    }
  }
  return safe;
}

export function createLogger(service: string): Logger {
  function emit(level: Level, event: string, extras?: LogExtras): void {
    const safe = buildSafe(extras);
    const line = {
      ts: new Date().toISOString(),
      level,
      service,
      event,
      ...safe,
    };
    process.stdout.write(safeStringify(line) + '\n');
  }

  return {
    info(event, extras?) { emit('info', event, extras); },
    warn(event, extras?) { emit('warn', event, extras); },
    error(event, extras?) { emit('error', event, extras); },
  };
}
