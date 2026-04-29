import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { callPerplexity } = await import('../src/server/lib/perplexity.ts');

const fixture = {
  id: 'chatcmpl-abc123',
  model: 'sonar-pro',
  created: 1700000000,
  object: 'chat.completion',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Some response text.' },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    search_context_size: 'low',
    cost: {
      input_tokens_cost: 0.001,
      output_tokens_cost: 0.002,
      request_cost: 0.005,
      total_cost: 0.008,
    },
  },
  citations: ['https://reuters.com/article/1', 'https://bbc.com/news/2'],
  search_results: [
    { title: 'Reuters Article', url: 'https://reuters.com/article/1', date: '2024-01-01' },
    { title: 'BBC News', url: 'https://bbc.com/news/2' },
  ],
};

function makeStubFetch(response) {
  let calls = [];
  const stub = async (url, init) => {
    calls.push({ url, init });
    return response;
  };
  stub.calls = calls;
  return stub;
}

function makeOkFetch(body = fixture) {
  return makeStubFetch({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

const baseReq = {
  messages: [{ role: 'user', content: 'What is happening in the world?' }],
  searchDomainFilter: ['reuters.com', 'bbc.com'],
};

describe('callPerplexity — domain cap guard', () => {
  it('rejects before making any fetch call when searchDomainFilter.length > 20', async () => {
    const stub = makeOkFetch();
    const tooMany = Array.from({ length: 21 }, (_, i) => `domain${i}.com`);
    await assert.rejects(
      () => callPerplexity({ ...baseReq, searchDomainFilter: tooMany }, { apiKey: 'test-key', fetchImpl: stub }),
      (err) => {
        assert.ok(err.message.includes('20-domain cap'));
        assert.ok(err.message.includes('21'));
        return true;
      },
    );
    assert.equal(stub.calls.length, 0, 'fetch must not be called when cap exceeded');
  });
});

describe('callPerplexity — API key guard', () => {
  it('rejects when no API key is provided and env var is unset', async () => {
    const saved = process.env.PERPLEXITY_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
    try {
      const stub = makeOkFetch();
      await assert.rejects(
        () => callPerplexity(baseReq, { fetchImpl: stub }),
        (err) => {
          assert.ok(err.message.includes('PERPLEXITY_API_KEY is not set'));
          return true;
        },
      );
    } finally {
      if (saved !== undefined) process.env.PERPLEXITY_API_KEY = saved;
    }
  });
});

describe('callPerplexity — request body construction', () => {
  it('sends correct URL, Authorization header, and body fields', async () => {
    const stub = makeOkFetch();
    await callPerplexity(baseReq, { apiKey: 'my-key', fetchImpl: stub });

    assert.equal(stub.calls.length, 1);
    const { url, init } = stub.calls[0];
    assert.equal(url, 'https://api.perplexity.ai/chat/completions');
    assert.equal(init.headers['Authorization'], 'Bearer my-key');
    assert.equal(init.method, 'POST');

    const body = JSON.parse(init.body);
    assert.deepEqual(body.messages, baseReq.messages);
    assert.deepEqual(body.search_domain_filter, baseReq.searchDomainFilter);
    assert.equal(body.search_context_size, 'low');
    assert.equal(body.max_tokens, 500);
  });

  it('omits search_recency_filter when not provided', async () => {
    const stub = makeOkFetch();
    await callPerplexity(baseReq, { apiKey: 'key', fetchImpl: stub });
    const body = JSON.parse(stub.calls[0].init.body);
    assert.equal('search_recency_filter' in body, false);
  });

  it('includes search_recency_filter when defined', async () => {
    const stub = makeOkFetch();
    await callPerplexity(
      { ...baseReq, searchRecencyFilter: 'week' },
      { apiKey: 'key', fetchImpl: stub },
    );
    const body = JSON.parse(stub.calls[0].init.body);
    assert.equal(body.search_recency_filter, 'week');
  });
});

describe('callPerplexity — model defaulting', () => {
  it('defaults model to sonar-pro when req.model is not set', async () => {
    const stub = makeOkFetch();
    await callPerplexity(baseReq, { apiKey: 'key', fetchImpl: stub });
    const body = JSON.parse(stub.calls[0].init.body);
    assert.equal(body.model, 'sonar-pro');
  });
});

describe('callPerplexity — successful response parsing', () => {
  it('returns the parsed response object on 200', async () => {
    const stub = makeOkFetch(fixture);
    const result = await callPerplexity(baseReq, { apiKey: 'key', fetchImpl: stub });
    assert.equal(result.id, fixture.id);
    assert.equal(result.model, fixture.model);
    assert.deepEqual(result.citations, fixture.citations);
    assert.deepEqual(result.search_results, fixture.search_results);
    assert.equal(result.usage.total_tokens, 150);
    assert.equal(result.usage.cost?.total_cost, 0.008);
  });
});

describe('callPerplexity — error handling', () => {
  it('throws with status code and body snippet on non-2xx response', async () => {
    const errorBody = JSON.stringify({ error: 'invalid request', detail: 'bad filter' });
    const stub = makeStubFetch({
      ok: false,
      status: 400,
      text: async () => errorBody,
      json: async () => ({ error: 'invalid request' }),
    });
    await assert.rejects(
      () => callPerplexity(baseReq, { apiKey: 'key', fetchImpl: stub }),
      (err) => {
        assert.ok(err.message.includes('400'));
        assert.ok(err.message.includes('invalid request'));
        return true;
      },
    );
  });
});
