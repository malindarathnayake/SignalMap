import { defineConfig, loadEnv, type Plugin } from 'vite';
import { resolve, dirname, extname } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { brotliCompress } from 'zlib';
import { promisify } from 'util';
import pkg from './package.json';

// Env-dependent constants moved inside defineConfig function


const brotliCompressAsync = promisify(brotliCompress);
const BROTLI_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json', '.txt', '.xml', '.wasm']);

function brotliPrecompressPlugin(): Plugin {
  return {
    name: 'brotli-precompress',
    apply: 'build',
    async writeBundle(outputOptions, bundle) {
      const outDir = outputOptions.dir;
      if (!outDir) return;

      await Promise.all(Object.keys(bundle).map(async (fileName) => {
        const extension = extname(fileName).toLowerCase();
        if (!BROTLI_EXTENSIONS.has(extension)) return;

        const sourcePath = resolve(outDir, fileName);
        const compressedPath = `${sourcePath}.br`;
        const sourceBuffer = await readFile(sourcePath);
        if (sourceBuffer.length < 1024) return;

        const compressedBuffer = await brotliCompressAsync(sourceBuffer);
        await mkdir(dirname(compressedPath), { recursive: true });
        await writeFile(compressedPath, compressedBuffer);
      }));
    },
  };
}

function polymarketPlugin(): Plugin {
  const GAMMA_BASE = 'https://gamma-api.polymarket.com';
  const ALLOWED_ORDER = ['volume', 'liquidity', 'startDate', 'endDate', 'spread'];

  return {
    name: 'polymarket-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/polymarket')) return next();

        const url = new URL(req.url, 'http://localhost');
        const endpoint = url.searchParams.get('endpoint') || 'markets';
        const closed = ['true', 'false'].includes(url.searchParams.get('closed') ?? '') ? url.searchParams.get('closed') : 'false';
        const order = ALLOWED_ORDER.includes(url.searchParams.get('order') ?? '') ? url.searchParams.get('order') : 'volume';
        const ascending = ['true', 'false'].includes(url.searchParams.get('ascending') ?? '') ? url.searchParams.get('ascending') : 'false';
        const rawLimit = parseInt(url.searchParams.get('limit') ?? '', 10);
        const limit = isNaN(rawLimit) ? 50 : Math.max(1, Math.min(100, rawLimit));

        const params = new URLSearchParams({ closed: closed!, order: order!, ascending: ascending!, limit: String(limit) });
        if (endpoint === 'events') {
          const tag = (url.searchParams.get('tag') ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 100);
          if (tag) params.set('tag_slug', tag);
        }

        const gammaUrl = `${GAMMA_BASE}/${endpoint === 'events' ? 'events' : 'markets'}?${params}`;

        res.setHeader('Content-Type', 'application/json');
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const resp = await fetch(gammaUrl, { headers: { Accept: 'application/json' }, signal: controller.signal });
          clearTimeout(timer);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.text();
          res.setHeader('Cache-Control', 'public, max-age=120');
          res.setHeader('X-Polymarket-Source', 'gamma');
          res.end(data);
        } catch {
          // Expected: Cloudflare JA3 blocks server-side TLS — return empty array
          res.setHeader('Cache-Control', 'public, max-age=300');
          res.end('[]');
        }
      });
    },
  };
}

/**
 * Vite dev server plugin for sebuf API routes.
 *
 * Intercepts requests matching /api/{domain}/v1/* and routes them through
 * the same handler pipeline as the Vercel catch-all gateway. Other /api/*
 * paths fall through to existing proxy rules.
 */
function sebufApiPlugin(): Plugin {
  // Cache router across requests (H-13 fix). Invalidated by Vite's module graph on HMR.
  let cachedRouter: Awaited<ReturnType<typeof buildRouter>> | null = null;
  let cachedCorsMod: any = null;

  async function buildRouter() {
    const [
      routerMod, corsMod, errorMod,
      seismologyServerMod, seismologyHandlerMod,
      wildfireServerMod, wildfireHandlerMod,
      climateServerMod, climateHandlerMod,
      predictionServerMod, predictionHandlerMod,
      displacementServerMod, displacementHandlerMod,
      aviationServerMod, aviationHandlerMod,
      researchServerMod, researchHandlerMod,
      unrestServerMod, unrestHandlerMod,
      conflictServerMod, conflictHandlerMod,
      maritimeServerMod, maritimeHandlerMod,
      cyberServerMod, cyberHandlerMod,
      economicServerMod, economicHandlerMod,
      infrastructureServerMod, infrastructureHandlerMod,
      marketServerMod, marketHandlerMod,
      newsServerMod, newsHandlerMod,
      intelligenceServerMod, intelligenceHandlerMod,
      militaryServerMod, militaryHandlerMod,
      positiveEventsServerMod, positiveEventsHandlerMod,
      givingServerMod, givingHandlerMod,
      tradeServerMod, tradeHandlerMod,
      supplyChainServerMod, supplyChainHandlerMod,
      naturalServerMod, naturalHandlerMod,
      resilienceServerMod, resilienceHandlerMod,
      leadsServerMod, leadsHandlerMod,
      scenarioServerMod, scenarioHandlerMod,
      shippingV2ServerMod, shippingV2HandlerMod,
    ] = await Promise.all([
        import('./server/router'),
        import('./server/cors'),
        import('./server/error-mapper'),
        import('./src/generated/server/worldmonitor/seismology/v1/service_server'),
        import('./server/worldmonitor/seismology/v1/handler'),
        import('./src/generated/server/worldmonitor/wildfire/v1/service_server'),
        import('./server/worldmonitor/wildfire/v1/handler'),
        import('./src/generated/server/worldmonitor/climate/v1/service_server'),
        import('./server/worldmonitor/climate/v1/handler'),
        import('./src/generated/server/worldmonitor/prediction/v1/service_server'),
        import('./server/worldmonitor/prediction/v1/handler'),
        import('./src/generated/server/worldmonitor/displacement/v1/service_server'),
        import('./server/worldmonitor/displacement/v1/handler'),
        import('./src/generated/server/worldmonitor/aviation/v1/service_server'),
        import('./server/worldmonitor/aviation/v1/handler'),
        import('./src/generated/server/worldmonitor/research/v1/service_server'),
        import('./server/worldmonitor/research/v1/handler'),
        import('./src/generated/server/worldmonitor/unrest/v1/service_server'),
        import('./server/worldmonitor/unrest/v1/handler'),
        import('./src/generated/server/worldmonitor/conflict/v1/service_server'),
        import('./server/worldmonitor/conflict/v1/handler'),
        import('./src/generated/server/worldmonitor/maritime/v1/service_server'),
        import('./server/worldmonitor/maritime/v1/handler'),
        import('./src/generated/server/worldmonitor/cyber/v1/service_server'),
        import('./server/worldmonitor/cyber/v1/handler'),
        import('./src/generated/server/worldmonitor/economic/v1/service_server'),
        import('./server/worldmonitor/economic/v1/handler'),
        import('./src/generated/server/worldmonitor/infrastructure/v1/service_server'),
        import('./server/worldmonitor/infrastructure/v1/handler'),
        import('./src/generated/server/worldmonitor/market/v1/service_server'),
        import('./server/worldmonitor/market/v1/handler'),
        import('./src/generated/server/worldmonitor/news/v1/service_server'),
        import('./server/worldmonitor/news/v1/handler'),
        import('./src/generated/server/worldmonitor/intelligence/v1/service_server'),
        import('./server/worldmonitor/intelligence/v1/handler'),
        import('./src/generated/server/worldmonitor/military/v1/service_server'),
        import('./server/worldmonitor/military/v1/handler'),
        import('./src/generated/server/worldmonitor/positive_events/v1/service_server'),
        import('./server/worldmonitor/positive-events/v1/handler'),
        import('./src/generated/server/worldmonitor/giving/v1/service_server'),
        import('./server/worldmonitor/giving/v1/handler'),
        import('./src/generated/server/worldmonitor/trade/v1/service_server'),
        import('./server/worldmonitor/trade/v1/handler'),
        import('./src/generated/server/worldmonitor/supply_chain/v1/service_server'),
        import('./server/worldmonitor/supply-chain/v1/handler'),
        import('./src/generated/server/worldmonitor/natural/v1/service_server'),
        import('./server/worldmonitor/natural/v1/handler'),
        import('./src/generated/server/worldmonitor/resilience/v1/service_server'),
        import('./server/worldmonitor/resilience/v1/handler'),
        import('./src/generated/server/worldmonitor/leads/v1/service_server'),
        import('./server/worldmonitor/leads/v1/handler'),
        import('./src/generated/server/worldmonitor/scenario/v1/service_server'),
        import('./server/worldmonitor/scenario/v1/handler'),
        import('./src/generated/server/worldmonitor/shipping/v2/service_server'),
        import('./server/worldmonitor/shipping/v2/handler'),
      ]);

    const serverOptions = { onError: errorMod.mapErrorToResponse };
    const allRoutes = [
      ...seismologyServerMod.createSeismologyServiceRoutes(seismologyHandlerMod.seismologyHandler, serverOptions),
      ...wildfireServerMod.createWildfireServiceRoutes(wildfireHandlerMod.wildfireHandler, serverOptions),
      ...climateServerMod.createClimateServiceRoutes(climateHandlerMod.climateHandler, serverOptions),
      ...predictionServerMod.createPredictionServiceRoutes(predictionHandlerMod.predictionHandler, serverOptions),
      ...displacementServerMod.createDisplacementServiceRoutes(displacementHandlerMod.displacementHandler, serverOptions),
      ...aviationServerMod.createAviationServiceRoutes(aviationHandlerMod.aviationHandler, serverOptions),
      ...researchServerMod.createResearchServiceRoutes(researchHandlerMod.researchHandler, serverOptions),
      ...unrestServerMod.createUnrestServiceRoutes(unrestHandlerMod.unrestHandler, serverOptions),
      ...conflictServerMod.createConflictServiceRoutes(conflictHandlerMod.conflictHandler, serverOptions),
      ...maritimeServerMod.createMaritimeServiceRoutes(maritimeHandlerMod.maritimeHandler, serverOptions),
      ...cyberServerMod.createCyberServiceRoutes(cyberHandlerMod.cyberHandler, serverOptions),
      ...economicServerMod.createEconomicServiceRoutes(economicHandlerMod.economicHandler, serverOptions),
      ...infrastructureServerMod.createInfrastructureServiceRoutes(infrastructureHandlerMod.infrastructureHandler, serverOptions),
      ...marketServerMod.createMarketServiceRoutes(marketHandlerMod.marketHandler, serverOptions),
      ...newsServerMod.createNewsServiceRoutes(newsHandlerMod.newsHandler, serverOptions),
      ...intelligenceServerMod.createIntelligenceServiceRoutes(intelligenceHandlerMod.intelligenceHandler, serverOptions),
      ...militaryServerMod.createMilitaryServiceRoutes(militaryHandlerMod.militaryHandler, serverOptions),
      ...positiveEventsServerMod.createPositiveEventsServiceRoutes(positiveEventsHandlerMod.positiveEventsHandler, serverOptions),
      ...givingServerMod.createGivingServiceRoutes(givingHandlerMod.givingHandler, serverOptions),
      ...tradeServerMod.createTradeServiceRoutes(tradeHandlerMod.tradeHandler, serverOptions),
      ...supplyChainServerMod.createSupplyChainServiceRoutes(supplyChainHandlerMod.supplyChainHandler, serverOptions),
      ...naturalServerMod.createNaturalServiceRoutes(naturalHandlerMod.naturalHandler, serverOptions),
      ...resilienceServerMod.createResilienceServiceRoutes(resilienceHandlerMod.resilienceHandler, serverOptions),
      ...leadsServerMod.createLeadsServiceRoutes(leadsHandlerMod.leadsHandler, serverOptions),
      ...scenarioServerMod.createScenarioServiceRoutes(scenarioHandlerMod.scenarioHandler, serverOptions),
      ...shippingV2ServerMod.createShippingV2ServiceRoutes(shippingV2HandlerMod.shippingV2Handler, serverOptions),
    ];
    cachedCorsMod = corsMod;
    return routerMod.createRouter(allRoutes);
  }

  return {
    name: 'sebuf-api',
    configureServer(server) {
      // Invalidate cached router on HMR updates to server/ files
      server.watcher.on('change', (file) => {
        if (file.includes('/server/') || file.includes('/src/generated/server/')) {
          cachedRouter = null;
        }
      });

      // Legacy v1 URL aliases → new sebuf RPC paths (mirror of the alias files
      // in api/scenario/v1/ + api/supply-chain/v1/). Vercel serves the alias
      // files directly; vite dev has no file-based routing for api/, so we
      // rewrite the pathname here before the router lookup.
      const V1_ALIASES: Record<string, string> = {
        '/api/scenario/v1/run': '/api/scenario/v1/run-scenario',
        '/api/scenario/v1/status': '/api/scenario/v1/get-scenario-status',
        '/api/scenario/v1/templates': '/api/scenario/v1/list-scenario-templates',
        '/api/supply-chain/v1/country-products': '/api/supply-chain/v1/get-country-products',
        '/api/supply-chain/v1/multi-sector-cost-shock': '/api/supply-chain/v1/get-multi-sector-cost-shock',
      };

      server.middlewares.use(async (req, res, next) => {
        // Intercept sebuf routes in two forms:
        //  - standard /api/{domain}/v{N}/* (domain-first, e.g. /api/market/v1/...)
        //  - partner-URL-preservation /api/v{N}/{domain}/* (version-first, e.g.
        //    /api/v2/shipping/...). Only the second form applies when the
        //    external contract already uses a reversed layout.
        if (!req.url || !/^\/api\/(?:[a-z][a-z0-9-]*\/v\d+|v\d+\/[a-z][a-z0-9-]*)\//.test(req.url)) {
          return next();
        }

        // Rewrite documented v1 URL → new sebuf path if this is an alias.
        const [pathOnly, queryOnly] = req.url.split('?', 2);
        const aliasTarget = pathOnly ? V1_ALIASES[pathOnly] : undefined;
        if (aliasTarget) {
          req.url = queryOnly ? `${aliasTarget}?${queryOnly}` : aliasTarget;
        }

        try {
          // Build router once, reuse across requests (H-13 fix)
          if (!cachedRouter) {
            cachedRouter = await buildRouter();
          }
          const router = cachedRouter;
          const corsMod = cachedCorsMod;

          // Convert Connect IncomingMessage to Web Standard Request
          const port = server.config.server.port || 3000;
          const url = new URL(req.url, `http://localhost:${port}`);

          // Read body for POST requests
          let body: string | undefined;
          if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            body = Buffer.concat(chunks).toString();
          }

          // Extract headers from IncomingMessage
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') {
              headers[key] = value;
            } else if (Array.isArray(value)) {
              headers[key] = value.join(', ');
            }
          }

          const webRequest = new Request(url.toString(), {
            method: req.method,
            headers,
            body: body || undefined,
          });

          const corsHeaders = corsMod.getCorsHeaders(webRequest);

          // OPTIONS preflight
          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            for (const [key, value] of Object.entries(corsHeaders)) {
              res.setHeader(key, value);
            }
            res.end();
            return;
          }

          // Origin check
          if (corsMod.isDisallowedOrigin(webRequest)) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            for (const [key, value] of Object.entries(corsHeaders)) {
              res.setHeader(key, value);
            }
            res.end(JSON.stringify({ error: 'Origin not allowed' }));
            return;
          }

          // Route matching
          const matchedHandler = router.match(webRequest);
          if (!matchedHandler) {
            const allowed = router.allowedMethods(new URL(webRequest.url).pathname);
            if (allowed.length > 0) {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Allow', allowed.join(', '));
            } else {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
            }
            for (const [key, value] of Object.entries(corsHeaders)) {
              res.setHeader(key, value);
            }
            res.end(JSON.stringify({ error: res.statusCode === 405 ? 'Method not allowed' : 'Not found' }));
            return;
          }

          // Execute handler
          const response = await matchedHandler(webRequest);

          // Write response
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          for (const [key, value] of Object.entries(corsHeaders)) {
            res.setHeader(key, value);
          }
          res.end(await response.text());
        } catch (err) {
          console.error('[sebuf-api] Error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
    },
  };
}

// RSS proxy allowlist — duplicated from api/rss-proxy.js for dev mode.
// Keep in sync when adding new domains.
const RSS_PROXY_ALLOWED_DOMAINS = new Set([
  'feeds.bbci.co.uk', 'www.theguardian.com', 'feeds.npr.org', 'news.google.com',
  'www.aljazeera.com', 'rss.cnn.com', 'hnrss.org', 'feeds.arstechnica.com',
  'www.theverge.com', 'www.cnbc.com', 'feeds.marketwatch.com', 'www.defenseone.com',
  'breakingdefense.com', 'www.bellingcat.com', 'techcrunch.com', 'huggingface.co',
  'www.technologyreview.com', 'rss.arxiv.org', 'export.arxiv.org',
  'www.federalreserve.gov', 'www.sec.gov', 'www.whitehouse.gov', 'www.state.gov',
  'www.defense.gov', 'home.treasury.gov', 'www.justice.gov', 'tools.cdc.gov',
  'www.fema.gov', 'www.dhs.gov', 'www.thedrive.com', 'krebsonsecurity.com',
  'finance.yahoo.com', 'thediplomat.com', 'venturebeat.com', 'foreignpolicy.com',
  'www.ft.com', 'openai.com', 'www.reutersagency.com', 'feeds.reuters.com',
  'asia.nikkei.com', 'www.cfr.org', 'www.csis.org', 'www.politico.com',
  'www.brookings.edu', 'layoffs.fyi', 'www.defensenews.com', 'www.militarytimes.com',
  'taskandpurpose.com', 'news.usni.org', 'www.oryxspioenkop.com', 'www.gov.uk',
  'www.foreignaffairs.com', 'www.atlanticcouncil.org',
  // Tech variant
  'www.zdnet.com', 'www.techmeme.com', 'www.darkreading.com', 'www.schneier.com',
  'rss.politico.com', 'www.anandtech.com', 'www.tomshardware.com', 'www.semianalysis.com',
  'feed.infoq.com', 'thenewstack.io', 'devops.com', 'dev.to', 'lobste.rs', 'changelog.com',
  'seekingalpha.com', 'news.crunchbase.com', 'www.saastr.com', 'feeds.feedburner.com',
  'www.producthunt.com', 'www.axios.com', 'api.axios.com', 'github.blog', 'githubnext.com',
  'mshibanami.github.io', 'www.engadget.com', 'news.mit.edu', 'dev.events',
  'www.ycombinator.com', 'a16z.com', 'review.firstround.com', 'www.sequoiacap.com',
  'www.nfx.com', 'www.aaronsw.com', 'bothsidesofthetable.com', 'www.lennysnewsletter.com',
  'stratechery.com', 'www.eu-startups.com', 'tech.eu', 'sifted.eu', 'www.techinasia.com',
  'kr-asia.com', 'techcabal.com', 'disrupt-africa.com', 'lavca.org', 'contxto.com',
  'inc42.com', 'yourstory.com', 'pitchbook.com', 'www.cbinsights.com', 'www.techstars.com',
  // Regional & international
  'english.alarabiya.net', 'www.arabnews.com', 'www.timesofisrael.com', 'www.haaretz.com',
  'www.scmp.com', 'kyivindependent.com', 'www.themoscowtimes.com', 'feeds.24.com',
  'feeds.capi24.com', 'www.france24.com', 'www.euronews.com', 'www.lemonde.fr',
  'rss.dw.com', 'www.africanews.com', 'www.lasillavacia.com', 'www.channelnewsasia.com',
  'www.thehindu.com', 'news.un.org', 'www.iaea.org', 'www.who.int', 'www.cisa.gov',
  'www.crisisgroup.org',
  // Think tanks
  'rusi.org', 'warontherocks.com', 'www.aei.org', 'responsiblestatecraft.org',
  'www.fpri.org', 'jamestown.org', 'www.chathamhouse.org', 'ecfr.eu', 'www.gmfus.org',
  'www.wilsoncenter.org', 'www.lowyinstitute.org', 'www.mei.edu', 'www.stimson.org',
  'www.cnas.org', 'carnegieendowment.org', 'www.rand.org', 'fas.org',
  'www.armscontrol.org', 'www.nti.org', 'thebulletin.org', 'www.iss.europa.eu',
  // Economic & Food Security
  'www.fao.org', 'worldbank.org', 'www.imf.org',
  // Regional locale feeds
  'www.hurriyet.com.tr', 'tvn24.pl', 'www.polsatnews.pl', 'www.rp.pl', 'meduza.io',
  'novayagazeta.eu', 'www.bangkokpost.com', 'vnexpress.net', 'www.abc.net.au',
  'news.ycombinator.com',
  // Finance variant
  'www.coindesk.com', 'cointelegraph.com',
  // Happy variant — positive news sources
  'www.goodnewsnetwork.org', 'www.positive.news', 'reasonstobecheerful.world',
  'www.optimistdaily.com', 'www.sunnyskyz.com', 'www.huffpost.com',
  'www.sciencedaily.com', 'feeds.nature.com', 'www.livescience.com', 'www.newscientist.com',
]);

function rssProxyPlugin(): Plugin {
  return {
    name: 'rss-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/rss-proxy')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost');
        const feedUrl = url.searchParams.get('url');
        if (!feedUrl) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing url parameter' }));
          return;
        }

        try {
          const parsed = new URL(feedUrl);
          if (!RSS_PROXY_ALLOWED_DOMAINS.has(parsed.hostname)) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `Domain not allowed: ${parsed.hostname}` }));
            return;
          }

          const controller = new AbortController();
          const timeout = feedUrl.includes('news.google.com') ? 20000 : 12000;
          const timer = setTimeout(() => controller.abort(), timeout);

          const response = await fetch(feedUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            },
            redirect: 'follow',
          });
          clearTimeout(timer);

          const data = await response.text();
          res.statusCode = response.status;
          res.setHeader('Content-Type', 'application/xml');
          res.setHeader('Cache-Control', 'public, max-age=300');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(data);
        } catch (error: any) {
          console.error('[rss-proxy]', feedUrl, error.message);
          res.statusCode = error.name === 'AbortError' ? 504 : 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.name === 'AbortError' ? 'Feed timeout' : 'Failed to fetch feed' }));
        }
      });
    },
  };
}

function youtubeLivePlugin(): Plugin {
  return {
    name: 'youtube-live',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/youtube/live')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost');
        const channel = url.searchParams.get('channel');

        if (!channel) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing channel parameter' }));
          return;
        }

        try {
          const channelHandle = channel.startsWith('@') ? channel : `@${channel}`;
          const liveUrl = `https://www.youtube.com/${channelHandle}/live`;

          const ytRes = await fetch(liveUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            redirect: 'follow',
          });

          if (!ytRes.ok) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'public, max-age=300');
            res.end(JSON.stringify({ videoId: null, channel }));
            return;
          }

          const html = await ytRes.text();

          // Scope both fields to the same videoDetails block so we don't
          // combine a videoId from one object with isLive from another.
          let videoId: string | null = null;
          const detailsIdx = html.indexOf('"videoDetails"');
          if (detailsIdx !== -1) {
            const block = html.substring(detailsIdx, detailsIdx + 5000);
            const vidMatch = block.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
            const liveMatch = block.match(/"isLive"\s*:\s*true/);
            if (vidMatch && liveMatch) {
              videoId = vidMatch[1];
            }
          }

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'public, max-age=300');
          res.end(JSON.stringify({ videoId, isLive: videoId !== null, channel }));
        } catch (error) {
          console.error(`[YouTube Live] Error:`, error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Failed to fetch', videoId: null }));
        }
      });
    },
  };
}

function gpsjamDevPlugin(): Plugin {
  return {
    name: 'gpsjam-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/gpsjam' && !req.url?.startsWith('/api/gpsjam?')) {
          return next();
        }

        try {
          const data = await readFile(resolve(__dirname, 'scripts/data/gpsjam-latest.json'), 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(data);
        } catch {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(JSON.stringify({ error: 'No GPS jam data. Run: node scripts/fetch-gpsjam.mjs' }));
        }
      });
    },
  };
}

function signalmapFixturePlugin(): Plugin {
  // Lazy-loaded so vite.config.ts remains importable before src/ modules are compiled.
  // The fixtures module is plain TS with no side effects; ESM import() resolves synchronously
  // after the first call within the same Vite process.
  let fixturesCache: typeof import('./src/fixtures/signalmap') | null = null;

  async function getFixtures() {
    if (!fixturesCache) {
      fixturesCache = await import('./src/fixtures/signalmap');
    }
    return fixturesCache;
  }

  // Mutable fixture state for brief endpoints (test-controllable via /__test endpoints)
  let perEventCount = 0;
  let globalBriefBullets: string[] | null = null; // null = use GLOBAL_BRIEF_FIXTURE default

  return {
    name: 'signalmap-fixtures',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        const query = req.url?.includes('?') ? req.url.split('?')[1] ?? '' : '';

        // ---- fixture control endpoints (any method) ----
        if (url === '/__test/signalmap/fixture/reset') {
          perEventCount = 0;
          globalBriefBullets = null;
          res.statusCode = 204;
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end();
          return;
        }

        if (url === '/__test/signalmap/fixture/set') {
          const params = new URLSearchParams(query);
          const bulletsParam = params.get('bullets');
          if (bulletsParam) {
            globalBriefBullets = bulletsParam.split('|');
          }
          res.statusCode = 204;
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end();
          return;
        }

        // ---- SSE stream endpoint ----
        if (url === '/api/signalmap/stream') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');

          // initial heartbeat
          res.write(': heartbeat\n\n');

          // emit brief-updated after 200ms
          const briefTimer = setTimeout(() => {
            res.write('event: brief-updated\ndata: {}\n\n');
          }, 200);

          // periodic heartbeats every 15s to keep connection alive
          const heartbeatInterval = setInterval(() => {
            res.write(': heartbeat\n\n');
          }, 15_000);

          req.on('close', () => {
            clearTimeout(briefTimer);
            clearInterval(heartbeatInterval);
          });
          return;
        }

        // ---- brief global endpoint ----
        if (url === '/api/signalmap/brief/global') {
          try {
            const { GLOBAL_BRIEF_FIXTURE } = await getFixtures();
            const body = JSON.stringify({
              ...GLOBAL_BRIEF_FIXTURE,
              bullets: globalBriefBullets ?? GLOBAL_BRIEF_FIXTURE.bullets,
            });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('X-Cache', 'MISS');
            res.end(body);
          } catch (err) {
            console.error('[signalmap-fixtures] brief/global error:', err);
            next();
          }
          return;
        }

        // ---- brief event endpoint (any eventId) ----
        if (url.startsWith('/api/signalmap/brief/event/')) {
          try {
            const { EVENT_BRIEF_FIXTURE } = await getFixtures();
            perEventCount += 1;
            const body = JSON.stringify(EVENT_BRIEF_FIXTURE);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('X-Synth-Calls', String(perEventCount));
            res.end(body);
          } catch (err) {
            console.error('[signalmap-fixtures] brief/event error:', err);
            next();
          }
          return;
        }

        // ---- brief refresh endpoint ----
        if (url === '/api/signalmap/brief/refresh') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // ---- brief health endpoint ----
        if (url === '/api/signalmap/brief/health') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end(JSON.stringify({ status: 'ok' }));
          return;
        }

        // ---- legacy Phase 4 endpoints (GET only) ----
        if (req.method !== 'GET') return next();
        if (
          url !== '/api/signalmap/list' &&
          url !== '/api/signalmap/source-health' &&
          url !== '/api/bootstrap'
        ) {
          return next();
        }
        try {
          const { LIST_EVENTS_FIXTURE, SOURCE_HEALTH_FIXTURE, BOOTSTRAP_FIXTURE } = await getFixtures();
          const PATHS: Record<string, unknown> = {
            '/api/signalmap/list': LIST_EVENTS_FIXTURE,
            '/api/signalmap/source-health': SOURCE_HEALTH_FIXTURE,
            '/api/bootstrap': BOOTSTRAP_FIXTURE,
          };
          const body = JSON.stringify(PATHS[url]);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end(body);
        } catch (err) {
          console.error('[signalmap-fixtures] Error:', err);
          next();
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Inject environment variables from .env files into process.env.
  // This ensures that API keys and other secrets in .env.local are
  // available to the dev server plugins and server-side handlers.
  Object.assign(process.env, env);

  const isE2E = process.env.VITE_E2E === '1';
  const isDesktopBuild = process.env.VITE_DESKTOP_RUNTIME === '1';

  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      polymarketPlugin(),
      rssProxyPlugin(),
      youtubeLivePlugin(),
      gpsjamDevPlugin(),
      signalmapFixturePlugin(),
      sebufApiPlugin(),
      brotliPrecompressPlugin(),
    ],
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'preact',
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        child_process: resolve(__dirname, 'src/shims/child-process.ts'),
        'node:child_process': resolve(__dirname, 'src/shims/child-process.ts'),
        '@loaders.gl/worker-utils/dist/lib/process-utils/child-process-proxy.js': resolve(
          __dirname,
          'src/shims/child-process-proxy.ts'
        ),
      },
    },
    worker: {
      format: 'es',
    },
    build: {
      // Geospatial bundles (maplibre/deck) are expected to be large even when split.
      // Raise warning threshold to reduce noisy false alarms in CI.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        onwarn(warning, warn) {
          // onnxruntime-web ships a minified browser bundle that intentionally uses eval.
          // Keep build logs focused by filtering this known third-party warning only.
          if (
            warning.code === 'EVAL'
            && typeof warning.id === 'string'
            && warning.id.includes('/onnxruntime-web/dist/ort-web.min.js')
          ) {
            return;
          }

          warn(warning);
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('/@xenova/transformers/')) {
                return 'transformers';
              }
              if (id.includes('/onnxruntime-web/')) {
                return 'onnxruntime';
              }
              if (id.includes('/maplibre-gl/') || id.includes('/pmtiles/') || id.includes('/@protomaps/basemaps/')) {
                return 'maplibre';
              }
              if (
                id.includes('/@deck.gl/')
                || id.includes('/@luma.gl/')
                || id.includes('/@loaders.gl/')
                || id.includes('/@math.gl/')
                || id.includes('/h3-js/')
              ) {
                return 'deck-stack';
              }
              if (id.includes('/d3/')) {
                return 'd3';
              }
              if (id.includes('/topojson-client/')) {
                return 'topojson';
              }
              if (id.includes('/i18next')) {
                return 'i18n';
              }
              if (id.includes('/@sentry/')) {
                return 'sentry';
              }
            }
            if (id.includes('/src/components/') && id.endsWith('Panel.ts')) {
              return 'panels';
            }
            // Give lazy-loaded locale chunks a recognizable prefix so the
            // service worker can exclude them from precache (en.json is
            // statically imported into the main bundle).
            const localeMatch = id.match(/\/locales\/(\w+)\.json$/);
            if (localeMatch && localeMatch[1] !== 'en') {
              return `locale-${localeMatch[1]}`;
            }
            return undefined;
          },
        },
      },
    },
    server: {
      port: 3000,
      open: !isE2E,
      hmr: isE2E ? false : undefined,
      watch: {
        ignored: [
          '**/test-results/**',
          '**/playwright-report/**',
          '**/.playwright-mcp/**',
        ],
      },
      proxy: {
        // Widget agent — forward to Railway relay for SSE streaming
        '/widget-agent': {
          target: 'https://proxy.worldmonitor.app',
          changeOrigin: true,
        },
        // Yahoo Finance API
        '/api/yahoo': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        },
        // Polymarket handled by polymarketPlugin() — no prod proxy needed
        // USGS Earthquake API
        '/api/earthquake': {
          target: 'https://earthquake.usgs.gov',
          changeOrigin: true,
          timeout: 30000,
          rewrite: (path) => path.replace(/^\/api\/earthquake/, ''),
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.log('Earthquake proxy error:', err.message);
            });
          },
        },
        // PizzINT - Pentagon Pizza Index
        '/api/pizzint': {
          target: 'https://www.pizzint.watch',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/pizzint/, '/api'),
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.log('PizzINT proxy error:', err.message);
            });
          },
        },
        // FRED Economic Data - handled by Vercel serverless function in prod
        // In dev, we proxy to the API directly with the key from .env
        '/api/fred-data': {
          target: 'https://api.stlouisfed.org',
          changeOrigin: true,
          rewrite: (path) => {
            const url = new URL(path, 'http://localhost');
            const seriesId = url.searchParams.get('series_id');
            const start = url.searchParams.get('observation_start');
            const end = url.searchParams.get('observation_end');
            const apiKey = process.env.FRED_API_KEY || '';
            return `/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=10${start ? `&observation_start=${start}` : ''}${end ? `&observation_end=${end}` : ''}`;
          },
        },
        // RSS Feeds - BBC
        '/rss/bbc': {
          target: 'https://feeds.bbci.co.uk',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/bbc/, ''),
        },
        // RSS Feeds - Guardian
        '/rss/guardian': {
          target: 'https://www.theguardian.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/guardian/, ''),
        },
        // RSS Feeds - NPR
        '/rss/npr': {
          target: 'https://feeds.npr.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/npr/, ''),
        },
        // RSS Feeds - Al Jazeera
        '/rss/aljazeera': {
          target: 'https://www.aljazeera.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/aljazeera/, ''),
        },
        // RSS Feeds - CNN
        '/rss/cnn': {
          target: 'http://rss.cnn.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/cnn/, ''),
        },
        // RSS Feeds - Hacker News
        '/rss/hn': {
          target: 'https://hnrss.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/hn/, ''),
        },
        // RSS Feeds - Ars Technica
        '/rss/arstechnica': {
          target: 'https://feeds.arstechnica.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/arstechnica/, ''),
        },
        // RSS Feeds - The Verge
        '/rss/verge': {
          target: 'https://www.theverge.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/verge/, ''),
        },
        // RSS Feeds - CNBC
        '/rss/cnbc': {
          target: 'https://www.cnbc.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/cnbc/, ''),
        },
        // RSS Feeds - MarketWatch
        '/rss/marketwatch': {
          target: 'https://feeds.marketwatch.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/marketwatch/, ''),
        },
        // RSS Feeds - Defense/Intel sources
        '/rss/defenseone': {
          target: 'https://www.defenseone.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/defenseone/, ''),
        },
        '/rss/warontherocks': {
          target: 'https://warontherocks.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/warontherocks/, ''),
        },
        '/rss/breakingdefense': {
          target: 'https://breakingdefense.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/breakingdefense/, ''),
        },
        '/rss/bellingcat': {
          target: 'https://www.bellingcat.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/bellingcat/, ''),
        },
        // RSS Feeds - TechCrunch (layoffs)
        '/rss/techcrunch': {
          target: 'https://techcrunch.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/techcrunch/, ''),
        },
        // Google News RSS
        '/rss/googlenews': {
          target: 'https://news.google.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/googlenews/, ''),
        },
        // AI Company Blogs
        '/rss/openai': {
          target: 'https://openai.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/openai/, ''),
        },
        '/rss/anthropic': {
          target: 'https://www.anthropic.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/anthropic/, ''),
        },
        '/rss/googleai': {
          target: 'https://blog.google',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/googleai/, ''),
        },
        '/rss/deepmind': {
          target: 'https://deepmind.google',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/deepmind/, ''),
        },
        '/rss/huggingface': {
          target: 'https://huggingface.co',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/huggingface/, ''),
        },
        '/rss/techreview': {
          target: 'https://www.technologyreview.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/techreview/, ''),
        },
        '/rss/arxiv': {
          target: 'https://rss.arxiv.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/arxiv/, ''),
        },
        // Government
        '/rss/whitehouse': {
          target: 'https://www.whitehouse.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/whitehouse/, ''),
        },
        '/rss/statedept': {
          target: 'https://www.state.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/statedept/, ''),
        },
        '/rss/state': {
          target: 'https://www.state.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/state/, ''),
        },
        '/rss/defense': {
          target: 'https://www.defense.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/defense/, ''),
        },
        '/rss/justice': {
          target: 'https://www.justice.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/justice/, ''),
        },
        '/rss/cdc': {
          target: 'https://tools.cdc.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/cdc/, ''),
        },
        '/rss/fema': {
          target: 'https://www.fema.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/fema/, ''),
        },
        '/rss/dhs': {
          target: 'https://www.dhs.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/dhs/, ''),
        },
        '/rss/fedreserve': {
          target: 'https://www.federalreserve.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/fedreserve/, ''),
        },
        '/rss/sec': {
          target: 'https://www.sec.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/sec/, ''),
        },
        '/rss/treasury': {
          target: 'https://home.treasury.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/treasury/, ''),
        },
        '/rss/cisa': {
          target: 'https://www.cisa.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/cisa/, ''),
        },
        // Think Tanks
        '/rss/brookings': {
          target: 'https://www.brookings.edu',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/brookings/, ''),
        },
        '/rss/cfr': {
          target: 'https://www.cfr.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/cfr/, ''),
        },
        '/rss/csis': {
          target: 'https://www.csis.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/csis/, ''),
        },
        // Defense
        '/rss/warzone': {
          target: 'https://www.thedrive.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/warzone/, ''),
        },
        '/rss/defensegov': {
          target: 'https://www.defense.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/defensegov/, ''),
        },
        // Security
        '/rss/krebs': {
          target: 'https://krebsonsecurity.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/krebs/, ''),
        },
        // Finance
        '/rss/yahoonews': {
          target: 'https://finance.yahoo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/yahoonews/, ''),
        },
        // Diplomat
        '/rss/diplomat': {
          target: 'https://thediplomat.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/diplomat/, ''),
        },
        // VentureBeat
        '/rss/venturebeat': {
          target: 'https://venturebeat.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/venturebeat/, ''),
        },
        // Foreign Policy
        '/rss/foreignpolicy': {
          target: 'https://foreignpolicy.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/foreignpolicy/, ''),
        },
        // Financial Times
        '/rss/ft': {
          target: 'https://www.ft.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/ft/, ''),
        },
        // Reuters
        '/rss/reuters': {
          target: 'https://www.reutersagency.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/rss\/reuters/, ''),
        },
        // Cloudflare Radar - Internet outages
        '/api/cloudflare-radar': {
          target: 'https://api.cloudflare.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/cloudflare-radar/, ''),
        },
        // NGA Maritime Safety Information - Navigation Warnings
        '/api/nga-msi': {
          target: 'https://msi.nga.mil',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/nga-msi/, ''),
        },
        // GDELT GEO 2.0 API - Global event data
        '/api/gdelt': {
          target: 'https://api.gdeltproject.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gdelt/, ''),
        },
        // AISStream WebSocket proxy for live vessel tracking
        '/ws/aisstream': {
          target: 'wss://stream.aisstream.io',
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/ws\/aisstream/, ''),
        },
        // FAA NASSTATUS - Airport delays and closures
        '/api/faa': {
          target: 'https://nasstatus.faa.gov',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/faa/, ''),
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.log('FAA NASSTATUS proxy error:', err.message);
            });
          },
        },
        // OpenSky Network - Aircraft tracking (military flight detection)
        '/api/opensky': {
          target: 'https://opensky-network.org/api',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/opensky/, ''),
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.log('OpenSky proxy error:', err.message);
            });
          },
        },
        // ADS-B Exchange - Military aircraft tracking (backup/supplement)
        '/api/adsb-exchange': {
          target: 'https://adsbexchange.com/api',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/adsb-exchange/, ''),
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.log('ADS-B Exchange proxy error:', err.message);
            });
          },
        },
      },
    },
  };
});
