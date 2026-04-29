import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const originalEnv = {
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  WORLDMONITOR_VALID_KEYS: process.env.WORLDMONITOR_VALID_KEYS,
};

function readProjectFile(path) {
  return readFileSync(join(root, path), 'utf-8');
}

function listProjectFiles(relativeDir, extensions, files = []) {
  const dir = join(root, relativeDir);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      listProjectFiles(relativePath, extensions, files);
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(relativePath);
    }
  }
  return files;
}

function assertSourceFilesDoNotContain(files, forbidden, description) {
  for (const file of files) {
    const src = readProjectFile(file);
    for (const item of forbidden) {
      if (item instanceof RegExp) {
        assert.doesNotMatch(src, item, `${file} still contains ${description}: ${item}`);
      } else {
        assert.ok(!src.includes(item), `${file} still contains ${description}: ${item}`);
      }
    }
  }
}

function extractBody(source, signatureNeedle) {
  const signatureIndex = source.indexOf(signatureNeedle);
  assert.notEqual(signatureIndex, -1, `Missing signature: ${signatureNeedle}`);

  const bodyStart = source.indexOf('{', signatureIndex);
  assert.notEqual(bodyStart, -1, `Missing body start: ${signatureNeedle}`);

  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    const char = source[i];
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (depth === 0) return source.slice(bodyStart + 1, i);
  }

  assert.fail(`Missing body end: ${signatureNeedle}`);
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

function disableExternalState() {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.WORLDMONITOR_VALID_KEYS;
}

function sameOriginRequest(url, init = {}) {
  return new Request(url, {
    ...init,
    headers: {
      'Sec-Fetch-Site': 'same-origin',
      ...init.headers,
    },
  });
}

beforeEach(() => {
  disableExternalState();
});

afterEach(() => {
  restoreEnv();
});

describe('SignalMap public access behavior', () => {
  it('allows public bootstrap from same-origin Fetch Metadata without an API key', async () => {
    const { default: bootstrapHandler } = await import('../api/bootstrap.js');

    const res = await bootstrapHandler(sameOriginRequest('https://worldmonitor.app/api/bootstrap?keys=earthquakes'));

    assert.notEqual(res.status, 401);
    assert.equal(res.status, 200);
  });

  it('allows RSS same-origin Fetch Metadata without an API key through to normal validation', async () => {
    const { default: rssProxyHandler } = await import('../api/rss-proxy.js');

    const res = await rssProxyHandler(sameOriginRequest('https://worldmonitor.app/api/rss-proxy'));
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.equal(body.error, 'Missing url parameter');
  });

  it('allows public gateway routes from same-origin Fetch Metadata without an API key', async () => {
    const { createDomainGateway } = await import('../server/gateway.ts');
    const handler = createDomainGateway([
      {
        method: 'GET',
        path: '/api/market/v1/list-market-quotes',
        handler: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      },
    ]);

    const res = await handler(sameOriginRequest('https://worldmonitor.app/api/market/v1/list-market-quotes?symbols=AAPL'));

    assert.equal(res.status, 200);
  });

  it('requires an API key for desktop bootstrap requests even with same-origin Fetch Metadata', async () => {
    const { default: bootstrapHandler } = await import('../api/bootstrap.js');

    const res = await bootstrapHandler(sameOriginRequest('https://worldmonitor.app/api/bootstrap?keys=earthquakes', {
      headers: { Origin: 'tauri://localhost' },
    }));

    assert.equal(res.status, 401);
  });

  it('requires an API key for desktop RSS requests even with same-origin Fetch Metadata', async () => {
    const { default: rssProxyHandler } = await import('../api/rss-proxy.js');

    const res = await rssProxyHandler(sameOriginRequest('https://worldmonitor.app/api/rss-proxy', {
      headers: { Origin: 'tauri://localhost' },
    }));

    assert.equal(res.status, 401);
  });

  it('requires an API key for desktop gateway requests even with same-origin Fetch Metadata', async () => {
    const { createDomainGateway } = await import('../server/gateway.ts');
    const handler = createDomainGateway([
      {
        method: 'GET',
        path: '/api/market/v1/list-market-quotes',
        handler: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      },
    ]);

    const res = await handler(sameOriginRequest('https://worldmonitor.app/api/market/v1/list-market-quotes?symbols=AAPL', {
      headers: { Origin: 'tauri://localhost' },
    }));

    assert.equal(res.status, 401);
  });

  it('allows former premium gateway routes with same-origin Fetch Metadata', async () => {
    const { createDomainGateway } = await import('../server/gateway.ts');
    const handler = createDomainGateway([
      {
        method: 'GET',
        path: '/api/market/v1/analyze-stock',
        handler: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      },
    ]);

    const res = await handler(sameOriginRequest('https://worldmonitor.app/api/market/v1/analyze-stock?symbol=AAPL'));

    assert.equal(res.status, 200);
  });
});

describe('SignalMap public access guardrails', () => {
  it('keeps origin rejection ahead of public browser bypasses', () => {
    const bootstrapSrc = readProjectFile('api/bootstrap.js');
    const rssSrc = readProjectFile('api/rss-proxy.js');
    const gatewaySrc = readProjectFile('server/gateway.ts');

    assert.ok(bootstrapSrc.indexOf('if (isDisallowedOrigin(req))') < bootstrapSrc.indexOf('if (!canUsePublicBrowserBypass(req))'));
    assert.ok(rssSrc.indexOf('if (isDisallowedOrigin(req))') < rssSrc.indexOf('if (!canUsePublicBrowserBypass(req))'));
    assert.ok(gatewaySrc.indexOf('if (isDisallowedOrigin(request))') < gatewaySrc.indexOf('!forceApiKey && canUsePublicBrowserBypass(request)'));
  });

  it('keeps RSS rate limiting after public-browser acceptance', () => {
    const rssSrc = readProjectFile('api/rss-proxy.js');

    assert.match(rssSrc, /checkRateLimit\(req,\s*corsHeaders\)/);
    assert.ok(rssSrc.indexOf('if (!canUsePublicBrowserBypass(req)') < rssSrc.indexOf('checkRateLimit(req, corsHeaders)'));
  });

  it('keeps product-tier gateway gates as no-ops and rate-limit checks wired', () => {
    const gatewaySrc = readProjectFile('server/gateway.ts');
    const premiumPathsSrc = readProjectFile('src/shared/premium-paths.ts');
    const entitlementSrc = readProjectFile('server/_shared/entitlement-check.ts');

    assert.match(premiumPathsSrc, /new Set<string>\(\)/);
    assert.match(gatewaySrc, /getRequiredTier\(pathname\)/);
    assert.match(gatewaySrc, /const forceApiKey = isTierGated && !sessionUserId/);
    assert.doesNotMatch(gatewaySrc, /needsLegacyProBearerGate|Pro subscription required|API access subscription required/);
    assert.match(entitlementSrc, /return null;/);
    assert.match(gatewaySrc, /checkEndpointRateLimit\(request,\s*pathname,\s*corsHeaders\)/);
    assert.match(gatewaySrc, /hasEndpointRatePolicy\(pathname\)/);
    assert.match(gatewaySrc, /checkRateLimit\(request,\s*corsHeaders\)/);
  });

  it('keeps browser product-tier compatibility helpers open without faking entitlement status', () => {
    const widgetStoreSrc = readProjectFile('src/services/widget-store.ts');
    const entitlementSrc = readProjectFile('src/services/entitlements.ts');
    const isProUserBody = extractBody(widgetStoreSrc, 'export function isProUser(');
    const hasFeatureBody = extractBody(entitlementSrc, 'export function hasFeature(');
    const hasTierBody = extractBody(entitlementSrc, 'export function hasTier(');
    const isEntitledBody = extractBody(entitlementSrc, 'export function isEntitled(');

    assert.match(isProUserBody, /return true;/);
    assert.doesNotMatch(isProUserBody, /getAuthState|isEntitled|isWidgetFeatureEnabled|isProWidgetEnabled/);
    assert.doesNotMatch(widgetStoreSrc, /import\s+\{\s*getAuthState\s*\}|import\s+\{\s*isEntitled\s*\}/);

    assert.match(hasFeatureBody, /void flag;/);
    assert.match(hasFeatureBody, /return true;/);
    assert.match(hasTierBody, /void minTier;/);
    assert.match(hasTierBody, /return true;/);
    assert.match(isEntitledBody, /currentState !== null/);
    assert.match(isEntitledBody, /currentState\.planKey !== 'free'/);
    assert.match(isEntitledBody, /currentState\.validUntil >= Date\.now\(\)/);
  });

  it('keeps notifications settings gated by sign-in only and free of checkout paths', () => {
    const notificationsSrc = readProjectFile('src/services/notifications-settings.ts');

    assert.match(notificationsSrc, /const isSignedIn = !!host\.isSignedIn;/);
    assert.match(notificationsSrc, /if \(isSignedIn\)/);
    assert.match(notificationsSrc, /id="usNotifSignInBtn"/);
    assert.match(notificationsSrc, /openSignIn\(\)/);
    assert.doesNotMatch(notificationsSrc, /hasTier|isPro|Upgrade to Pro|usNotifUpgradeBtn/);
    assert.doesNotMatch(notificationsSrc, /@\/services\/checkout|startCheckout|DEFAULT_UPGRADE_PRODUCT|worldmonitor\.app\/pro/);
  });

  it('keeps export and playback controls visible without product-role subscriptions', () => {
    const eventsSrc = readProjectFile('src/app/event-handlers.ts');
    const exportBody = extractBody(eventsSrc, 'setupExportPanel(): void');
    const playbackBody = extractBody(eventsSrc, 'setupPlaybackControl(): void');

    assert.doesNotMatch(eventsSrc, /trackGateHit|getAuthState|subscribeAuthState|proGateUnsubscribers|role === 'pro'/);
    assert.match(exportBody, /el\.style\.display = '';/);
    assert.match(playbackBody, /el\.style\.display = '';/);
    assert.doesNotMatch(exportBody, /display = isPro|trackGateHit|subscribeAuthState|getAuthState/);
    assert.doesNotMatch(playbackBody, /display = isPro|trackGateHit|subscribeAuthState|getAuthState/);
  });

  it('keeps flight search and flight source indexing free of browser product gates', () => {
    const searchSrc = readProjectFile('src/app/search-manager.ts');
    const updateFlightSourceBody = extractBody(searchSrc, 'updateFlightSource(');

    assert.doesNotMatch(searchSrc, /getAuthState|role === 'pro'|isProUser/);
    assert.doesNotMatch(searchSrc, /setOnFlightSearch[\s\S]{0,320}(getAuthState|role === 'pro'|isProUser|hasTier|isEntitled)/);
    assert.doesNotMatch(updateFlightSourceBody, /isProUser|getAuthState|role === 'pro'/);
    assert.match(searchSrc, /fetchAircraftPositions\(\{ callsign \}\)/);
    assert.match(updateFlightSourceBody, /this\.ctx\.searchModal\.registerSource\('flight', items\)/);
  });

  it('keeps globe layer toggles free of runtime product-key locks and badges', () => {
    const globeSrc = readProjectFile('src/components/GlobeMap.ts');
    const createLayerTogglesBody = extractBody(globeSrc, 'private createLayerToggles(');

    assert.doesNotMatch(globeSrc, /getSecretState|WORLDMONITOR_API_KEY|layer-pro-badge|layer-toggle-locked/);
    assert.doesNotMatch(createLayerTogglesBody, /def\.premium|premium === ['"]locked['"]|premium === ['"]enhanced['"]|isLocked|isEnhanced/);
    assert.doesNotMatch(createLayerTogglesBody, /<input type="checkbox"[^>]*disabled/);
    assert.match(createLayerTogglesBody, /<label class="layer-toggle" data-layer="\$\{key\}">/);
    assert.match(createLayerTogglesBody, /<span class="toggle-label">\$\{label\}<\/span>/);
  });

  it('keeps shipping webhook handlers force-key protected', () => {
    const webhookSrc = readProjectFile('api/v2/shipping/webhooks/[subscriberId].ts');
    const webhookActionSrc = readProjectFile('api/v2/shipping/webhooks/[subscriberId]/[action].ts');

    assert.match(webhookSrc, /validateApiKey\(req,\s*\{\s*forceKey:\s*true\s*\}\)/);
    assert.match(webhookActionSrc, /validateApiKey\(req,\s*\{\s*forceKey:\s*true\s*\}\)/);
  });

  it('does not ship frontend license-key or upgrade overlay copy', () => {
    const panelSrc = readProjectFile('src/components/Panel.ts');
    const localeSrc = readProjectFile('src/locales/en.json');
    const forbiddenCopy = [
      'Requires a World Monitor license key',
      'license unlocks everything',
      'A single World Monitor license',
      'Paste your license to unlock',
      'License Key',
      'NO LICENSE',
      'Upgrade to Pro',
      'Upgrade to PRO',
      'Sign In to Unlock',
      'premium features',
      'premium analytics',
      'Premium Stock Analysis',
      'Premium Backtesting',
    ];

    for (const copy of forbiddenCopy) {
      assert.ok(!panelSrc.includes(copy), `Panel.ts still contains product-gate copy: ${copy}`);
      assert.ok(!localeSrc.includes(copy), `en.json still contains product-gate copy: ${copy}`);
    }
  });

  it('keeps production frontend source free of component-level product gates', () => {
    const frontendFiles = [
      ...listProjectFiles('src/app', ['.ts', '.tsx']),
      ...listProjectFiles('src/components', ['.ts', '.tsx']),
      ...listProjectFiles('src/config', ['.ts', '.tsx']),
    ];

    assertSourceFilesDoNotContain(frontendFiles, [
      /premium:\s*['"]locked['"]/,
      /premium:\s*['"]enhanced['"]/,
      'Premium Stock Analysis',
      'Premium Backtesting',
    ], 'frontend product-gating metadata or visible copy');
  });

  it('keeps CountryDeepDivePanel full-functionality paths free of client product gates', () => {
    const panelSrc = readProjectFile('src/components/CountryDeepDivePanel.ts');

    assert.doesNotMatch(panelSrc, /import\s+\{\s*hasPremiumAccess\s*\}/);
    assert.doesNotMatch(panelSrc, /import\s+\{\s*getAuthState\s*\}/);
    assert.doesNotMatch(panelSrc, /import\s+\{\s*trackGateHit\s*\}/);
    assert.doesNotMatch(panelSrc, /hasPremiumAccess\(getAuthState\(\)\)/);
    assert.doesNotMatch(panelSrc, /makeProLocked/);
    assert.doesNotMatch(panelSrc, /Upgrade to PRO|Bypass corridors available with PRO/);
    assert.match(panelSrc, /bypassContent\.append\(this\.makeLoading\('Loading bypass options\\u2026'\)\)/);
    assert.match(panelSrc, /void fetchBypassOptions\(sector\.primaryChokepointId, 'container', 100\)/);
    assert.match(panelSrc, /costShockCalcBody\.append\(this\.makeLoading\('Loading cost shock calculator\\u2026'\)\)/);
    assert.match(panelSrc, /productImportsCardBody\.append\(this\.makeLoading\('Loading product data\\u2026'\)\)/);
  });

  it('keeps locale tooltip copy free of premium stock-analysis labels', () => {
    const localeFiles = listProjectFiles('src/locales', ['.json']);

    assertSourceFilesDoNotContain(localeFiles, [
      'Premium Stock Analysis',
      'Premium Backtesting',
    ], 'premium stock-analysis tooltip copy');
  });

  it('keeps panel product gating resolved to public access', () => {
    const gatingSrc = readProjectFile('src/services/panel-gating.ts');
    const hasPremiumAccessBody = extractBody(gatingSrc, 'export function hasPremiumAccess(');
    const gateReasonBody = extractBody(gatingSrc, 'export function getPanelGateReason(');

    assert.match(hasPremiumAccessBody, /return true;/);
    assert.match(gateReasonBody, /return PanelGateReason\.NONE;/);
    assert.doesNotMatch(gateReasonBody, /return PanelGateReason\.(ANONYMOUS|FREE_TIER)/);
    assert.doesNotMatch(gatingSrc, /getSecretState|isProUser/);
  });

  it('keeps panel locked and gated CTA methods as pass-through no-ops', () => {
    const panelSrc = readProjectFile('src/components/Panel.ts');
    const showLockedBody = extractBody(panelSrc, 'public showLocked(');
    const showGatedCtaBody = extractBody(panelSrc, 'public showGatedCta(');

    for (const body of [showLockedBody, showGatedCtaBody]) {
      assert.match(body, /clearLockedState\(\)/);
      assert.doesNotMatch(body, /panel-is-locked|panel-locked-state|panel-locked-cta|panel-locked-desc/);
      assert.doesNotMatch(body, /premium\.|Upgrade to Pro|worldmonitor\.app\/pro|startCheckout|open_url/);
      assert.doesNotMatch(body, /addEventListener\('click'/);
      assert.doesNotMatch(body, /showError|setErrorState|common\.unavailable/);
    }
  });

  it('keeps Latest Brief from rendering product-gate copy or locking itself', () => {
    const latestBriefSrc = readProjectFile('src/components/LatestBriefPanel.ts');
    const forbiddenCopy = [
      'Pro required.',
      'Upgrade to unlock',
      'included with the Pro plan',
      'Upgrade to Pro',
      'Upgrade to PRO',
    ];

    for (const copy of forbiddenCopy) {
      assert.ok(!latestBriefSrc.includes(copy), `LatestBriefPanel still contains product-gate copy: ${copy}`);
    }

    assert.doesNotMatch(latestBriefSrc, /premium:\s*['"]locked['"]/);
    assert.doesNotMatch(latestBriefSrc, /renderUpgradeRequired|upgrade_required|BriefAccessError/);
    assert.doesNotMatch(latestBriefSrc, /public override showGatedCta\(/);
    assert.doesNotMatch(latestBriefSrc, /gateLocked|this\.gateLocked\s*=\s*true/);
    assert.doesNotMatch(latestBriefSrc, /getEntitlementState|hasTier/);
    assert.match(latestBriefSrc, /res\.status === 401[\s\S]*throw new BriefUnavailableError\(\)/);
    assert.match(latestBriefSrc, /res\.status === 403[\s\S]*throw new BriefUnavailableError\(\)/);
  });

  it('keeps Latest Brief out of the obsolete Clerk-pro-only layout gate', () => {
    const layoutSrc = readProjectFile('src/app/panel-layout.ts');

    assert.doesNotMatch(layoutSrc, /WEB_CLERK_PRO_ONLY_PANELS/);
    assert.doesNotMatch(layoutSrc, /WEB_CLERK_PRO_ONLY_PANELS\.has\(key\)/);
    assert.doesNotMatch(layoutSrc, /getEntitlementState\(\)\s*!==\s*null[\s\S]{0,240}!hasTier\(1\)/);
    assert.doesNotMatch(layoutSrc, /reason\s*=\s*state\.user\s*\?\s*PanelGateReason\.FREE_TIER\s*:\s*PanelGateReason\.ANONYMOUS/);
  });

  it('keeps panel configs free of product-gating metadata', () => {
    const panelsSrc = readProjectFile('src/config/panels.ts');
    const entitlementBody = extractBody(panelsSrc, 'export function isPanelEntitled(');

    assert.doesNotMatch(panelsSrc, /premium:\s*['"](locked|enhanced)['"]/);
    assert.doesNotMatch(panelsSrc, /_desktop\s*&&\s*\{\s*premium:/);
    assert.doesNotMatch(panelsSrc, /Premium Stock Analysis|Premium Backtesting/);
    assert.match(entitlementBody, /return true;/);
    assert.doesNotMatch(entitlementBody, /config\.premium|getSecretState|isEntitled|isPro/);
  });
});
