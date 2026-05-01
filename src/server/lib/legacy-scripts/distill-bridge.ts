import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BUNDLED_SIGNALMAP_DISTILL_ROOT = resolve(
  process.cwd(),
  'vendor',
  'distill',
);

export const SIGNALMAP_DISTILL_DESCRIPTOR_FILES = [
  'risky-business-news.json',
  'the-hacker-news.json',
];

export const DEFAULT_SIGNALMAP_DISTILL_TIMEOUT_MS = 15000;

const SUPPORTED_SOURCE_NAMES = new Set(['Risky Business News', 'The Hacker News']);
const SOURCE_NAME_ALIASES = new Map([['Risky Business', 'Risky Business News']]);
const SIGNALMAP_DISTILL_DESCRIPTOR_BY_SOURCE = new Map([
  ['Risky Business News', 'risky-business-news.json'],
  ['The Hacker News', 'the-hacker-news.json'],
]);

function cleanString(value: any): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parsePositiveTimeoutMs(value: any, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function resolveSignalMapDistillTimeoutMs(options: { timeoutMs?: number; env?: any } = {}): number {
  if (Number.isFinite(options.timeoutMs)) {
    return Math.max(0, options.timeoutMs as number);
  }

  const env = options.env;
  if (env && Object.hasOwn(env, 'SIGNALMAP_DISTILL_TIMEOUT_MS')) {
    return parsePositiveTimeoutMs(
      env.SIGNALMAP_DISTILL_TIMEOUT_MS,
      DEFAULT_SIGNALMAP_DISTILL_TIMEOUT_MS,
    );
  }

  return parsePositiveTimeoutMs(
    process.env.SIGNALMAP_DISTILL_TIMEOUT_MS,
    DEFAULT_SIGNALMAP_DISTILL_TIMEOUT_MS,
  );
}

function fallbackArticle(input: any): any {
  const url = cleanString(input?.url) ?? '';
  const title = cleanString(input?.title) ?? url;
  const articleBody = cleanString(input?.snippet) ?? title ?? url;

  return {
    title,
    articleBody,
    canonicalUrl: url,
    sourceName: String(input?.sourceName ?? ''),
  };
}

function fallbackResult(input: any, fallbackReason: string, error?: any): any {
  return {
    status: 'fallback',
    article: fallbackArticle(input),
    fallbackReason,
    ...(error ? { error } : {}),
  };
}

export function resolveSignalMapDistillBridgeConfig(options: any = {}): any {
  const hasOptionRoot = Object.hasOwn(options, 'distillRoot');
  const hasOptionEnvRoot =
    options.env && Object.hasOwn(options.env, 'SIGNALMAP_DISTILL_ROOT');
  const hasProcessEnvRoot = Object.hasOwn(process.env, 'SIGNALMAP_DISTILL_ROOT');
  const configuredRoot = hasOptionRoot
    ? cleanString(options.distillRoot)
    : hasOptionEnvRoot
    ? cleanString(options.env.SIGNALMAP_DISTILL_ROOT)
    : cleanString(process.env.SIGNALMAP_DISTILL_ROOT);
  const bundledRoot = existsSync(BUNDLED_SIGNALMAP_DISTILL_ROOT)
    ? BUNDLED_SIGNALMAP_DISTILL_ROOT
    : undefined;
  const explicitRootRequested = hasOptionRoot || hasOptionEnvRoot || hasProcessEnvRoot;
  const resolvedRoot = configuredRoot ?? (explicitRootRequested ? undefined : bundledRoot);

  if (!resolvedRoot) {
    return {
      enabled: false,
      fallbackReason: 'missing_root',
      distillRoot: undefined,
      modulePath: undefined,
      descriptorPaths: [],
    };
  }

  const distillRoot = resolve(resolvedRoot);
  const modulePath = resolve(distillRoot, 'dist', 'index.js');
  const descriptorPaths = SIGNALMAP_DISTILL_DESCRIPTOR_FILES.map((file) =>
    resolve(distillRoot, 'descriptors', file),
  );

  if (!existsSync(distillRoot)) {
    return {
      enabled: false,
      fallbackReason: 'missing_root',
      distillRoot,
      modulePath,
      descriptorPaths,
    };
  }

  if (!existsSync(modulePath)) {
    return {
      enabled: false,
      fallbackReason: 'missing_build',
      distillRoot,
      modulePath,
      descriptorPaths,
    };
  }

  return {
    enabled: true,
    distillRoot,
    modulePath,
    descriptorPaths,
  };
}

function normalizeDistilledArticle(output: any): any | undefined {
  if (!output || typeof output !== 'object') {
    return undefined;
  }

  const title = cleanString(output.title);
  const articleBody = cleanString(output.articleBody);
  const canonicalUrl = cleanString(output.canonicalUrl);
  const rawSourceName = cleanString(output.sourceName);
  const sourceName = rawSourceName
    ? SOURCE_NAME_ALIASES.get(rawSourceName) ?? rawSourceName
    : undefined;

  if (!title || !articleBody || !canonicalUrl || !SUPPORTED_SOURCE_NAMES.has(sourceName as string)) {
    return undefined;
  }

  return {
    title,
    ...(cleanString(output.dek) ? { dek: cleanString(output.dek) } : {}),
    ...(cleanString(output.author) ? { author: cleanString(output.author) } : {}),
    ...(cleanString(output.publishedAt) ? { publishedAt: cleanString(output.publishedAt) } : {}),
    ...(cleanString(output.updatedAt) ? { updatedAt: cleanString(output.updatedAt) } : {}),
    articleBody,
    ...(Array.isArray(output.tags)
      ? { tags: output.tags.map(cleanString).filter(Boolean) }
      : {}),
    canonicalUrl,
    sourceName,
  };
}

function withTimeout(promise: Promise<any>, timeoutMs: number): Promise<any> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `Distill extraction timed out after ${timeoutMs}ms`,
      ) as NodeJS.ErrnoException;
      error.name = 'SignalMapDistillTimeoutError';
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

export async function extractSignalMapArticleWithDistill(
  input: any,
  options: any = {},
): Promise<any> {
  if (!SUPPORTED_SOURCE_NAMES.has(input?.sourceName)) {
    return fallbackResult(input, 'unsupported_source');
  }

  const config = resolveSignalMapDistillBridgeConfig(options);
  if (!config.enabled) {
    return fallbackResult(input, config.fallbackReason);
  }

  const descriptorFile = SIGNALMAP_DISTILL_DESCRIPTOR_BY_SOURCE.get(input.sourceName);
  const descriptorPath = resolve(config.distillRoot, 'descriptors', descriptorFile as string);
  if (!existsSync(descriptorPath)) {
    return fallbackResult(input, 'missing_descriptor');
  }

  try {
    const moduleUrl = pathToFileURL(config.modulePath);
    if (options.importCacheKey) {
      moduleUrl.searchParams.set('signalmapDistillBridgeCacheKey', options.importCacheKey);
    }

    const imported = await import(moduleUrl.href);
    const Distill = imported.Distill ?? imported.default;
    if (typeof Distill !== 'function') {
      return fallbackResult(input, 'extract_error', 'Distill export was not a constructor');
    }

    const distill = new Distill({ descriptors: [descriptorPath] });
    const timeoutMs = resolveSignalMapDistillTimeoutMs(options);
    const output = await withTimeout(distill.extract(input.url), timeoutMs);
    const article = normalizeDistilledArticle(output);

    if (!article) {
      return fallbackResult(input, 'invalid_distill_output');
    }

    return {
      status: 'distilled',
      article,
    };
  } catch (error: any) {
    if (error?.name === 'SignalMapDistillTimeoutError') {
      return fallbackResult(input, 'timeout', error.message);
    }

    return fallbackResult(input, 'extract_error', error?.message ?? String(error));
  }
}
