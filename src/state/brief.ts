import { signal } from '@preact/signals';

export interface BriefSource { label: string; url: string }
export interface GlobalBrief {
  bullets: string[];
  sources: BriefSource[];
  generatedAt: string | null;
  model: string | null;
  warnings: string[];
  degraded: boolean;
}
export interface EventBrief {
  bullets: string[];
  sources: BriefSource[];
  generatedAt: string;
  model: string;
}

export const globalBrief = signal<GlobalBrief | null>(null);
export const globalBriefLoading = signal<boolean>(false);
export const globalBriefError = signal<string | null>(null);

export async function fetchGlobalBrief(opts?: { fetchImpl?: typeof fetch }): Promise<void> {
  const fetchFn = opts?.fetchImpl ?? globalThis.fetch;
  globalBriefLoading.value = true;
  globalBriefError.value = null;
  try {
    const res = await fetchFn('/api/signalmap/brief/global');
    if (!res.ok) {
      globalBriefError.value = `HTTP ${res.status}`;
      return;
    }
    const data = await res.json() as GlobalBrief;
    globalBrief.value = data;
  } catch (err) {
    globalBriefError.value = err instanceof Error ? err.message : String(err);
  } finally {
    globalBriefLoading.value = false;
  }
}

export function subscribeBriefUpdates(opts?: {
  eventSourceImpl?: typeof EventSource;
  url?: string;
  onUpdate?: () => void;
}): () => void {
  const ESImpl = opts?.eventSourceImpl ?? globalThis.EventSource;
  const url = opts?.url ?? '/api/signalmap/stream';
  const es = new ESImpl(url);

  const handler = () => {
    void fetchGlobalBrief();
    opts?.onUpdate?.();
  };

  es.addEventListener('brief-updated', handler);

  return () => {
    es.removeEventListener('brief-updated', handler);
    es.close();
  };
}
