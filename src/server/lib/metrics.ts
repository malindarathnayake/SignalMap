type Level = 'info' | 'warn' | 'error';

export function emitMetric(metric: string, value: number, ctx?: Record<string, unknown>, level: Level = 'info'): void {
  if (process.env.SIGNALMAP_METRICS_DISABLED === '1') return;
  const logLevel = process.env.LOG_LEVEL ?? 'info';
  const order: Record<Level, number> = { info: 0, warn: 1, error: 2 };
  if (order[level] < order[(logLevel as Level) ?? 'info']) return;
  const line = { level, time: Date.now(), metric, value, ...ctx };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}

export const METRICS = {
  BRIEF_CALLS: 'signalmap.brief.calls',
  BRIEF_CACHE_HITS: 'signalmap.brief.cache_hits',
  BRIEF_LOCK_CONTENTION: 'signalmap.brief.lock_contention',
  BRIEF_BUDGET_REFUSALS: 'signalmap.brief.budget_refusals',
  BRIEF_CITATIONS_DROPPED: 'signalmap.brief.citations_dropped',
  BRIEF_TOKENS_INPUT: 'signalmap.brief.tokens_input',
  BRIEF_TOKENS_OUTPUT: 'signalmap.brief.tokens_output',
  BRIEF_COST_USD: 'signalmap.brief.cost_usd',
} as const;
