import { createHash } from 'node:crypto';

// OpenRouter routes /embeddings to OpenAI's embedding endpoint. Three models
// are available there (probed live 2026-05-02): text-embedding-3-small,
// text-embedding-3-large, text-embedding-ada-002. We default to 3-small —
// 1536 dim, ~$0.02 per million tokens, top-of-class quality for the cost.
//
// At SignalMap's volume (~140 articles/day × ~125 tokens) that's ~17.5K
// tokens/day → roughly $0.01/month. Comfortably within the LLM budget.
//
// To run without an OPENROUTER_API_KEY (test/dev mode), set
// SIGNALMAP_EMBEDDING_MODEL to a Xenova/* slug — the function returns
// 'embedding_unavailable' in that case unless the caller injects an
// embedImpl, which keeps the historical behaviour intact.
export const DEFAULT_SIGNALMAP_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const DEFAULT_SIGNALMAP_EMBEDDING_DIM = 1536;
export const DEFAULT_OPENROUTER_EMBEDDINGS_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_EMBEDDINGS_TIMEOUT_MS = 15000;

const DEFAULT_MAX_EMBEDDING_INPUT_CHARS = 4000;

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function compactWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeLocationNames(locations) {
  if (!Array.isArray(locations)) return [];
  const names = [];
  const seen = new Set();
  for (const location of locations) {
    const name = cleanString(location?.name);
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

export function resolveSignalMapEmbeddingConfig(env = process.env) {
  return {
    model: cleanString(env?.SIGNALMAP_EMBEDDING_MODEL) ?? DEFAULT_SIGNALMAP_EMBEDDING_MODEL,
    dim: parsePositiveInteger(env?.SIGNALMAP_EMBEDDING_DIM, DEFAULT_SIGNALMAP_EMBEDDING_DIM),
  };
}

export function normalizeSignalMapEmbeddingInput(eventOrText) {
  if (typeof eventOrText === 'string') {
    return compactWhitespace(eventOrText).slice(0, DEFAULT_MAX_EMBEDDING_INPUT_CHARS);
  }

  if (!eventOrText || typeof eventOrText !== 'object' || Array.isArray(eventOrText)) {
    return '';
  }

  const title = cleanString(eventOrText.canonicalTitle) ??
    cleanString(eventOrText.title) ??
    cleanString(eventOrText.headline);
  const summary = cleanString(eventOrText.summary) ?? cleanString(eventOrText.description);
  const tags = Array.isArray(eventOrText.tags) ? eventOrText.tags.filter(cleanString).join(', ') : undefined;
  const locationNames = normalizeLocationNames(eventOrText.locations).join(', ');
  const parts = [
    title,
    summary,
    cleanString(eventOrText.category),
    cleanString(eventOrText.severity),
    tags,
    locationNames,
  ];

  return compactWhitespace(parts.filter(Boolean).join('\n')).slice(0, DEFAULT_MAX_EMBEDDING_INPUT_CHARS);
}

function hashChunk(seed, index) {
  return createHash('sha256').update(`${seed}\0${index}`).digest();
}

function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

export function createDeterministicMockVector(seed, dim = DEFAULT_SIGNALMAP_EMBEDDING_DIM) {
  const vectorDim = parsePositiveInteger(dim, DEFAULT_SIGNALMAP_EMBEDDING_DIM);
  const values = [];
  let chunkIndex = 0;
  while (values.length < vectorDim) {
    const chunk = hashChunk(String(seed ?? ''), chunkIndex);
    for (let offset = 0; offset < chunk.length && values.length < vectorDim; offset += 2) {
      const uint = chunk.readUInt16BE(offset);
      values.push((uint / 32767.5) - 1);
    }
    chunkIndex += 1;
  }
  return normalizeVector(values);
}

function vectorFromEmbeddingResult(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.vector)) return result.vector;
  if (ArrayBuffer.isView(result)) return Array.from(result);
  if (ArrayBuffer.isView(result?.vector)) return Array.from(result.vector);
  return null;
}

// Decide whether the configured model should route through OpenRouter's
// /embeddings endpoint. `openai/*` prefixes are the only ones OpenRouter
// proxies for embeddings — Cohere/Voyage/Mistral all 400 there. Any other
// model slug (e.g. `Xenova/*`) falls back to embedding_unavailable unless
// the caller injects a custom embedImpl.
function isOpenRouterEmbeddingModel(model) {
  return typeof model === 'string' && model.startsWith('openai/');
}

async function embedViaOpenRouter(input, config, env, fetchImpl, abortControllerImpl) {
  const apiKey = cleanString(env?.OPENROUTER_API_KEY);
  if (!apiKey) {
    const error = new Error('OPENROUTER_API_KEY not set');
    error.name = 'SignalMapEmbeddingMissingApiKey';
    throw error;
  }
  const baseUrl = cleanString(env?.OPENROUTER_BASE_URL) ?? DEFAULT_OPENROUTER_EMBEDDINGS_BASE_URL;
  const timeoutMs = parsePositiveInteger(
    env?.SIGNALMAP_EMBEDDING_TIMEOUT_MS,
    DEFAULT_OPENROUTER_EMBEDDINGS_TIMEOUT_MS,
  );
  const controller = abortControllerImpl ? new abortControllerImpl() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: config.model, input }),
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!response?.ok) {
      const status = response?.status ?? 0;
      let detail = '';
      try {
        const body = await response.json();
        detail = body?.error?.message ?? '';
      } catch {
        try { detail = (await response.text()).slice(0, 200); } catch { /* ignore */ }
      }
      const error = new Error(`OpenRouter embeddings HTTP ${status}${detail ? ' — ' + detail : ''}`);
      error.name = status === 402 || status === 403
        ? 'SignalMapEmbeddingBudgetError'
        : 'SignalMapEmbeddingHttpError';
      throw error;
    }
    const payload = await response.json();
    const vector = payload?.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length === 0) {
      const error = new Error('OpenRouter embeddings response had no vector');
      error.name = 'SignalMapEmbeddingShapeError';
      throw error;
    }
    return vector;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function embedSignalMapStory(eventOrText, options = {}) {
  const env = options.env ?? process.env;
  const config = {
    ...resolveSignalMapEmbeddingConfig(env),
    ...(options.model ? { model: options.model } : {}),
    ...(options.dim ? { dim: options.dim } : {}),
  };
  const input = normalizeSignalMapEmbeddingInput(eventOrText);

  try {
    if (options.embedImpl) {
      const result = await options.embedImpl(input, config);
      const vector = vectorFromEmbeddingResult(result);
      if (!vector || vector.length !== config.dim || !vector.every(Number.isFinite)) {
        return {
          status: 'failed',
          reason: 'invalid_embedding_vector',
          errorClass: 'SignalMapInvalidEmbeddingVectorError',
          embeddingModel: config.model,
          embeddingDim: config.dim,
        };
      }
      return {
        status: 'embedded',
        vector,
        embeddingModel: result?.embeddingModel ?? config.model,
        embeddingDim: result?.embeddingDim ?? config.dim,
      };
    }

    if (options.mock === true) {
      return {
        status: 'embedded',
        vector: createDeterministicMockVector(input, config.dim),
        embeddingModel: config.model,
        embeddingDim: config.dim,
        mock: true,
      };
    }

    // Live path: openai/* models route through OpenRouter's embeddings
    // endpoint. Anything else (e.g. legacy Xenova/* slugs) falls through
    // to embedding_unavailable, preserving the historical behaviour for
    // configurations that haven't been migrated.
    if (isOpenRouterEmbeddingModel(config.model)) {
      const fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
      const AbortControllerImpl = options.AbortControllerImpl ?? globalThis.AbortController;
      const vector = await embedViaOpenRouter(input, config, env, fetchImpl, AbortControllerImpl);
      if (!Array.isArray(vector) || vector.length !== config.dim || !vector.every(Number.isFinite)) {
        return {
          status: 'failed',
          reason: 'invalid_embedding_vector',
          errorClass: 'SignalMapInvalidEmbeddingVectorError',
          embeddingModel: config.model,
          embeddingDim: config.dim,
        };
      }
      return {
        status: 'embedded',
        vector,
        embeddingModel: config.model,
        embeddingDim: config.dim,
      };
    }

    return {
      status: 'failed',
      reason: 'embedding_unavailable',
      errorClass: 'SignalMapEmbeddingUnavailableError',
      embeddingModel: config.model,
      embeddingDim: config.dim,
    };
  } catch (error) {
    return {
      status: 'failed',
      reason: 'embedding_error',
      errorClass: error?.name ?? 'SignalMapEmbeddingError',
      error: error?.message ?? String(error),
      embeddingModel: config.model,
      embeddingDim: config.dim,
    };
  }
}
