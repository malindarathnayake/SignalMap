/**
 * Unit tests for src/server/lib/client-ip.ts (getClientIpDynamic).
 * No Redis required.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getClientIpDynamic } from '../src/server/lib/client-ip.ts';

// Minimal IncomingMessage stub
function makeReq(headers = {}, remoteAddress = '127.0.0.1') {
  return /** @type {import('node:http').IncomingMessage} */ (
    /** @type {unknown} */ ({ headers, socket: { remoteAddress } })
  );
}

describe('getClientIpDynamic', () => {
  it('1. returns req.socket.remoteAddress when TRUSTED_PROXY is unset', (t) => {
    const saved = process.env.TRUSTED_PROXY;
    delete process.env.TRUSTED_PROXY;
    t.after(() => {
      if (saved === undefined) delete process.env.TRUSTED_PROXY;
      else process.env.TRUSTED_PROXY = saved;
    });

    const req = makeReq({}, '10.0.0.1');
    assert.equal(getClientIpDynamic(req), '10.0.0.1');
  });

  it('2. with TRUSTED_PROXY=1 and X-Forwarded-For returns first entry', (t) => {
    const saved = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = '1';
    t.after(() => {
      if (saved === undefined) delete process.env.TRUSTED_PROXY;
      else process.env.TRUSTED_PROXY = saved;
    });

    const req = makeReq({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, '127.0.0.1');
    assert.equal(getClientIpDynamic(req), '1.2.3.4');
  });

  it('3. with TRUSTED_PROXY=1 and only Cf-Connecting-IP returns that IP', (t) => {
    const saved = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = '1';
    t.after(() => {
      if (saved === undefined) delete process.env.TRUSTED_PROXY;
      else process.env.TRUSTED_PROXY = saved;
    });

    const req = makeReq({ 'cf-connecting-ip': '9.9.9.9' }, '127.0.0.1');
    assert.equal(getClientIpDynamic(req), '9.9.9.9');
  });

  it('4. with TRUSTED_PROXY=1 and no proxy headers falls back to socket.remoteAddress', (t) => {
    const saved = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = '1';
    t.after(() => {
      if (saved === undefined) delete process.env.TRUSTED_PROXY;
      else process.env.TRUSTED_PROXY = saved;
    });

    const req = makeReq({}, '192.168.1.1');
    assert.equal(getClientIpDynamic(req), '192.168.1.1');
  });
});
