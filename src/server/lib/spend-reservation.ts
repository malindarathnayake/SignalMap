import type { RedisAdapter } from './redis.types.ts';

export function getSpendKey(date?: Date): string {
  const d = date ?? new Date();
  const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
  return `signalmap:llm:spend:${iso}`;
}

export function getResetAt(date?: Date): string {
  const d = date ?? new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return next.toISOString();
}

export interface ReserveOk {
  ok: true;
  reservedUsd: number;
  runningTotalUsd: number;
}

export interface ReserveBudgetExhausted {
  ok: false;
  reason: 'budget_exhausted';
  runningTotalUsd: number;
  budgetUsd: number;
  resetsAt: string;
}

export type ReserveResult = ReserveOk | ReserveBudgetExhausted;

export async function reserveSpend(
  redis: RedisAdapter,
  estCostUsd: number,
  budgetUsd: number,
  opts?: { date?: Date },
): Promise<ReserveResult> {
  if (estCostUsd < 0) throw new Error('reserveSpend: estCostUsd must be >= 0');
  if (budgetUsd <= 0) throw new Error('reserveSpend: budgetUsd must be > 0');

  const spendKey = getSpendKey(opts?.date);
  const resetsAt = getResetAt(opts?.date);

  const newTotal = await redis.incrByFloat(spendKey, estCostUsd);

  // Arm a 7-day TTL on first-write so historical spend keys auto-prune.
  // newTotal === estCostUsd means the key was just created (was 0 before).
  if (Math.abs(newTotal - estCostUsd) < 1e-9) {
    await redis.expire(spendKey, 7 * 86400);
  }

  if (newTotal > budgetUsd) {
    await redis.incrByFloat(spendKey, -estCostUsd);
    return {
      ok: false,
      reason: 'budget_exhausted',
      runningTotalUsd: newTotal - estCostUsd,
      budgetUsd,
      resetsAt,
    };
  }

  return { ok: true, reservedUsd: estCostUsd, runningTotalUsd: newTotal };
}

export async function refundDifference(
  redis: RedisAdapter,
  estCostUsd: number,
  actualCostUsd: number,
  opts?: { date?: Date },
): Promise<number> {
  const spendKey = getSpendKey(opts?.date);
  const delta = actualCostUsd - estCostUsd;
  return redis.incrByFloat(spendKey, delta);
}

export async function readDailySpend(
  redis: RedisAdapter,
  opts?: { date?: Date },
): Promise<number> {
  const spendKey = getSpendKey(opts?.date);
  return redis.incrByFloat(spendKey, 0);
}
