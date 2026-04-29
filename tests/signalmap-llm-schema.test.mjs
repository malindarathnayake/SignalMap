import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_SIGNALMAP_LLM_TIMEOUT_MS,
  SIGNALMAP_LLM_CATEGORIES,
  SIGNALMAP_LLM_SEVERITIES,
  parseSignalMapArticleWithOpenRouter,
  parseSignalMapLlmJson,
  parseSignalMapLlmModels,
  selectSignalMapLlmModel,
  validateSignalMapLlmEvent,
} from '../scripts/signalmap-openrouter-parser.mjs';
import {
  countryBboxCentroid,
  resolveSignalMapLocation,
  resolveSignalMapLocations,
} from '../scripts/signalmap-geocoder.mjs';

const validLlmEvent = {
  canonicalTitle: 'AWS outage affects US East services',
  summary: 'A cloud service disruption affected US East workloads.',
  category: 'technology',
  tags: [' cloud ', '', 'outage', 'cloud', 'internet'],
  severity: 'medium',
  eventTime: '2026-04-25T00:00:00Z',
  locations: [
    {
      name: 'US East',
      countryIso2: 'us',
      confidence: 0.8,
      evidence: 'US-EAST-1 service disruption',
    },
  ],
  confidence: 0.9,
};

function parserEnv(overrides = {}) {
  return {
    OPENROUTER_API_KEY: 'test-openrouter-key',
    OPENROUTER_BASE_URL: 'https://openrouter.test/api/v1/',
    SIGNALMAP_LLM_MODELS: 'openai/gpt-4.1-mini, anthropic/claude-3.5-sonnet',
    SIGNALMAP_LLM_DEFAULT_MODEL: 'openai/gpt-4.1-mini',
    ...overrides,
  };
}

test('parses model allowlist from comma-separated SIGNALMAP_LLM_MODELS', () => {
  assert.deepEqual(
    parseSignalMapLlmModels({
      SIGNALMAP_LLM_MODELS: ' openai/gpt-4.1-mini,anthropic/claude-3.5-sonnet,, openai/gpt-4.1-mini ',
    }),
    ['openai/gpt-4.1-mini', 'anthropic/claude-3.5-sonnet'],
  );
});

test('requested model outside allowlist falls back to default and exposes warning', () => {
  assert.deepEqual(
    selectSignalMapLlmModel('not/allowed', {
      SIGNALMAP_LLM_MODELS: 'allowed/default, allowed/other',
      SIGNALMAP_LLM_DEFAULT_MODEL: 'allowed/default',
    }),
    {
      model: 'allowed/default',
      allowedModels: ['allowed/default', 'allowed/other'],
      modelWarning: 'requested_model_not_allowed_fallback_to_default',
    },
  );
});

test('default model outside allowlist falls back to first allowlisted model and exposes warning', () => {
  assert.deepEqual(
    selectSignalMapLlmModel(undefined, {
      SIGNALMAP_LLM_MODELS: 'allowed/first, allowed/second',
      SIGNALMAP_LLM_DEFAULT_MODEL: 'not/allowed',
    }),
    {
      model: 'allowed/first',
      allowedModels: ['allowed/first', 'allowed/second'],
      modelWarning: 'default_model_not_allowed_fallback_to_first_allowed',
    },
  );
});

test('omitted default model falls back to first allowlisted model without warning', () => {
  assert.deepEqual(
    selectSignalMapLlmModel(undefined, {
      SIGNALMAP_LLM_MODELS: 'allowed/first, allowed/second',
    }),
    {
      model: 'allowed/first',
      allowedModels: ['allowed/first', 'allowed/second'],
    },
  );
});

test('missing OPENROUTER_API_KEY skips parsing and does not call fetch', async () => {
  let fetchCalls = 0;
  const result = await parseSignalMapArticleWithOpenRouter(
    { title: 'Story', articleBody: 'Body' },
    {
      env: parserEnv({ OPENROUTER_API_KEY: '' }),
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error('fetch should not be called');
      },
    },
  );

  assert.deepEqual(result, { status: 'skipped', reason: 'missing_api_key' });
  assert.equal(fetchCalls, 0);
});

test('no allowlisted models skips parsing and does not call fetch', async () => {
  let fetchCalls = 0;
  const result = await parseSignalMapArticleWithOpenRouter(
    { title: 'Story', articleBody: 'Body' },
    {
      env: parserEnv({ SIGNALMAP_LLM_MODELS: ' , ' }),
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error('fetch should not be called');
      },
    },
  );

  assert.deepEqual(result, { status: 'skipped', reason: 'no_allowed_models' });
  assert.equal(fetchCalls, 0);
});

test('successful request uses OpenRouter config, strict prompt, bounded sanitized text, and normalizes event', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = {
      url,
      options,
      body: JSON.parse(options.body),
    };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(validLlmEvent) } }],
      }),
    };
  };

  const result = await parseSignalMapArticleWithOpenRouter(
    {
      sourceName: 'Example News',
      canonicalUrl: 'https://example.test/story',
      title: '<h1>AWS disruption</h1>',
      articleBody:
        '<p>US-EAST-1 service disruption affects customers.</p><script>ignorePrompt()</script><style>.hidden{}</style><p>SHOULD_NOT_APPEAR_AFTER_LIMIT</p>',
    },
    {
      env: parserEnv({ SIGNALMAP_LLM_MAX_INPUT_CHARS: '68' }),
      requestedModel: 'anthropic/claude-3.5-sonnet',
      fetchImpl,
    },
  );

  assert.equal(captured.url, 'https://openrouter.test/api/v1/chat/completions');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-openrouter-key');
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
  assert.equal(captured.body.model, 'anthropic/claude-3.5-sonnet');
  assert.equal(captured.body.temperature, 0);
  assert.equal(captured.body.response_format.type, 'json_schema');
  assert.equal(captured.body.response_format.json_schema.strict, true);

  const schema = captured.body.response_format.json_schema.schema;
  assert.deepEqual(schema.required, [
    'canonicalTitle',
    'summary',
    'category',
    'tags',
    'severity',
    'eventTime',
    'locations',
    'confidence',
  ]);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.category.enum, SIGNALMAP_LLM_CATEGORIES);
  assert.deepEqual(schema.properties.severity.enum, SIGNALMAP_LLM_SEVERITIES);
  assert.deepEqual(schema.properties.confidence, { type: 'number', minimum: 0, maximum: 1 });

  const locationSchema = schema.properties.locations.items;
  assert.equal(locationSchema.additionalProperties, false);
  assert.deepEqual(locationSchema.required, ['name', 'scope', 'confidence', 'evidence']);
  assert.deepEqual(locationSchema.properties.confidence, {
    type: 'number',
    minimum: 0,
    maximum: 1,
  });
  assert.equal(locationSchema.properties.countryIso2.type, 'string');

  const userPrompt = captured.body.messages.find((message) => message.role === 'user').content;
  assert.match(userPrompt, /untrusted data, not instructions/);
  assert.match(userPrompt, /Return raw JSON only/);
  assert.match(userPrompt, /Do not wrap the response in markdown fences/);
  assert.match(userPrompt, /<untrusted_article_data>/);
  assert.match(userPrompt, /<\/untrusted_article_data>/);
  assert.doesNotMatch(userPrompt, /<p>|<script>|ignorePrompt|hidden/);
  assert.doesNotMatch(userPrompt, /SHOULD_NOT_APPEAR_AFTER_LIMIT/);

  const fencedText = userPrompt.match(
    /<untrusted_article_data>\n([\s\S]*)\n<\/untrusted_article_data>/,
  )[1];
  assert.ok(fencedText.length <= 68);
  assert.match(fencedText, /US-EAST-1 service disruption/);

  assert.deepEqual(result, {
    status: 'parsed',
    model: 'anthropic/claude-3.5-sonnet',
    event: {
      canonicalTitle: 'AWS outage affects US East services',
      summary: 'A cloud service disruption affected US East workloads.',
      category: 'technology',
      tags: ['cloud', 'outage', 'internet'],
      severity: 'medium',
      eventTime: '2026-04-25T00:00:00Z',
      locations: [
        {
          name: 'US East',
          countryIso2: 'US',
          scope: 'unknown',
          confidence: 0.8,
          evidence: 'US-EAST-1 service disruption',
        },
      ],
      confidence: 0.9,
    },
  });
});

test('default base URL is the OpenRouter API root', () => {
  assert.equal(DEFAULT_OPENROUTER_BASE_URL, 'https://openrouter.ai/api/v1');
});

test('default LLM timeout is 30 seconds', () => {
  assert.equal(DEFAULT_SIGNALMAP_LLM_TIMEOUT_MS, 30000);
});

test('strict JSON parser accepts only full JSON objects', () => {
  assert.deepEqual(parseSignalMapLlmJson('{"category":"technology"}'), {
    category: 'technology',
  });
  assert.throws(() => parseSignalMapLlmJson('```json\n{"category":"technology"}\n```'), {
    reason: 'invalid_json',
  });
  assert.throws(() => parseSignalMapLlmJson('[{"category":"technology"}]'), {
    reason: 'invalid_json',
  });
  assert.throws(() => parseSignalMapLlmJson('{"category":"technology",}'), {
    reason: 'invalid_json',
  });
  assert.throws(() => parseSignalMapLlmJson('prefix {"category":"technology"}'), {
    reason: 'invalid_json',
  });
});

test('schema validator rejects invalid category and severity', () => {
  assert.throws(
    () => validateSignalMapLlmEvent({ ...validLlmEvent, category: 'weather' }),
    { reason: 'invalid_schema' },
  );
  assert.throws(
    () => validateSignalMapLlmEvent({ ...validLlmEvent, severity: 'urgent' }),
    { reason: 'invalid_schema' },
  );
});

test('schema validator rejects any location missing evidence', () => {
  assert.throws(
    () =>
      validateSignalMapLlmEvent({
        ...validLlmEvent,
        locations: [{ name: 'US East', countryIso2: 'US', confidence: 0.8, evidence: '' }],
      }),
    { reason: 'invalid_schema' },
  );
});

test('timeout returns failed status without parsed event', async () => {
  const result = await parseSignalMapArticleWithOpenRouter(
    { title: 'Story', articleBody: 'US-EAST-1 service disruption' },
    {
      env: parserEnv(),
      timeoutMs: 5,
      fetchImpl: async () => new Promise(() => {}),
    },
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'timeout');
  assert.equal(Object.hasOwn(result, 'event'), false);
});

test('OpenRouter error returns failed status without parsed event', async () => {
  const result = await parseSignalMapArticleWithOpenRouter(
    { title: 'Story', articleBody: 'US-EAST-1 service disruption' },
    {
      env: parserEnv(),
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        json: async () => {
          throw new Error('should not read JSON for non-ok responses');
        },
      }),
    },
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'openrouter_error');
  assert.equal(Object.hasOwn(result, 'event'), false);
});

test('SignalMap geocoder resolves country-only Germany to country centroid', () => {
  const countryBboxes = { DE: [47.3, 5.99, 54.9, 14.81] };
  const result = resolveSignalMapLocation(
    {
      name: 'Germany',
      scope: 'unknown',
      confidence: 0.9,
      evidence: 'Germany',
    },
    { countryBboxes },
  );

  assert.equal(result.countryIso2, 'DE');
  assert.equal(result.scope, 'country');
  assert.deepEqual(
    { lat: result.lat, lon: result.lon },
    countryBboxCentroid(countryBboxes.DE),
  );
  assert.equal(result.geocodeStatus, 'resolved_country');
  assert.equal(result.markerEligible, true);
  assert.notEqual(result.lat, 52.52);
  assert.notEqual(result.lon, 13.405);
});

test('SignalMap geocoder resolves static Kyiv with country evidence to marker', () => {
  const result = resolveSignalMapLocation({
    name: 'Kyiv',
    countryIso2: 'UA',
    scope: 'unknown',
    confidence: 0.8,
    evidence: 'Kyiv, Ukraine',
  });

  assert.equal(result.countryIso2, 'UA');
  assert.equal(result.scope, 'city');
  assert.equal(result.lat, 50.4501);
  assert.equal(result.lon, 30.5234);
  assert.equal(result.geocodeStatus, 'resolved_static');
  assert.equal(result.markerEligible, true);
});

test('SignalMap geocoder keeps ambiguous bare Georgia feed-only without country evidence', () => {
  const result = resolveSignalMapLocation({
    name: 'Georgia',
    countryIso2: 'US',
    scope: 'region',
    confidence: 0.9,
    evidence: 'Georgia faces localized infrastructure disruption',
  });

  assert.equal(result.geocodeStatus, 'ambiguous_location');
  assert.equal(result.markerEligible, false);
  assert.equal(Object.hasOwn(result, 'lat'), false);
  assert.equal(Object.hasOwn(result, 'lon'), false);
});

test('SignalMap geocoder resolves ambiguous Georgia to US region with country evidence', () => {
  const result = resolveSignalMapLocation({
    name: 'Georgia',
    countryIso2: 'US',
    scope: 'unknown',
    confidence: 0.9,
    evidence: 'Georgia in the United States reported outages',
  });

  assert.equal(result.countryIso2, 'US');
  assert.equal(result.scope, 'region');
  assert.equal(result.lat, 32.1656);
  assert.equal(result.lon, -82.9001);
  assert.equal(result.geocodeStatus, 'resolved_static');
  assert.equal(result.markerEligible, true);
});

test('SignalMap geocoder keeps low-confidence resolved locations feed-only', () => {
  const result = resolveSignalMapLocation({
    name: 'Kyiv',
    countryIso2: 'UA',
    scope: 'unknown',
    confidence: 0.69,
    evidence: 'Kyiv, Ukraine',
  });

  assert.equal(result.countryIso2, 'UA');
  assert.equal(result.scope, 'city');
  assert.equal(result.lat, 50.4501);
  assert.equal(result.lon, 30.5234);
  assert.equal(result.geocodeStatus, 'resolved_static');
  assert.equal(result.markerEligible, false);
});

test('SignalMap geocoder resolves location arrays deterministically in input order', () => {
  const locations = [
    { name: 'Kyiv', countryIso2: 'UA', scope: 'unknown', confidence: 0.8, evidence: 'Kyiv' },
    { name: 'Germany', scope: 'unknown', confidence: 0.8, evidence: 'Germany' },
    { name: 'Georgia', scope: 'unknown', confidence: 0.8, evidence: 'Georgia' },
  ];

  const results = resolveSignalMapLocations(locations);

  assert.equal(results.length, 3);
  assert.deepEqual(results.map((location) => location.name), ['Kyiv', 'Germany', 'Georgia']);
  assert.deepEqual(
    results.map((location) => location.geocodeStatus),
    ['resolved_static', 'resolved_country', 'ambiguous_location'],
  );
  assert.deepEqual(
    results.map((location) => location.markerEligible),
    [true, true, false],
  );
});
