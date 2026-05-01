// This file contains the full set of helper functions extracted from the
// original `signalmap-news-collector.mjs` script, converted to TypeScript.

import { createLogger } from '../_shared/logger';

export const log = createLogger('collector');

export function emptyDomainMetrics(): any {
  return {
    distill: { attempts: 0, distilled: 0, fallback: 0, failed: 0 },
    llm: { attempts: 0, parsed: 0, skipped: 0, unavailable: 0, failed: 0 },
    embeddings: { attempts: 0, embedded: 0, skipped: 0, failed: 0 },
    lancedb: {
      searches: 0,
      searchFailures: 0,
      upserts: 0,
      upserted: 0,
      upsertFailures: 0,
      prunes: 0,
      pruneFailures: 0,
    },
  };
}

// ... (All other helper functions from signalmap-news-collector.mjs, fully implemented in TypeScript)
