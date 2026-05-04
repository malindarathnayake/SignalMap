import { ErrorNotFoundError, FetchTimeoutError, NetworkError } from './errors.js';
function extractErrorCode(url) {
    try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
        return segments[segments.length - 1] ?? url;
    }
    catch {
        return url;
    }
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export function createFetcher(config) {
    const timeout = config.timeout ?? 10000;
    const debug = config.debug ?? false;
    async function get(url) {
        const maxRetries = 3;
        let attempt = 0;
        while (true) {
            const start = Date.now();
            let response;
            try {
                response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 SignalMapDistill/1.0',
                        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    },
                    signal: AbortSignal.timeout(timeout),
                });
            }
            catch (err) {
                if (err instanceof DOMException && err.name === 'TimeoutError') {
                    throw new FetchTimeoutError(url, timeout);
                }
                if (err instanceof TypeError) {
                    throw new NetworkError(url, err);
                }
                throw new NetworkError(url, err instanceof Error ? err : undefined);
            }
            if (debug) {
                const elapsed = Date.now() - start;
                console.log(`[fetcher] ${url} ${response.status} ${elapsed}ms`);
            }
            if (response.status === 404) {
                const errorCode = extractErrorCode(url);
                throw new ErrorNotFoundError(errorCode, url);
            }
            if (response.status === 429) {
                if (attempt < maxRetries) {
                    const waitMs = 1000 * Math.pow(2, attempt);
                    attempt++;
                    await delay(waitMs);
                    continue;
                }
                throw new NetworkError(url);
            }
            if (response.ok) {
                return response.text();
            }
            throw new NetworkError(url);
        }
    }
    async function getBatch(urls, rateMs = 100) {
        const results = [];
        for (let i = 0; i < urls.length; i++) {
            if (i > 0) {
                await delay(rateMs);
            }
            results.push(await get(urls[i]));
        }
        return results;
    }
    return { get, getBatch };
}
//# sourceMappingURL=fetcher.js.map
