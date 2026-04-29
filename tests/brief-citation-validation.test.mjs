import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  extractHost,
  validateCitations,
  validatePerplexityResponse,
} = await import('../src/server/lib/citation-validator.ts');

describe('extractHost', () => {
  it('returns null for invalid URL strings', () => {
    assert.equal(extractHost('not-a-url'), null);
    assert.equal(extractHost(''), null);
    assert.equal(extractHost('ftp://'), null);
  });

  it('strips www. prefix and lowercases', () => {
    assert.equal(extractHost('https://www.Reuters.com/article'), 'reuters.com');
    assert.equal(extractHost('https://WWW.BBC.CO.UK/news'), 'bbc.co.uk');
  });

  it('strips ports and handles trailing slashes', () => {
    assert.equal(extractHost('https://reuters.com:443/article'), 'reuters.com');
    assert.equal(extractHost('https://api.example.com:8080/path'), 'api.example.com');
    assert.equal(extractHost('https://reuters.com/'), 'reuters.com');
  });

  it('rejects javascript:/data:/file: protocols even with valid hostname', () => {
    assert.equal(extractHost('javascript://reuters.com/%0aalert(1)'), null);
    assert.equal(extractHost('data://reuters.com/payload'), null);
    assert.equal(extractHost('file:///etc/passwd'), null);
  });
});

describe('validateCitations — exact match', () => {
  it('keeps URLs whose host exactly matches an allowlist entry', () => {
    const result = validateCitations(
      ['https://reuters.com/article/1', 'https://bbc.com/news/2'],
      ['reuters.com', 'bbc.com'],
    );
    assert.deepEqual(result.kept, ['https://reuters.com/article/1', 'https://bbc.com/news/2']);
    assert.deepEqual(result.dropped, []);
    assert.equal(result.degraded, false);
  });
});

describe('validateCitations — subdomain match', () => {
  it('keeps URLs whose host is a subdomain of an allowlist entry', () => {
    const result = validateCitations(
      ['https://api.reuters.com/v1/article', 'https://feeds.bbc.co.uk/news'],
      ['reuters.com', 'bbc.co.uk'],
    );
    assert.deepEqual(result.kept, ['https://api.reuters.com/v1/article', 'https://feeds.bbc.co.uk/news']);
    assert.deepEqual(result.dropped, []);
    assert.equal(result.degraded, false);
  });
});

describe('validateCitations — drop non-matching', () => {
  it('drops URLs not in allowlist', () => {
    const result = validateCitations(
      ['https://unknown-site.com/article', 'https://reuters.com/news'],
      ['reuters.com'],
    );
    assert.deepEqual(result.kept, ['https://reuters.com/news']);
    assert.deepEqual(result.dropped, ['https://unknown-site.com/article']);
    assert.equal(result.degraded, false);
  });
});

describe('validateCitations — degraded flag', () => {
  it('returns degraded: true when citations is non-empty and ALL are dropped', () => {
    const result = validateCitations(
      ['https://unknown1.com/a', 'https://unknown2.com/b'],
      ['reuters.com'],
    );
    assert.equal(result.kept.length, 0);
    assert.equal(result.dropped.length, 2);
    assert.equal(result.degraded, true);
  });

  it('returns degraded: false when citations is empty', () => {
    const result = validateCitations([], ['reuters.com']);
    assert.equal(result.degraded, false);
    assert.equal(result.kept.length, 0);
    assert.equal(result.dropped.length, 0);
  });
});

describe('validateCitations — case insensitivity', () => {
  it('matches allowlist entries case-insensitively', () => {
    const result = validateCitations(
      ['https://Reuters.COM/article'],
      ['reuters.com'],
    );
    assert.equal(result.kept.length, 1);
    assert.equal(result.degraded, false);
  });
});

describe('validatePerplexityResponse', () => {
  it('wraps validateCitations correctly for a minimal response shape', () => {
    const resp = {
      citations: ['https://reuters.com/a', 'https://evil.com/b'],
    };
    const result = validatePerplexityResponse(resp, ['reuters.com']);
    assert.deepEqual(result.kept, ['https://reuters.com/a']);
    assert.deepEqual(result.dropped, ['https://evil.com/b']);
    assert.equal(result.degraded, false);
  });
});
