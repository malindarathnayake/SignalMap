import { getRpcBaseUrl } from '@/services/rpc-client';
import {
  MarketServiceClient,
  type GetInsiderTransactionsResponse,
} from '@/generated/client/worldmonitor/market/v1/service_client';

const client = new MarketServiceClient(getRpcBaseUrl());

export type InsiderTransactionsResult = GetInsiderTransactionsResponse;

export async function fetchInsiderTransactions(symbol: string): Promise<InsiderTransactionsResult> {
  return client.getInsiderTransactions({ symbol });
}
