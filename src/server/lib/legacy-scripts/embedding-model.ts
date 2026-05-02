import { createHash } from 'node:crypto';

export const DEFAULT_SIGNALMAP_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DEFAULT_SIGNALMAP_EMBEDDING_DIM = 384;

const DEFAULT_MAX_EMBEDDING_INPUT_CHARS = 4000;

function cleanString(value: any): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parsePositiveInteger(value: any, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function compactWhitespace(value: any): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeLocationNames(locations: any[]): string[] {
  if (!Array.isArray(locations)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const location of locations) {
    const name = cleanString(location?.name);
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

export function resolveSignalMapEmbeddingConfig(
  env: NodeJS.ProcessEnv = process.env,
): { model: string; dim: number } {
  return {
    model: cleanString(env?.SIGNALMAP_EMBEDDING_MODEL) ?? DEFAULT_SIGNALMAP_EMBEDDING_MODEL,
    dim: parsePositiveInteger(env?.SIGNALMAP_EMBEDDING_DIM, DEFAULT_SIGNALMAP_EMBEDDING_DIM),
  };
}

export function normalizeSignalMapEmbeddingInput(eventOrText: any): string {
  if (typeof eventOrText === 'string') {
    return compactWhitespace(eventOrText).slice(0, DEFAULT_MAX_EMBEDDING_INPUT_CHARS);
  }

  if (!eventOrText || typeof eventOrText !== 'object' || Array.isArray(eventOrText)) {
    return '';
  }

  const title =
    cleanString(eventOrText.canonicalTitle) ??
    cleanString(eventOrText.title) ??
    cleanString(eventOrText.headline);
  const summary = cleanString(eventOrText.summary) ?? cleanString(eventOrText.description);
  const tags = Array.isArray(eventOrText.tags)
    ? eventOrText.tags.filter(cleanString).join(', ')
    : undefined;
  const locationNames = normalizeLocationNames(eventOrText.locations).join(', ');
  const parts = [
    title,
    summary,
    cleanString(eventOrText.category),
    cleanString(eventOrText.severity),
    tags,
    locationNames,
  ];

  return compactWhitespace(parts.filter(Boolean).join('\n')).slice(
    0,
    DEFAULT_MAX_EMBEDDING_INPUT_CHARS,
  );
}

function hashChunk(seed: string, index: number): Buffer {
  return createHash('sha256').update(`${seed}\0${index}`).digest();
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

export function createDeterministicMockVector(
  seed: string,
  dim: number = DEFAULT_SIGNALMAP_EMBEDDING_DIM,
): number[] {
  const vectorDim = parsePositiveInteger(dim, DEFAULT_SIGNALMAP_EMBEDDING_DIM);
  const values: number[] = [];
  let chunkIndex = 0;
  while (values.length < vectorDim) {
    const chunk = hashChunk(String(seed ?? ''), chunkIndex);
    for (let offset = 0; offset < chunk.length && values.length < vectorDim; offset += 2) {
      const uint = chunk.readUInt16BE(offset);
      values.push(uint / 32767.5 - 1);
    }
    chunkIndex += 1;
  }
  return normalizeVector(values);
}

function vectorFromEmbeddingResult(result: any): number[] | null {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.vector)) return result.vector;
  if (ArrayBuffer.isView(result)) return Array.from(result as any);
  if (ArrayBuffer.isView(result?.vector)) return Array.from(result.vector);
  return null;
}

export async function embedSignalMapStory(eventOrText: any, options: any = {}): Promise<any> {
  const config = {
    ...resolveSignalMapEmbeddingConfig(options.env ?? process.env),
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

    return {
      status: 'failed',
      reason: 'embedding_unavailable',
      errorClass: 'SignalMapEmbeddingUnavailableError',
      embeddingModel: config.model,
      embeddingDim: config.dim,
    };
  } catch (error: any) {
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
