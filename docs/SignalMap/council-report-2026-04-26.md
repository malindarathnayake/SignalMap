---
project: SignalMap Standalone v2
artifact: architecture-council-report
date: 2026-04-26
arbiter: malinda@fleetcam.com
outcome: ship-with-amendments (9 amendments accepted in full)
amends: docs/SignalMap/design-summary.md
---

# Architecture Council Report — SignalMap Standalone v2

**Question:** Validate `docs/SignalMap/design-summary.md` (initial draft) and surface what was wrong, weak, missed, or oversimplified. Push back hard.

**Advisors:**
- Codex CLI — `gpt-5.5`, `reasoning.effort=high`, `hide_agent_reasoning=true`
- Gemini CLI — `gemini-3-pro-preview` via `arch-review` alias (temperature=0.3, topP=0.85, topK=40)
- Claude Opus 4.7 — moderator

**Rounds:** 1 (cross-exam skipped — both reached "ship with amendments" with one focused disagreement, sufficient for arbiter decision)

**Outcome:** Design summary revised in-place to incorporate all 9 amendments. Ready for spec generation.

---

## Per-Item Verdicts

| # | Focus | Codex (gpt-5.5) | Gemini (3 Pro) | Convergent? |
|---|-------|-----------------|----------------|-------------|
| 1 | UI runtime | KEEP `signals-core`, ADD lifecycle contract | SWITCH to Preact + JSX | **NO** (resolved by arbiter → Preact) |
| 2 | Map renderer | SVG + amend (viewport math, touch hit areas, single transform) | SVG + amend (`d3-geo` + `d3-zoom`) | YES (combined: SVG + d3-geo + d3-zoom + viewport math + 44px touch) |
| 3 | SSE | Amend: heartbeats, X-Accel-Buffering, replay ring, jitter | Amend: HTTP/2, jitter | YES (combined: all of the above) |
| 4 | LLM brief | DISAGREE — design budget-unsafe, allowlist exceeds 20-cap, atomic spend reservation needed, citations hostile | Amend: SETNX stampede lock, XML-wrap citations | YES (combined: 20-cap + SETNX + atomic reservation + XML wrap + cite revalidation + schema validation) |
| 5 | Container topology | Amend: build adapter first, drop @upstash/redis | DISAGREE: @upstash/redis HTTP-only, use ioredis | YES (combined: ioredis adapter built first, then drop redis-rest) |
| 6 | Legacy archival | DISAGREE: git tag/branch + import guard | DISAGREE: git branch, delete from main | YES (both reject in-tree `.legacy/`) |
| 7 | API client | Amend: openapi-fetch alone insufficient; need contract test + canonical base URL + generated spec | Amend: code-first via zod-openapi or ts-rest | YES (combined: code-first generation + canonical getApiBaseUrl + contract test) |
| 8 | Phase ordering | DISAGREE: container topology FIRST, archival LAST | DISAGREE: container topology to Phase 3 | YES (both: container topology earlier, archival last) |
| Bonus | Perplexity schema deferral | BLOCK — already conflicts with docs (20-cap) | BLOCK — verify now | YES (Phase 0 prerequisite) |

---

## Key Disagreement (resolved by arbiter)

**Item 1 — UI runtime**

- **Codex position**: keep vanilla TS class components + `@preact/signals-core`. Evidence: existing 4 SignalMap components (`SignalMapShell.ts`, `SignalMapFeed.ts`, `SignalMapInspector.ts`, `SignalMapStatusStrips.ts`) are class-based vanilla TS. Switching to Preact forces a rewrite. Add a formal lifecycle contract (`mount`/`dispose`/`disposers`/`watch`/`batch`) to mitigate leak risk.
- **Gemini position**: switch to Preact + JSX. Evidence: mockup at `docs/SignalMap/Claude_Design/` is 650+ lines of clean React hooks JSX. Vanilla-TS port discards usable code; manual `effect → DOM mutation` is leak-prone; Preact built-in `useEffect` cleanup eliminates the lifecycle gotcha.
- **Moderator analysis**: trade-off is between preserving Codex's 4 existing components (~1-2 days rewrite) vs faster development on the ~8 new components (CommandBar, RadarStrip, ProviderStrip, BriefStrip, LeftRail, WorldMap, LiveFeed, Inspector) where JSX-direct adoption saves ~4-5 days. Net: Preact wins on total effort even with the rewrite cost, AND eliminates the lifecycle leak risk for free.
- **Arbiter decision**: Preact + JSX with `@preact/signals` (Gemini's position).

---

## Council-Verified Issues in Initial Draft

- **[FACTUAL ERROR]** Initial allowlist of 35 domains exceeds Perplexity Sonar `search_domain_filter` documented cap of 20. Source: https://docs.perplexity.ai/docs/sonar/filters (Codex citation).
- **[MISSING EVIDENCE]** Initial design claimed `@upstash/redis` could be used "against direct connection". Codex grep of `server/_shared/redis.ts` confirms existing code uses HTTP `fetch(${url}/get/...)` against `UPSTASH_REDIS_REST_URL` envs — `@upstash/redis` is REST-only.
- **[OVER-ENGINEERING]** signals-core lifecycle was undescribed; both councilors flagged the leak risk independently.
- **[SECURITY GAP]** Prompt injection from Perplexity citations into Nemotron output was not in the initial threat model.
- **[ORDERING BUG]** Initial Phase 1 (`.legacy` move) → Phase 2 (strip variant) created a guaranteed broken-build window because variant code is still imported from main code at the moment it lands in `.legacy/`.

---

## 9 Amendments Accepted (per arbiter, 2026-04-26)

1. **Phase 0 prerequisites** — Perplexity Sonar Pro discovery curl + docs verification, OpenRouter slug confirmation, Redis adapter contract design, import graph audit, legacy panel docs, kill-list sign-off. (Was: deferred to Phase 4.)
2. **Drop `.legacy/` in-tree archive** — replace with `archive/v1-legacy` git branch + CI import-guard test. In-tree only `docs/SignalMap/LegacyPanels.md` documents revival contracts.
3. **Standardize on `ioredis`** — drop `@upstash/redis` entirely. Build Redis adapter (`getJson`/`setJsonEx`/`pipeline`/`setNx`/`incrByFloat`/optional pubsub) FIRST, then remove `redis-rest`.
4. **LLM brief hardening** — (a) allowlist ≤20 domains; (b) Redis `SET NX EX` singleflight lock against stampede; (c) atomic spend reservation (decrement before, refund with usage delta after); (d) wrap Perplexity output in `<retrieved_context>` XML tags; (e) strict zod output schema validation on synthesis; (f) URL re-validation on returned citations against allowlist.
5. **SSE production hardening** — heartbeats every 20s, `X-Accel-Buffering: no` + `Cache-Control: no-cache, no-transform`, server-sent `retry:` with jitter, **Redis-backed replay ring with monotonic event IDs**, HTTP/2 mandated at nginx.
6. **Map hardening** — `d3-geo.geoEquirectangular()` projection, `d3-zoom` single transform group for pan/touch, viewport math handles non-2:1 containers, 44px touch hit areas.
7. **API client** — `openapi-fetch` consuming a code-first generated OpenAPI spec (`zod-openapi` or `ts-rest` from route schemas) + canonical `getApiBaseUrl()` with explicit normalization + contract test asserting no `/api/ws/api` paths.
8. **UI runtime** — Preact + JSX with `@preact/signals` (~5KB total runtime). Mockup ports directly; Codex's 4 existing components rewritten in Preact one-time.
9. **Phase plan reordered** — Phase 0 Discovery → 1 Minimal Standalone Entry → 2 Redis Adapter + Container Topology → 3 API Contract + Client + SSE Replay → 4 Frontend Shell against Mocked APIs → 5 SVG Map → 6 Brief Backend (with all hardening) → 7 Strip Variant System → 8 Minimal Rename → 9 Archive Legacy + Phase-2 Backlog.

---

## Rejected Ideas (both councilors agreed)

| Idea | Why rejected |
|------|--------------|
| MapLibre GL JS | Both: unjustified for tens-to-hundreds of low-rate markers; bundle cost not earned |
| WebSocket for realtime | Both: SSE handles read-only fine; WebSocket adds frame protocol cost for zero benefit |
| Polling | Both: worse freshness, wastes bandwidth |
| In-tree `.legacy/` archive | Both: rots, gets dragged in via live imports, broken-build window |
| Hand-maintained OpenAPI spec | Both: drift inevitable; need code-first or contract-tested |
| Deferring Perplexity schema verification | Both: design already conflicts with published docs; verify in Phase 0 |
| Per-IP rate limit alone | Both: insufficient (IPv6 rotation, concurrent stampede) — needs Redis SETNX + atomic spend reservation |

---

## Disposition

The amendments are reflected in the canonical `docs/SignalMap/design-summary.md` (revision dated 2026-04-26, status `design-complete (council-amended)`). Spec generation may proceed.
