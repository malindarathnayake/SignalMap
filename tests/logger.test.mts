import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createLogger } from '../server/_shared/logger.ts';

// ---------------------------------------------------------------------------
// Helper: capture everything written to process.stdout during fn()
// ---------------------------------------------------------------------------

function captureStdout(fn: () => void): string[] {
  const lines: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  // @ts-expect-error overriding with wider signature
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = origWrite;
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Test 1: info-emits-json
// ---------------------------------------------------------------------------

test('info-emits-json', () => {
  const captured = captureStdout(() => {
    createLogger('api').info('api-started', { port: 3000 });
  });

  assert.equal(captured.length, 1, 'exactly one chunk written');
  const raw = captured[0];
  assert.ok(raw.endsWith('\n'), 'line ends with newline');

  const parsed = JSON.parse(raw.trim()) as Record<string, unknown>;

  assert.equal(parsed['level'], 'info');
  assert.equal(parsed['service'], 'api');
  assert.equal(parsed['event'], 'api-started');
  assert.equal(parsed['port'], 3000);

  // ts must be a valid ISO date string
  assert.equal(typeof parsed['ts'], 'string');
  assert.ok(!isNaN(new Date(parsed['ts'] as string).getTime()), 'ts must parse as a valid Date');
});

// ---------------------------------------------------------------------------
// Test 2: error-includes-stack
// ---------------------------------------------------------------------------

test('error-includes-stack', () => {
  const err = new Error('boom');
  const captured = captureStdout(() => {
    createLogger('worker').error('crash', { error: err });
  });

  const parsed = JSON.parse(captured[0].trim()) as Record<string, unknown>;
  const errField = parsed['error'] as Record<string, unknown>;

  assert.equal(typeof errField, 'object', 'error field must be an object, not {}');
  assert.equal(errField['message'], 'boom', 'error.message must be preserved');
  assert.equal(typeof errField['stack'], 'string', 'error.stack must be a string');
  assert.ok((errField['stack'] as string).length > 0, 'error.stack must be non-empty');
});

// ---------------------------------------------------------------------------
// Test 3: no-circular-refs
// ---------------------------------------------------------------------------

test('no-circular-refs', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj: any = { name: 'x' };
  obj.self = obj;

  let captured: string[] = [];
  assert.doesNotThrow(() => {
    captured = captureStdout(() => {
      createLogger('api').info('circular-test', { data: obj });
    });
  }, 'logger must not throw on circular references');

  assert.equal(captured.length, 1, 'exactly one chunk written');
  const raw = captured[0].trim();

  // Must still be valid JSON
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  assert.ok(parsed, 'output must be valid JSON');

  // Must contain [Circular] somewhere
  assert.ok(raw.includes('[Circular]'), 'circular reference must be replaced with [Circular]');
});

// ---------------------------------------------------------------------------
// Test 4: multi-line-string-escaped
// ---------------------------------------------------------------------------

test('multi-line-string-escaped', () => {
  const captured = captureStdout(() => {
    createLogger('api').info('multi\nline\nevent');
  });

  // The entire log entry must be on a single line — no embedded newlines
  const allContent = captured.join('');
  const nonEmptyLines = allContent.split('\n').filter(s => s.length > 0);

  assert.equal(nonEmptyLines.length, 1, 'multi-line event must produce exactly one log line');

  // Parsed event must round-trip back to the original string (with real \n chars)
  const parsed = JSON.parse(nonEmptyLines[0]) as Record<string, unknown>;
  assert.equal(parsed['event'], 'multi\nline\nevent', 'parsed event matches original');

  // Raw line must NOT contain a literal newline byte before the trailing newline
  const rawWithoutTrailingNL = nonEmptyLines[0];
  assert.ok(!rawWithoutTrailingNL.includes('\n'), 'raw line contains no embedded newlines');
});
