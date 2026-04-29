#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { XMLParser } from 'fast-xml-parser';

import { CHROME_UA, loadSharedConfig } from './_seed-utils.mjs';
import Redis from 'ioredis';
import { extractSignalMapArticleWithDistill } from './signalmap-distill-bridge.mjs';
import { embedSignalMapStory } from './signalmap-embedding-model.mjs';
import {
  DEFAULT_SIGNALMAP_LOCATION_CONFIDENCE_MIN,
  resolveSignalMapLocations,
} from './signalmap-geocoder.mjs';
import {
  findRelatedStories,
  getVectorStoreHealth,
  openVectorStore,
  pruneOldVectors,
  resolveSignalMapVectorStoreConfig,
  upsertStoryVector,
} from './signalmap-lancedb-store.mjs';
import { parseSignalMapArticleWithOpenRouter } from './signalmap-openrouter-parser.mjs';

export const SIGNALMAP_NEWS_CACHE_KEY = 'signalmap:news:v1';
export const SIGNALMAP_NEWS_META_KEY = 'seed-meta:signalmap:news';
export const SIGNALMAP_HEALTH_DOMAIN_KEYS = Object.freeze({
  radar: {
    cacheKey: 'signalmap:radar:v1',
    metaKey: 'seed-meta:signalmap:radar',
  },
  providers: {
    cacheKey: 'signalmap:providers:v1',
    metaKey: 'seed-meta:signalmap:providers',
  },
  news: {
    cacheKey: SIGNALMAP_NEWS_CACHE_KEY,
    metaKey: SIGNALMAP_NEWS_META_KEY,
  },
  llm: {
    cacheKey: 'signalmap:health:llm:v1',
    metaKey: 'seed-meta:signalmap:llm',
  },
  distill: {
    cacheKey: 'signalmap:health:distill:v1',
    metaKey: 'seed-meta:signalmap:distill',
  },
  lancedb: {
    cacheKey: 'signalmap:health:lancedb:v1',
    metaKey: 'seed-meta:signalmap:lancedb',
  },
  embeddings: {
    cacheKey: 'signalmap:health:embeddings:v1',
    metaKey: 'seed-meta:signalmap:embeddings',
  },
});
export const SIGNALMAP_COLLECTOR_HEALTH_DOMAINS = Object.freeze([
  'llm',
  'distill',
  'lancedb',
  'embeddings',
]);
export const DEFAULT_SIGNALMAP_RSS_POLL_MINUTES = 15;
export const DEFAULT_SIGNALMAP_FULL_EXTRACTION_DOMAINS = ['risky.biz', 'thehackernews.com'];

const DEFAULT_SIGNALMAP_NEWS_TTL_SECONDS = 60 * 30;
const DEFAULT_SIGNALMAP_NEWS_META_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_SOURCE_TIER = 3;
const RSS_ACCEPT_HEADER = 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5';

const TRACKING_QUERY_PARAM_RE =
  /^(utm_|fbclid$|gclid$|dclid$|mc_cid$|mc_eid$|igshid$|ref$|ref_src$|cmpid$|ocid$)/i;

const DEFAULT_SIGNALMAP_NEWS_SOURCES = [
  {
    name: 'Risky Business News',
    url: 'https://risky.biz/feeds/risky-business-news/',
  },
  {
    name: 'The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
  },
];

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function compactWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseConfidence(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
}

function hashValue(value, length = 64) {
  return createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, length);
}

function stripHtml(value) {
  return compactWhitespace(
    String(value ?? '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  );
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function readDate(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return undefined;
  const parsed = Date.parse(cleaned);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function readXmlText(value) {
  if (value == null) return undefined;
  if (typeof value === 'string' || typeof value === 'number') return cleanString(String(value));
  if (typeof value === 'object') {
    const direct = cleanString(value['#text']) ?? cleanString(value['@_href']) ?? cleanString(value.href);
    if (direct) return direct;
    const nested = Object.entries(value)
      .filter(([key]) => !key.startsWith('@_'))
      .map(([, child]) => toArray(child).map(readXmlText).filter(Boolean).join(' '))
      .filter(Boolean)
      .join(' ');
    return cleanString(nested);
  }
  return undefined;
}

function readRssLink(item) {
  const guid = item?.guid;
  const link = item?.link;
  if (Array.isArray(link)) {
    for (const candidate of link) {
      const href = readXmlText(candidate);
      if (href) return href;
    }
  }
  return readXmlText(link) ?? readXmlText(item?.['atom:link']) ?? readXmlText(guid);
}

function uniqueStrings(values, limit = 16) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const cleaned = cleanString(value);
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeHostname(hostname) {
  return String(hostname ?? '').toLowerCase().replace(/^www\./, '');
}

function sourceTierFor(sourceName, sourceTiers) {
  const tier = Number(sourceTiers?.[sourceName]);
  return Number.isInteger(tier) && tier > 0 ? tier : DEFAULT_SOURCE_TIER;
}

function flattenFeeds(feeds) {
  if (Array.isArray(feeds)) return feeds;
  if (!feeds || typeof feeds !== 'object') return [];

  const flattened = [];
  for (const value of Object.values(feeds)) {
    if (Array.isArray(value)) {
      flattened.push(...value);
    } else if (value && typeof value === 'object') {
      flattened.push(...flattenFeeds(value));
    }
  }
  return flattened;
}

function normalizeSource(input, sourceTiers) {
  const name = cleanString(input?.name) ?? cleanString(input?.sourceName);
  const feedUrl = cleanString(input?.feedUrl) ?? cleanString(input?.url);
  if (!name || !feedUrl) return null;
  return {
    ...input,
    name,
    sourceName: name,
    feedUrl,
    url: feedUrl,
    sourceTier: sourceTierFor(name, sourceTiers),
  };
}

// _fetchImpl is kept in the signature for backward compatibility but is no longer
// used inside this function — transport has migrated to ioredis adapter.
async function redisRestPublish(payload, options = {}, _fetchImpl) {
  const env = options.env ?? process.env;
  const redisUrl = cleanString(env?.REDIS_URL);
  if (!redisUrl) {
    return { status: 'degraded', reason: 'missing_redis_credentials' };
  }

  const ttlSeconds = parsePositiveInteger(options.ttlSeconds, DEFAULT_SIGNALMAP_NEWS_TTL_SECONDS);
  const metaTtlSeconds = parsePositiveInteger(
    options.metaTtlSeconds,
    DEFAULT_SIGNALMAP_NEWS_META_TTL_SECONDS,
  );
  const commands = [
    ['SET', SIGNALMAP_NEWS_CACHE_KEY, JSON.stringify(payload.data), 'EX', ttlSeconds],
    ['SET', SIGNALMAP_NEWS_META_KEY, JSON.stringify(payload.meta), 'EX', metaTtlSeconds],
  ];
  const healthDomains = payload.healthDomains && typeof payload.healthDomains === 'object'
    ? Object.values(payload.healthDomains)
    : [];
  for (const domain of healthDomains) {
    if (!domain?.cacheKey || !domain?.metaKey) continue;
    commands.push(
      ['SET', domain.cacheKey, JSON.stringify(domain.data), 'EX', metaTtlSeconds],
      ['SET', domain.metaKey, JSON.stringify(domain.meta), 'EX', metaTtlSeconds],
    );
  }

  const client = new Redis(redisUrl, {
    lazyConnect: false,
    enableAutoPipelining: false,
    commandTimeout: 5000,
  });
  try {
    for (const command of commands) {
      const [verb, key, value, , ttl] = command;
      if (verb === 'SET' && key && value !== undefined && ttl) {
        await client.setex(key, Number(ttl), value);
      }
    }
  } finally {
    await client.quit();
  }

  return {
    status: 'published',
    keys: [
      SIGNALMAP_NEWS_CACHE_KEY,
      SIGNALMAP_NEWS_META_KEY,
      ...healthDomains.flatMap((domain) => [domain.cacheKey, domain.metaKey]),
    ],
  };
}

function vectorEnabledFrom(options = {}, vectorConfig) {
  if (options.vectorEnabled !== undefined) return parseBoolean(options.vectorEnabled, false);
  if (vectorConfig?.enabled !== undefined) return vectorConfig.enabled === true;
  return parseBoolean((options.env ?? process.env)?.SIGNALMAP_VECTOR_ENABLED, true);
}

function relatedStoryIsDuplicate(event, relatedStories, minScore) {
  for (const related of Array.isArray(relatedStories) ? relatedStories : []) {
    if (!related || typeof related !== 'object') continue;
    if (related.canonicalUrl && related.canonicalUrl === event.canonicalUrl) return true;
    if (related.title && hashSignalMapNewsTitle(related.title) === event.contentHash) return true;
    if (related.contentHash && related.contentHash === event.contentHash) return true;
    if (related.sourceTextHash && related.sourceTextHash === event.sourceTextHash) return true;
    if (Number.isFinite(Number(related.score)) && Number(related.score) >= minScore) return true;
  }
  return false;
}

function publicHealthSource(source) {
  return {
    name: source.name,
    feedUrl: source.feedUrl,
    sourceTier: source.sourceTier,
  };
}

function emptyDomainMetrics() {
  return {
    llm: { attempts: 0, parsed: 0, skipped: 0, unavailable: 0, failed: 0 },
    distill: { attempts: 0, distilled: 0, fallback: 0, failed: 0 },
    embeddings: { attempts: 0, embedded: 0, skipped: 0, failed: 0 },
    lancedb: { searches: 0, searchFailures: 0, upserts: 0, upserted: 0, upsertFailures: 0, prunes: 0, pruneFailures: 0 },
  };
}

function publicStatus(value, fallback = 'ok') {
  const status = cleanString(value);
  return status ? status.toLowerCase().replace(/[^a-z0-9_:-]+/g, '_').slice(0, 48) : fallback;
}

function publicErrorClass(value) {
  const cleaned = cleanString(value);
  return cleaned ? cleaned.replace(/[^A-Za-z0-9_:-]+/g, '_').slice(0, 96) : undefined;
}

function normalizeLanceDbHealth(health, config) {
  const status = publicStatus(health?.status, config?.enabled === false ? 'disabled' : 'degraded');
  return {
    status,
    enabled: health?.enabled !== false,
    disabled: health?.disabled === true || status === 'disabled',
    open: health?.open === true,
    writable: health?.writable === true,
    tableName: cleanString(health?.tableName) ?? cleanString(config?.tableName),
    recordCount: Number.isFinite(Number(health?.recordCount)) ? Number(health.recordCount) : null,
    uriConfigured: health?.uriConfigured === true || Boolean(config?.uri),
    lastVectorErrorClass: publicErrorClass(health?.lastVectorErrorClass ?? health?.errorClass) ?? null,
    ...(publicErrorClass(health?.errorClass) ? { errorClass: publicErrorClass(health.errorClass) } : {}),
    ...(health?.pendingCreate === true ? { pendingCreate: true } : {}),
  };
}

function healthStateFor(status) {
  const normalized = publicStatus(status, 'ok');
  if (['ok', 'ready', 'disabled'].includes(normalized)) return 'ok';
  return 'error';
}

function buildSignalMapHealthDomainMeta(domain, payload, fetchedAt) {
  const recordCount = Number.isFinite(Number(payload?.recordCount)) ? Number(payload.recordCount) : 0;
  return {
    fetchedAt: Date.parse(fetchedAt),
    recordCount,
    sourceVersion: 'signalmap-health-v1',
    domain,
    status: healthStateFor(payload?.status),
  };
}

function buildSignalMapHealthDomains({
  fetchedAt,
  config,
  events,
  healthSources,
  diagnostics,
  metrics,
  vectorHealth,
  durationMs,
}) {
  const llmStatus = metrics.llm.unavailable > 0
    ? 'unavailable'
    : metrics.llm.failed > 0 || metrics.llm.skipped > 0
      ? 'degraded'
      : 'ok';
  const distillStatus = metrics.distill.failed > 0 || metrics.distill.fallback > 0 ? 'degraded' : 'ok';
  const lancedb = normalizeLanceDbHealth(vectorHealth, config.vectorConfig);
  const embeddingsStatus = !config.vectorEnabled || lancedb.disabled
    ? 'disabled'
    : metrics.embeddings.failed > 0 || metrics.embeddings.skipped > 0
      ? 'degraded'
      : 'ok';

  return {
    news: {
      domain: 'news',
      status: diagnostics.some((item) => item.stage === 'rss') ? 'degraded' : 'ok',
      fetchedAt,
      recordCount: events.length,
      sourceCount: healthSources.length,
      durationMs,
    },
    llm: {
      domain: 'llm',
      status: llmStatus,
      fetchedAt,
      recordCount: metrics.llm.parsed,
      metrics: { ...metrics.llm },
      diagnostics: diagnostics
        .filter((item) => item.stage === 'llm')
        .map((item) => ({
          reason: publicStatus(item.reason, 'unknown'),
          status: publicStatus(item.status, 'failed'),
        })),
    },
    distill: {
      domain: 'distill',
      status: distillStatus,
      fetchedAt,
      recordCount: metrics.distill.distilled,
      metrics: { ...metrics.distill },
      diagnostics: diagnostics
        .filter((item) => item.stage === 'extract')
        .map((item) => ({ reason: publicStatus(item.reason, 'fallback') })),
    },
    lancedb: {
      domain: 'lancedb',
      fetchedAt,
      ...lancedb,
      metrics: { ...metrics.lancedb },
    },
    embeddings: {
      domain: 'embeddings',
      status: embeddingsStatus,
      fetchedAt,
      recordCount: metrics.embeddings.embedded,
      model: cleanString(config.vectorConfig.embeddingModel),
      embeddingDim: config.vectorConfig.embeddingDim,
      metrics: { ...metrics.embeddings },
    },
  };
}

function buildSignalMapHealthDomainWrites(domains, fetchedAt) {
  const writes = {};
  for (const domain of SIGNALMAP_COLLECTOR_HEALTH_DOMAINS) {
    const keys = SIGNALMAP_HEALTH_DOMAIN_KEYS[domain];
    const data = domains[domain];
    writes[domain] = {
      cacheKey: keys.cacheKey,
      metaKey: keys.metaKey,
      data,
      meta: buildSignalMapHealthDomainMeta(domain, data, fetchedAt),
    };
  }
  return writes;
}

export function resolveSignalMapNewsCollectorConfig(options = {}) {
  const env = options.env ?? process.env;
  const fullExtractionDomains = Array.isArray(options.fullExtractionDomains)
    ? options.fullExtractionDomains
    : DEFAULT_SIGNALMAP_FULL_EXTRACTION_DOMAINS;
  const vectorConfig = resolveSignalMapVectorStoreConfig(env);

  return {
    cacheKey: SIGNALMAP_NEWS_CACHE_KEY,
    metaKey: SIGNALMAP_NEWS_META_KEY,
    pollMinutes: parsePositiveInteger(
      options.pollMinutes ?? env?.SIGNALMAP_RSS_POLL_MINUTES,
      DEFAULT_SIGNALMAP_RSS_POLL_MINUTES,
    ),
    ttlSeconds: parsePositiveInteger(
      options.ttlSeconds ?? env?.SIGNALMAP_NEWS_TTL_SECONDS,
      DEFAULT_SIGNALMAP_NEWS_TTL_SECONDS,
    ),
    metaTtlSeconds: parsePositiveInteger(
      options.metaTtlSeconds ?? env?.SIGNALMAP_NEWS_META_TTL_SECONDS,
      DEFAULT_SIGNALMAP_NEWS_META_TTL_SECONDS,
    ),
    fullExtractionDomains: fullExtractionDomains.map(normalizeHostname),
    locationConfidenceMin: parseConfidence(
      options.locationConfidenceMin ?? env?.SIGNALMAP_LOCATION_CONFIDENCE_MIN,
      DEFAULT_SIGNALMAP_LOCATION_CONFIDENCE_MIN,
    ),
    vectorEnabled: vectorEnabledFrom(options, vectorConfig),
    vectorConfig,
  };
}

export function loadSignalMapNewsSources(options = {}) {
  const sourceTiers = options.sourceTiers ?? loadSharedConfig('source-tiers.json');
  const feeds = options.feeds ? flattenFeeds(options.feeds) : DEFAULT_SIGNALMAP_NEWS_SOURCES;
  const seen = new Set();
  const sources = [];

  for (const feed of feeds) {
    const source = normalizeSource(feed, sourceTiers);
    if (!source || seen.has(source.feedUrl)) continue;
    seen.add(source.feedUrl);
    sources.push(source);
  }

  return sources;
}

export function shouldFullExtractSignalMapUrl(url, options = {}) {
  const domains = (options.fullExtractionDomains ?? DEFAULT_SIGNALMAP_FULL_EXTRACTION_DOMAINS)
    .map(normalizeHostname);
  try {
    const hostname = normalizeHostname(new URL(url).hostname);
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function canonicalizeSignalMapNewsUrl(url) {
  const cleaned = cleanString(url);
  if (!cleaned) return '';
  try {
    const parsed = new URL(cleaned);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_QUERY_PARAM_RE.test(key)) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    let output = parsed.toString();
    if (parsed.pathname !== '/' && output.endsWith('/')) output = output.slice(0, -1);
    return output;
  } catch {
    return cleaned;
  }
}

export function hashSignalMapNewsTitle(title) {
  return hashValue(compactWhitespace(title).toLowerCase(), 24);
}

export function makeSignalMapStoryEventId(canonicalUrl, canonicalTitle) {
  return `signalmap-story-${hashValue(`${canonicalUrl}\n${compactWhitespace(canonicalTitle).toLowerCase()}`, 24)}`;
}

function hostnameFromUrl(url) {
  try {
    return normalizeHostname(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

function sourceIdSlug(value) {
  const slug = compactWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'source';
}

function makeSignalMapSourceId({ label, feedUrl, url }) {
  const stableBasis = [label, feedUrl ?? url].filter(Boolean).join('\n') || 'unknown-source';
  return `source-${sourceIdSlug(label)}-${hashValue(stableBasis, 12)}`;
}

export function parseSignalMapRssItems(xmlText, source) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    cdataPropName: '#text',
    trimValues: true,
  });
  const parsed = parser.parse(String(xmlText ?? ''));
  const channel = parsed?.rss?.channel ?? parsed?.RDF?.channel;
  const atomEntries = parsed?.feed?.entry;
  const rawItems = toArray(channel?.item ?? parsed?.rss?.item ?? atomEntries);
  const sourceName = cleanString(source?.sourceName) ?? cleanString(source?.name) ?? 'Unknown Source';
  const feedUrl = cleanString(source?.feedUrl) ?? cleanString(source?.url);

  return rawItems
    .map((item) => {
      const url = readRssLink(item);
      const title = stripHtml(readXmlText(item?.title));
      if (!url || !title) return null;
      const snippet = stripHtml(
        readXmlText(item?.description) ??
          readXmlText(item?.summary) ??
          readXmlText(item?.['content:encoded']) ??
          '',
      );
      const publishedAt =
        readDate(readXmlText(item?.pubDate)) ??
        readDate(readXmlText(item?.published)) ??
        readDate(readXmlText(item?.updated));

      return {
        url,
        canonicalUrl: canonicalizeSignalMapNewsUrl(url),
        title,
        canonicalTitle: title,
        snippet,
        ...(publishedAt ? { publishedAt } : {}),
        sourceName,
        feedUrl,
        sourceTier: Number.isInteger(source?.sourceTier)
          ? source.sourceTier
          : sourceTierFor(sourceName, source?.sourceTiers ?? loadSharedConfig('source-tiers.json')),
      };
    })
    .filter(Boolean);
}

export function createSignalMapStoryEvent({
  article,
  parsedEvent,
  locations,
  source,
  now,
  relatedStories,
}) {
  const observedAt = new Date(now ?? Date.now()).toISOString();
  const canonicalUrl = canonicalizeSignalMapNewsUrl(article?.canonicalUrl ?? article?.url);
  const canonicalTitle =
    cleanString(parsedEvent?.canonicalTitle) ?? cleanString(article?.title) ?? canonicalUrl;
  const publishedAt =
    readDate(article?.publishedAt) ?? readDate(parsedEvent?.eventTime) ?? observedAt;
  const sourceName =
    cleanString(article?.sourceName) ??
    cleanString(source?.sourceName) ??
    cleanString(source?.name) ??
    hostnameFromUrl(source?.feedUrl) ??
    hostnameFromUrl(canonicalUrl) ??
    'Unknown Source';
  const confidence = Number.isFinite(Number(parsedEvent?.confidence))
    ? Number(parsedEvent.confidence)
    : 0;
  const confidenceMin = parseConfidence(
    source?.locationConfidenceMin,
    DEFAULT_SIGNALMAP_LOCATION_CONFIDENCE_MIN,
  );
  const normalizedLocations = Array.isArray(locations) ? locations : [];
  const markerEligible =
    confidence >= confidenceMin &&
    normalizedLocations.some((location) => location?.markerEligible === true);
  const id = makeSignalMapStoryEventId(canonicalUrl, canonicalTitle);
  const summary = cleanString(parsedEvent?.summary) ?? cleanString(article?.dek) ?? cleanString(article?.summary) ?? '';
  const title = canonicalTitle;
  const sourceTier =
    Number.isInteger(Number(source?.sourceTier)) && Number(source.sourceTier) > 0
      ? Number(source.sourceTier)
      : DEFAULT_SOURCE_TIER;
  const sourceFeedUrl = cleanString(source?.feedUrl);
  const sourceTextHash = hashValue([
    article?.title,
    article?.dek,
    article?.summary,
    article?.snippet,
    article?.articleBody,
    article?.body,
    article?.content,
  ].filter(Boolean).join('\n'));
  const contentHash = hashSignalMapNewsTitle(canonicalTitle);

  return {
    id,
    eventId: id,
    category: cleanString(parsedEvent?.category) ?? 'technology',
    severity: cleanString(parsedEvent?.severity) ?? 'info',
    title,
    canonicalTitle,
    summary,
    tags: uniqueStrings(parsedEvent?.tags),
    startedAt: readDate(parsedEvent?.eventTime) ?? publishedAt,
    lastObservedAt: observedAt,
    locations: normalizedLocations,
    sources: [
      {
        id: makeSignalMapSourceId({ label: sourceName, feedUrl: sourceFeedUrl, url: canonicalUrl }),
        label: sourceName,
        name: sourceName,
        url: canonicalUrl,
        feedUrl: sourceFeedUrl,
        tier: sourceTier,
        fetchedAt: observedAt,
        publishedAt,
      },
    ],
    confidence,
    kind: 'story',
    watchlistMatch: false,
    markerEligible,
    canonicalUrl,
    sourceName,
    publishedAt,
    contentHash,
    sourceTextHash,
    ...(Array.isArray(relatedStories) && relatedStories.length > 0 ? { relatedStories } : {}),
  };
}

export async function collectSignalMapNews(options = {}) {
  const startedAt = Date.now();
  const now = options.now ?? new Date().toISOString();
  const config = resolveSignalMapNewsCollectorConfig(options);
  const loadSourcesImpl = options.loadSourcesImpl ?? loadSignalMapNewsSources;
  const fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  const extractArticleImpl = options.extractArticleImpl ?? extractSignalMapArticleWithDistill;
  const parseArticleImpl = options.parseArticleImpl ?? parseSignalMapArticleWithOpenRouter;
  const resolveLocationsImpl = options.resolveLocationsImpl ?? resolveSignalMapLocations;
  const embedStoryImpl = options.embedStoryImpl ?? embedSignalMapStory;
  const openVectorStoreImpl = options.openVectorStoreImpl ?? openVectorStore;
  const findRelatedStoriesImpl = options.findRelatedStoriesImpl ?? findRelatedStories;
  const upsertStoryVectorImpl = options.upsertStoryVectorImpl ?? upsertStoryVector;
  const pruneOldVectorsImpl = options.pruneOldVectorsImpl ?? pruneOldVectors;
  const getVectorStoreHealthImpl = options.getVectorStoreHealthImpl ?? getVectorStoreHealth;
  const publishImpl =
    options.publishImpl ??
    ((payload, publishOptions) => redisRestPublish(payload, { ...publishOptions, fetchImpl, env: options.env }));
  const sourceTiers = options.sourceTiers ?? loadSharedConfig('source-tiers.json');
  const sources = await loadSourcesImpl({ ...options, sourceTiers });
  const items = [];
  const events = [];
  const diagnostics = [];
  const sourceHealth = new Map();
  const domainMetrics = emptyDomainMetrics();
  const seenCanonicalUrls = new Set();
  const seenTitleHashes = new Set();
  const vectorEnabled = config.vectorEnabled;
  let vectorStore;
  let vectorHealth = normalizeLanceDbHealth(
    { status: vectorEnabled ? 'degraded' : 'disabled', enabled: vectorEnabled },
    config.vectorConfig,
  );

  const markSource = (source, update) => {
    const key = source?.name ?? source?.sourceName ?? 'Unknown Source';
    const current = sourceHealth.get(key) ?? {
      ...publicHealthSource(source),
      fetched: 0,
      parsed: 0,
      accepted: 0,
      skipped: 0,
      errors: 0,
    };
    sourceHealth.set(key, { ...current, ...update(current) });
  };

  if (vectorEnabled) {
    try {
      vectorStore = await openVectorStoreImpl({ env: options.env });
      vectorHealth = normalizeLanceDbHealth(
        await getVectorStoreHealthImpl(vectorStore),
        config.vectorConfig,
      );
    } catch (error) {
      vectorHealth = normalizeLanceDbHealth({
        status: 'degraded',
        enabled: true,
        open: false,
        writable: false,
        tableName: config.vectorConfig.tableName,
        recordCount: null,
        errorClass: error?.name ?? 'SignalMapVectorOpenError',
        lastVectorErrorClass: error?.name ?? 'SignalMapVectorOpenError',
      }, config.vectorConfig);
    }
  }

  for (const source of sources) {
    markSource(source, (current) => current);
    try {
      const response = await fetchImpl(source.feedUrl, {
        headers: {
          'User-Agent': CHROME_UA,
          Accept: RSS_ACCEPT_HEADER,
        },
      });
      if (!response?.ok) {
        const status = response?.status ?? 0;
        markSource(source, (current) => ({
          errors: current.errors + 1,
          lastError: `rss_http_${status}`,
        }));
        diagnostics.push({ sourceName: source.name, stage: 'rss', reason: 'http_error', status });
        continue;
      }
      const xmlText = await response.text();
      const parsedItems = parseSignalMapRssItems(xmlText, source);
      items.push(...parsedItems);
      markSource(source, (current) => ({ fetched: current.fetched + parsedItems.length }));
    } catch (error) {
      markSource(source, (current) => ({
        errors: current.errors + 1,
        lastError: error?.name ?? 'rss_fetch_error',
      }));
      diagnostics.push({
        sourceName: source.name,
        stage: 'rss',
        reason: 'fetch_error',
        errorClass: error?.name ?? 'SignalMapRssFetchError',
      });
    }
  }

  for (const item of items) {
    const source = sources.find((candidate) => candidate.name === item.sourceName) ?? {
      name: item.sourceName,
      feedUrl: item.feedUrl,
      sourceTier: item.sourceTier,
    };
    const canonicalUrl = canonicalizeSignalMapNewsUrl(item.canonicalUrl ?? item.url);
    const titleHash = hashSignalMapNewsTitle(item.title);
    if (seenCanonicalUrls.has(canonicalUrl)) {
      markSource(source, (current) => ({ skipped: current.skipped + 1 }));
      diagnostics.push({ sourceName: item.sourceName, stage: 'dedupe', reason: 'duplicate_url' });
      continue;
    }
    seenCanonicalUrls.add(canonicalUrl);

    if (seenTitleHashes.has(titleHash)) {
      markSource(source, (current) => ({ skipped: current.skipped + 1 }));
      diagnostics.push({ sourceName: item.sourceName, stage: 'dedupe', reason: 'duplicate_title' });
      continue;
    }
    seenTitleHashes.add(titleHash);

    const shouldExtract = shouldFullExtractSignalMapUrl(canonicalUrl, config);
    let article;
    if (shouldExtract) {
      domainMetrics.distill.attempts += 1;
      const extracted = await extractArticleImpl(item, options.extractOptions ?? options);
      article = {
        ...item,
        ...(extracted?.article ?? {}),
        canonicalUrl: canonicalizeSignalMapNewsUrl(extracted?.article?.canonicalUrl ?? canonicalUrl),
        sourceName: item.sourceName,
        publishedAt: extracted?.article?.publishedAt ?? item.publishedAt,
      };
      if (extracted?.status === 'fallback') {
        const reason = extracted.fallbackReason ?? 'fallback';
        domainMetrics.distill.fallback += 1;
        markSource(source, () => ({
          status: 'degraded',
          distillDegraded: true,
          lastDistillReason: reason,
        }));
        diagnostics.push({
          sourceName: item.sourceName,
          stage: 'extract',
          reason,
        });
      } else if (extracted?.status === 'distilled') {
        domainMetrics.distill.distilled += 1;
      } else {
        domainMetrics.distill.failed += 1;
      }
    } else {
      article = {
        title: item.title,
        summary: item.snippet,
        snippet: item.snippet,
        canonicalUrl,
        sourceName: item.sourceName,
        publishedAt: item.publishedAt,
      };
    }

    domainMetrics.llm.attempts += 1;
    const parsed = await parseArticleImpl(article, options.parseOptions ?? options);
    if (parsed?.status !== 'parsed') {
      domainMetrics.llm.skipped += 1;
      if (parsed?.reason === 'missing_api_key' || parsed?.reason === 'no_allowed_models') {
        domainMetrics.llm.unavailable += 1;
      } else {
        domainMetrics.llm.failed += 1;
      }
      markSource(source, (current) => ({
        skipped: current.skipped + 1,
        llmUnavailable:
          parsed?.reason === 'missing_api_key' || parsed?.reason === 'no_allowed_models'
            ? true
            : current.llmUnavailable,
        lastLlmStatus: parsed?.status ?? 'failed',
        lastLlmReason: parsed?.reason ?? 'parse_failed',
      }));
      diagnostics.push({
        sourceName: item.sourceName,
        stage: 'llm',
        reason: parsed?.reason ?? 'parse_failed',
        status: parsed?.status ?? 'failed',
      });
      continue;
    }
    domainMetrics.llm.parsed += 1;
    markSource(source, (current) => ({ parsed: current.parsed + 1 }));

    const locations = await resolveLocationsImpl(parsed.event.locations, {
      ...options.geocodeOptions,
      confidenceMin: config.locationConfidenceMin,
    });
    const event = createSignalMapStoryEvent({
      article,
      parsedEvent: parsed.event,
      locations,
      source: {
        ...source,
        locationConfidenceMin: config.locationConfidenceMin,
      },
      now,
    });

    let vector;
    let relatedStories = [];
    if (vectorEnabled) {
      try {
        domainMetrics.embeddings.attempts += 1;
        const embedded = await embedStoryImpl(event, options.embeddingOptions ?? options);
        if (embedded?.status === 'embedded') {
          domainMetrics.embeddings.embedded += 1;
          vector = embedded.vector;
          event.embeddingModel = embedded.embeddingModel;
          event.embeddingDim = embedded.embeddingDim;
          domainMetrics.lancedb.searches += 1;
          relatedStories = await findRelatedStoriesImpl(vectorStore, vector, {
            env: options.env,
            minScore: config.vectorConfig.minScore,
            topK: config.vectorConfig.topK,
          });
          if (relatedStoryIsDuplicate(event, relatedStories, config.vectorConfig.minScore)) {
            markSource(source, (current) => ({ skipped: current.skipped + 1 }));
            diagnostics.push({ sourceName: item.sourceName, stage: 'vector', reason: 'semantic_duplicate' });
            continue;
          }
          if (relatedStories.length > 0) event.relatedStories = relatedStories;
        } else {
          domainMetrics.embeddings.skipped += 1;
          diagnostics.push({
            sourceName: item.sourceName,
            stage: 'vector',
            reason: embedded?.reason ?? 'embedding_failed',
            errorClass: embedded?.errorClass,
          });
        }
      } catch (error) {
        if (vector) {
          domainMetrics.lancedb.searchFailures += 1;
        } else {
          domainMetrics.embeddings.failed += 1;
        }
        diagnostics.push({
          sourceName: item.sourceName,
          stage: 'vector',
          reason: 'vector_lookup_error',
          errorClass: error?.name ?? 'SignalMapVectorLookupError',
        });
      }
    }

    events.push(event);
    markSource(source, (current) => ({ accepted: current.accepted + 1 }));

    if (vectorEnabled && vector) {
      try {
        domainMetrics.lancedb.upserts += 1;
        const upserted = await upsertStoryVectorImpl(vectorStore, event, vector, {
          env: options.env,
          embeddingModel: event.embeddingModel,
          embeddingDim: event.embeddingDim,
        });
        if (upserted?.status === 'failed') {
          domainMetrics.lancedb.upsertFailures += 1;
          diagnostics.push({
            sourceName: item.sourceName,
            stage: 'vector',
            reason: upserted.reason ?? 'vector_upsert_failed',
            errorClass: upserted.errorClass,
          });
        } else if (upserted?.status === 'upserted') {
          domainMetrics.lancedb.upserted += 1;
        }
      } catch (error) {
        domainMetrics.lancedb.upsertFailures += 1;
        diagnostics.push({
          sourceName: item.sourceName,
          stage: 'vector',
          reason: 'vector_upsert_error',
          errorClass: error?.name ?? 'SignalMapVectorUpsertError',
        });
      }
    }
  }

  if (vectorEnabled) {
    try {
      domainMetrics.lancedb.prunes += 1;
      await pruneOldVectorsImpl(vectorStore, { env: options.env, now });
    } catch (error) {
      domainMetrics.lancedb.pruneFailures += 1;
      diagnostics.push({
        stage: 'vector',
        reason: 'vector_prune_error',
        errorClass: error?.name ?? 'SignalMapVectorPruneError',
      });
    }
    try {
      vectorHealth = normalizeLanceDbHealth(
        await getVectorStoreHealthImpl(vectorStore),
        config.vectorConfig,
      );
    } catch {
      vectorHealth = normalizeLanceDbHealth({ ...vectorHealth, status: 'degraded' }, config.vectorConfig);
    }
  }

  const fetchedAt = new Date(now).toISOString();
  const healthSources = [...sourceHealth.values()];
  const healthDegraded =
    diagnostics.some((item) => item.stage === 'rss' && item.reason !== 'http_error') ||
    healthSources.some((source) => source.distillDegraded === true);
  const durationMs = Date.now() - startedAt;
  const signalMapHealthDomains = buildSignalMapHealthDomains({
    fetchedAt,
    config,
    events,
    healthSources,
    diagnostics,
    metrics: domainMetrics,
    vectorHealth,
    durationMs,
  });
  const domainDegraded = Object.values(signalMapHealthDomains)
    .some((domain) => !['ok', 'ready', 'disabled'].includes(publicStatus(domain.status, 'ok')));
  const data = {
    fetchedAt,
    pollMinutes: config.pollMinutes,
    events,
    health: {
      status: healthDegraded || domainDegraded ? 'degraded' : 'ok',
      sources: healthSources,
      vector: signalMapHealthDomains.lancedb,
      domains: signalMapHealthDomains,
      llmUnavailable: healthSources.some((source) => source.llmUnavailable === true),
      diagnostics,
      durationMs,
    },
  };
  const meta = {
    fetchedAt: Date.parse(fetchedAt),
    recordCount: events.length,
    sourceVersion: 'signalmap-news-collector-v1',
    pollMinutes: config.pollMinutes,
  };
  const healthDomainWrites = buildSignalMapHealthDomainWrites(signalMapHealthDomains, fetchedAt);
  let publishResult;
  try {
    publishResult = await publishImpl(
      {
        data,
        meta,
        healthDomains: healthDomainWrites,
        keys: [
          SIGNALMAP_NEWS_CACHE_KEY,
          SIGNALMAP_NEWS_META_KEY,
          ...Object.values(healthDomainWrites).flatMap((domain) => [domain.cacheKey, domain.metaKey]),
        ],
      },
      {
        cacheKey: SIGNALMAP_NEWS_CACHE_KEY,
        metaKey: SIGNALMAP_NEWS_META_KEY,
        ttlSeconds: config.ttlSeconds,
        metaTtlSeconds: config.metaTtlSeconds,
        env: options.env,
      },
    );
  } catch (error) {
    publishResult = {
      status: 'failed',
      reason: 'publish_error',
      errorClass: error?.name ?? 'SignalMapPublishError',
    };
  }

  return {
    status: publishResult?.status === 'failed' ? 'degraded' : 'ok',
    events,
    data,
    meta,
    health: data.health,
    publish: publishResult,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  collectSignalMapNews()
    .then((result) => {
      console.log(JSON.stringify({
        status: result.status,
        recordCount: result.events.length,
        publish: result.publish?.status,
      }));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
