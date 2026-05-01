import {
  DEFAULT_SIGNALMAP_LANCEDB_URI,
  DEFAULT_SIGNALMAP_VECTOR_TABLE,
  DEFAULT_SIGNALMAP_VECTOR_RETENTION_DAYS,
  DEFAULT_SIGNALMAP_VECTOR_SEARCH_TIMEOUT_MS,
  DEFAULT_SIGNALMAP_VECTOR_TOP_K,
  DEFAULT_SIGNALMAP_VECTOR_MIN_SCORE,
  DEFAULT_SIGNALMAP_EMBEDDING_MODEL,
  DEFAULT_SIGNALMAP_EMBEDDING_DIM,
} from './legacy-scripts/lancedb-store';
import {
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_SIGNALMAP_LLM_TIMEOUT_MS,
} from './legacy-scripts/openrouter-parser';
import { DEFAULT_SIGNALMAP_DISTILL_TIMEOUT_MS } from './legacy-scripts/distill-bridge';
import {
  DEFAULT_SIGNALMAP_BRIEF_LOCAL_SIGNAL_LIMIT,
  DEFAULT_DOMAIN_ALLOWLIST,
} from '../workers/cron-impl';

function cleanString(value: any): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parsePositiveInteger(value: any, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseNonNegativeNumber(value: any, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBoolean(value: any, fallback: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) return false;
    return fallback;
}

function parseStringArray(value: any, fallback: string[]): string[] {
    if (typeof value !== 'string') return fallback;
    return value.split(',').map(s => s.trim()).filter(Boolean);
}


export interface SignalMapConfig {
  apiPort: number;
  backendMode: 'live' | 'fixture';
  llmModels: string[];
  dailyLlmBudgetUsd: number;
  briefEventEstCostUsd: number;
  briefPerEventRateLimitPerMin: number;
  rssPollMinutes: number;
  vectorEnabled: boolean;
  collectorLeaseTtlSec: number;
  dataDir: string;
  lancedbUri: string;
  newsItemsPerSource: number;
  distillRoot?: string;
  distillTimeoutMs: number;
  briefRefreshMinutes: number;
  cronLeaseTtlSec: number;
  port: number;
  adminToken?: string;
  embeddingModel: string;
  embeddingDim: number;
  vectorTable: string;
  vectorRetentionDays: number;
  vectorSearchTimeoutMs: number;
  vectorTopK: number;
  vectorMinScore: number;
  openrouterBaseUrl: string;
  llmTimeoutMs: number;
  briefLocalSignalLimit: number;
  newsDomainAllowlist: string[];
}

let config: SignalMapConfig;

export function loadConfig(): SignalMapConfig {
  if (config) {
    return config;
  }

  const loadedConfig: SignalMapConfig = {
    apiPort: parsePositiveInteger(process.env.SIGNALMAP_API_PORT, 3000),
    backendMode: (process.env.SIGNALMAP_BACKEND_MODE === 'fixture' ? 'fixture' : 'live'),
    llmModels: parseStringArray(process.env.SIGNALMAP_LLM_MODELS, []),
    dailyLlmBudgetUsd: parseNonNegativeNumber(process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD, 5.0),
    briefEventEstCostUsd: parseNonNegativeNumber(process.env.SIGNALMAP_BRIEF_EVENT_EST_COST_USD, 0.05),
    briefPerEventRateLimitPerMin: parsePositiveInteger(process.env.SIGNALMAP_BRIEF_PER_EVENT_RATE_LIMIT_PER_MIN, 20),
    rssPollMinutes: parsePositiveInteger(process.env.SIGNALMAP_RSS_POLL_MINUTES, 15),
    vectorEnabled: parseBoolean(process.env.SIGNALMAP_VECTOR_ENABLED, true),
    collectorLeaseTtlSec: parsePositiveInteger(process.env.SIGNALMAP_COLLECTOR_LEASE_TTL_SEC, 60),
    dataDir: cleanString(process.env.SIGNALMAP_DATA_DIR) ?? '/data/signalmap',
    lancedbUri: cleanString(process.env.SIGNALMAP_LANCEDB_URI) ?? DEFAULT_SIGNALMAP_LANCEDB_URI,
    newsItemsPerSource: parsePositiveInteger(process.env.SIGNALMAP_NEWS_ITEMS_PER_SOURCE, 5),
    distillRoot: cleanString(process.env.SIGNALMAP_DISTILL_ROOT),
    distillTimeoutMs: parsePositiveInteger(process.env.SIGNALMAP_DISTILL_TIMEOUT_MS, DEFAULT_SIGNALMAP_DISTILL_TIMEOUT_MS),
    briefRefreshMinutes: parsePositiveInteger(process.env.SIGNALMAP_BRIEF_REFRESH_MINUTES, 30),
    cronLeaseTtlSec: parsePositiveInteger(process.env.SIGNALMAP_CRON_LEASE_TTL_SEC, 60),
    port: parsePositiveInteger(process.env.SIGNALMAP_PORT, 8080),
    adminToken: cleanString(process.env.SIGNALMAP_ADMIN_TOKEN),
    embeddingModel: cleanString(process.env.SIGNALMAP_EMBEDDING_MODEL) ?? DEFAULT_SIGNALMAP_EMBEDDING_MODEL,
    embeddingDim: parsePositiveInteger(process.env.SIGNALMAP_EMBEDDING_DIM, DEFAULT_SIGNALMAP_EMBEDDING_DIM),
    vectorTable: cleanString(process.env.SIGNALMAP_VECTOR_TABLE) ?? DEFAULT_SIGNALMAP_VECTOR_TABLE,
    vectorRetentionDays: parsePositiveInteger(process.env.SIGNALMAP_VECTOR_RETENTION_DAYS, DEFAULT_SIGNALMAP_VECTOR_RETENTION_DAYS),
    vectorSearchTimeoutMs: parsePositiveInteger(process.env.SIGNALMAP_VECTOR_SEARCH_TIMEOUT_MS, DEFAULT_SIGNALMAP_VECTOR_SEARCH_TIMEOUT_MS),
    vectorTopK: parsePositiveInteger(process.env.SIGNALMAP_VECTOR_TOP_K, DEFAULT_SIGNALMAP_VECTOR_TOP_K),
    vectorMinScore: parseNonNegativeNumber(process.env.SIGNALMAP_VECTOR_MIN_SCORE, DEFAULT_SIGNALMAP_VECTOR_MIN_SCORE),
    openrouterBaseUrl: cleanString(process.env.OPENROUTER_BASE_URL) ?? DEFAULT_OPENROUTER_BASE_URL,
    llmTimeoutMs: parsePositiveInteger(process.env.SIGNALMAP_LLM_TIMEOUT_MS, DEFAULT_SIGNALMAP_LLM_TIMEOUT_MS),
    briefLocalSignalLimit: parsePositiveInteger(process.env.SIGNALMAP_BRIEF_LOCAL_SIGNAL_LIMIT, DEFAULT_SIGNALMAP_BRIEF_LOCAL_SIGNAL_LIMIT),
    newsDomainAllowlist: parseStringArray(process.env.SIGNALMAP_NEWS_DOMAIN_ALLOWLIST, DEFAULT_DOMAIN_ALLOWLIST),
  };
  
  config = Object.freeze(loadedConfig);
  return config;
}
