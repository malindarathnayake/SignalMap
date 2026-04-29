import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRedisAdapter } from '../../../src/server/lib/redis.js';
import type { BriefResult } from '../../../src/server/lib/brief-pipeline.js';
import { readDailySpend } from '../../../src/server/lib/spend-reservation.js';

const GLOBAL_BRIEF_KEY = 'signalmap:brief:global';

export async function handleSignalMapBriefHealth(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const redis = getRedisAdapter();

  const refreshMinutes = Number(process.env.SIGNALMAP_BRIEF_REFRESH_MINUTES ?? 30);
  const dailyBudgetUsd = Number(process.env.SIGNALMAP_DAILY_LLM_BUDGET_USD ?? 5.0);
  const modelInUse = process.env.SIGNALMAP_BRIEF_MODEL ?? 'anthropic/claude-sonnet-4.6';

  let brief: BriefResult | null = null;
  try {
    brief = await redis.getJson<BriefResult>(GLOBAL_BRIEF_KEY);
  } catch {
    // Redis unavailable — surface what we can with nulls
  }

  const lastGeneratedAt = brief?.generatedAt ?? null;
  let nextScheduledAt: string | null = null;
  if (lastGeneratedAt !== null) {
    const lastMs = new Date(lastGeneratedAt).getTime();
    nextScheduledAt = new Date(lastMs + refreshMinutes * 60 * 1000).toISOString();
  }

  let dailySpendUsd = 0;
  try {
    dailySpendUsd = await readDailySpend(redis);
  } catch {
    // Redis unavailable — report 0
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    lastGeneratedAt,
    nextScheduledAt,
    dailySpendUsd,
    dailyBudgetUsd,
    modelInUse,
  }));
}
