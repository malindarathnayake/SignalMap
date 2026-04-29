export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number;
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: OpenRouterUsage;
}

export async function chat(
  model: string,
  messages: OpenRouterMessage[],
  opts?: {
    apiKey?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    maxTokens?: number;
    temperature?: number;
    jsonMode?: boolean;
  },
): Promise<OpenRouterResponse> {
  const apiKey = opts?.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const baseUrl =
    opts?.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
  const url = `${baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: opts?.maxTokens ?? 1024,
    temperature: opts?.temperature ?? 0.2,
  };

  if (opts?.jsonMode === true) {
    body['response_format'] = { type: 'json_object' };
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
    throw new Error(`OpenRouter API error ${response.status}: ${text.slice(0, 500)}`);
  }

  return response.json() as Promise<OpenRouterResponse>;
}
