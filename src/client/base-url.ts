/**
 * Pure normalization helper. Public so contract tests can verify behavior
 * without mocking import.meta.env.
 *
 *  - Preserves protocol scheme (`://` after http/https/ws/wss/etc) verbatim.
 *  - Collapses runs of internal `//` to a single `/` in the rest of the URL.
 *  - Strips exactly one trailing `/` if the result is longer than `/`.
 *  - Empty/whitespace input returns `""`.
 */
export function normalizeApiBaseUrl(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  const protoMatch = trimmed.match(/^([a-z][a-z0-9+.-]*:\/\/)(.*)$/i);
  const proto = protoMatch ? (protoMatch[1] ?? '') : '';
  const rest = protoMatch ? (protoMatch[2] ?? '') : trimmed;
  const collapsed = rest.replace(/\/{2,}/g, '/');
  const stripped =
    collapsed.length > 1 && collapsed.endsWith('/')
      ? collapsed.slice(0, -1)
      : collapsed;
  return proto + stripped;
}

/**
 * Canonical API base URL for the openapi-fetch client.
 *
 * Reads VITE_SIGNALMAP_API_BASE_URL from the Vite client environment.
 * Returns "" (browser-relative) when:
 *   - the env value is unset/empty/whitespace, OR
 *   - the env value is a path-only string (no `scheme://`).
 *     Path-only inputs are misconfigurations: an API base URL that is itself
 *     a `/api/...` path will compose with `/api/signalmap/...` to produce a
 *     doubled `/api/...api/...` URL. We reject silently and fall back to
 *     same-origin relative URLs.
 *
 * Absolute URLs (with scheme) are normalized via normalizeApiBaseUrl and returned.
 */
export function getApiBaseUrl(): string {
  return resolveApiBaseUrl(import.meta.env?.VITE_SIGNALMAP_API_BASE_URL);
}

/**
 * @internal Test-only helper. Same logic as getApiBaseUrl(), but takes the
 * env value as an explicit argument so contract tests can verify behavior
 * without mocking import.meta.env (which is undefined under tsx --test).
 */
export function resolveApiBaseUrl(envValue: string | undefined | null): string {
  const raw = (envValue ?? '').trim();
  if (!raw) return '';
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  if (!hasScheme) return '';
  return normalizeApiBaseUrl(raw);
}
