export interface ValidatedCitations {
  kept: string[];
  dropped: string[];
  degraded: boolean;
}

export function extractHost(urlString: string): string | null {
  try {
    const parsed = new URL(urlString);
    // Reject non-web protocols — javascript:/data:/file: parse with hostnames
    // but a downstream <a href> render would execute / leak local content.
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }
    return host;
  } catch {
    return null;
  }
}

export function validateCitations(
  citations: string[],
  allowlist: string[],
): ValidatedCitations {
  const lowerAllowlist = allowlist.map((e) => e.toLowerCase());

  const kept: string[] = [];
  const dropped: string[] = [];

  for (const citation of citations) {
    const host = extractHost(citation);
    if (
      host !== null &&
      lowerAllowlist.some(
        (entry) => host === entry || host.endsWith('.' + entry),
      )
    ) {
      kept.push(citation);
    } else {
      dropped.push(citation);
    }
  }

  const degraded = citations.length > 0 && kept.length === 0;

  return { kept, dropped, degraded };
}

export function validatePerplexityResponse(
  resp: { citations: string[] },
  allowlist: string[],
): ValidatedCitations {
  return validateCitations(resp.citations, allowlist);
}
