// Perplexity 400 if search_domain_filter exceeds 20 entries — verified by Phase-0 discovery probe.
const DOMAIN_CAP = 20;

export interface PerplexityRequest {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  searchDomainFilter: string[];
  searchRecencyFilter?: 'hour' | 'day' | 'week' | 'month' | 'year';
  searchContextSize?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  model?: string;
}

export interface PerplexityCitation {
  url: string;
}

export interface PerplexitySearchResult {
  title: string;
  url: string;
  date?: string;
}

export interface PerplexityUsageCost {
  input_tokens_cost: number;
  output_tokens_cost: number;
  request_cost: number;
  total_cost: number;
}

export interface PerplexityUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  search_context_size?: string;
  cost?: PerplexityUsageCost;
}

export interface PerplexityResponse {
  id: string;
  model: string;
  created: number;
  object: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    delta?: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: PerplexityUsage;
  citations: string[];
  search_results: Array<{ title?: string; url: string; date?: string }>;
}

export async function callPerplexity(
  req: PerplexityRequest,
  opts?: {
    apiKey?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  },
): Promise<PerplexityResponse> {
  if (req.searchDomainFilter.length > DOMAIN_CAP) {
    throw new Error(
      `search_domain_filter exceeds Perplexity 20-domain cap (got ${req.searchDomainFilter.length})`,
    );
  }

  const apiKey = opts?.apiKey ?? process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY is not set');
  }

  const baseUrl =
    opts?.baseUrl ?? process.env.PERPLEXITY_BASE_URL ?? 'https://api.perplexity.ai';
  const url = `${baseUrl}/chat/completions`;

  const model = req.model ?? process.env.PERPLEXITY_MODEL ?? 'sonar-pro';

  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    search_domain_filter: req.searchDomainFilter,
    search_context_size: req.searchContextSize ?? 'low',
    max_tokens: req.maxTokens ?? 500,
  };

  if (req.searchRecencyFilter !== undefined) {
    body['search_recency_filter'] = req.searchRecencyFilter;
  }

  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: opts?.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Perplexity API error ${response.status}: ${text.slice(0, 500)}`,
    );
  }

  return response.json() as Promise<PerplexityResponse>;
}
