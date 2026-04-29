---
project: SignalMap Standalone v2
artifact: phase-2-candidates
audience: post-v1 maintainer
date: 2026-04-29
input: docs/SignalMap/spec.md, docs/SignalMap/PROGRESS.md
---

# SignalMap v2 — Phase-2 Backlog

This is the carry-forward backlog from v1 (Phases 0–9). Items here were
explicitly deferred during v1 implementation: not bugs, not regressions,
just scope that v1 did not need to ship. None block v1 acceptance.

Each item below names a concrete trigger to act on it — don't pick from
this list arbitrarily. Wait for the trigger, then promote to a real
sprint backlog entry.

## 1. Spec-mandated Phase-2 features

These are explicitly named in `spec.md` line 494 as the Phase-2 backlog
the v1 spec carved out.

### 1.1 TimelineStrip (Row 5 of mockup)
- **What:** A horizontal time-axis strip showing event density over the last
  N hours, anchored below the LiveFeed. Mockup includes it as Row 5.
- **Why deferred:** v1 prioritised the map + feed + brief loop. TimelineStrip
  needs an aggregation query the API doesn't yet expose.
- **Trigger:** When users start asking "is this spike new or recurring?" —
  that is the question TimelineStrip answers.

### 1.2 Tweaks overlay
- **What:** A modal overlay exposing per-user toggles for cosmetic + behaviour
  preferences (animation rate, density, colour-blind palette, sound on alerts).
- **Why deferred:** Cosmetic-only; v1 ships with sensible defaults and
  `localStorage`-backed watchlist persistence already covers the high-value
  cases.
- **Trigger:** First user feedback that defaults conflict with their workflow.

### 1.3 Mobile layout
- **What:** Responsive layout for ≤768px viewports. v1 ships desktop-first
  (1440px reference) with the visual regression suite covering 1440 + a
  768px tablet golden but no phone goldens.
- **Why deferred:** Mobile rework needs to rethink the rail (drawer pattern)
  and the map zoom UX (44px touch is in place but feed/inspector layout
  cramps on phone widths).
- **Trigger:** When ZTNA mobile clients become a non-trivial slice of usage.

### 1.4 Brief history
- **What:** UI surface for prior brief snapshots — currently the BriefStrip
  only shows the latest cron-generated brief. A history pane would let
  users compare today's briefing against last week's.
- **Why deferred:** Requires retention strategy (Redis stores latest only)
  and a UI affordance the v1 mockup didn't include.
- **Trigger:** When ops asks "what did SignalMap say on the day of the
  outage?" Storage tier decision (Redis-list vs object store) blocks
  implementation.

### 1.5 Embeddable widget mode
- **What:** A `?widget=1` URL flag (or sub-path) that strips the chrome
  and renders just the map or just the BriefStrip, suitable for embedding
  in other dashboards / TVs.
- **Why deferred:** Needs a scope decision (fully iframe-isolated? same-
  origin SSO?) and a CSP relaxation for the embeddable origin.
- **Trigger:** First sales / partner ask for an iframe embed.

## 2. Forward-looking technical concerns

Items recorded during v1 phase reviews. Each is a *latent* hazard, not a
current bug. The "Trigger to act" column tells you when the dormant
concern flips to active.

| # | Concern | File(s) | Trigger to act |
|---|---------|---------|----------------|
| 2.1 | `@layer tokens, components, utilities;` declaration is buried inside `src/styles/tokens.css`. Per CSS Cascade L5 the order registers at first sight; if any future module imports `components.css` before `tokens.css`, the established order flips. | `src/styles/tokens.css:1`, `src/styles/components.css:1`, `src/app.tsx:1-2` | When new component CSS modules start importing tokens independently. Hoist the layer declaration to a dedicated `_layers.css` or inline at top of `app.tsx`. |
| 2.2 | `tsconfig.api.json` extends root and inherits `jsx: preserve` + `jsxImportSource: preact`. No `.tsx` exists under `api/` or `server/` today, so this is dormant. | `tsconfig.api.json:1-8`, `tsconfig.json:7-8` | First time a `.tsx` file lands under `api/` or `server/`. Add `jsx: react-jsx` + `jsxImportSource: react` override in `tsconfig.api.json` then. |
| 2.3 | OpenAPI ↔ UI type drift. `public/openapi.yaml` `SignalMapEvent` declares `severity: critical\|high\|medium\|low\|info` and `category: …\|supply_chain\|infrastructure`; UI `SignalEvent` (in `src/state/signals.ts`) uses `severity: critical\|major\|minor\|info`, `category: …\|supply\|infra`. `SignalMapSourceHealth` declares `status: ok\|degraded\|unavailable`; UI uses `ok\|degraded\|stale`. | `public/openapi.yaml`, `src/state/signals.ts:3-25`, `src/components/chrome/CommandBar.tsx:4-15`, `src/fixtures/signalmap.ts` | When the collector → Redis → API path is wired with real events. Decide: tighten the OpenAPI to match the UI, or relax the UI types to match the OpenAPI. |
| 2.4 | `MOCK_SOURCES` constant in `CommandBar.tsx` duplicates `SOURCE_HEALTH_FIXTURE.sources` in `fixtures/signalmap.ts`. The fixture endpoint `/api/signalmap/source-health` is wired but no UI code fetches it. | `src/components/chrome/CommandBar.tsx:4-15`, `src/fixtures/signalmap.ts:27-37` | When source-health pill needs to reflect real backend state. Delete `MOCK_SOURCES`, hydrate a `sourceHealth` signal in `main.tsx`. |
| 2.5 | `main.tsx` hydration replaces `signals.value` Map wholesale on a successful response. If fetched payload is empty or has different IDs than seed, an open Inspector loses its `selectedEventId`. | `src/main.tsx:13-25`, `src/components/inspector/Inspector.tsx:5-19` | First time the backend returns a payload that differs from the static fixture (live cron writes). Add a merge strategy or "stale" pill in Inspector when selected event no longer resolves. |
| 2.6 | `MapControls` reads `mc.minConfidence` without a guard; a partial persisted object renders `NaN%` and `checked={undefined}` checkboxes. The `persist()` shape validator (Phase 4 fix-worker) rejects wrong-top-level-shape values but accepts shape-matching objects with missing fields. | `src/components/rail/MapControls.tsx:12, 22-33`, `src/state/persist.ts` | When a new field is added to `MapControlsState`. Either bump the storage key version or shallow-merge persisted partial against defaults. |
| 2.7 | FeedCard click is not idempotent — same card twice does NOT toggle Inspector closed (`@preact/signals` bails on equal-value writes). Button has `aria-pressed`, which by ARIA contract implies a toggle. | `src/components/feed/FeedCard.tsx:31`, `src/components/inspector/Inspector.tsx:37` | If accessibility audit flags the `aria-pressed` toggle violation. Change `onClick` to `selectedEventId.value = isSelected ? null : event.id`. |
| 2.8 | Inspector remains open for an event whose category was deactivated in the rail. Map still resolves the id; only the *filter* changed. User has an inspector pinned to an event they cannot see in the feed. | `src/components/inspector/Inspector.tsx:4-19`, `src/components/feed/LiveFeed.tsx:6-9` | When a marker can be filtered out of the map but its inspector still open. Decide: auto-clear `selectedEventId` when category deactivates, or show a "filtered" banner. |
| 2.9 | Phase 4 spec checkpoint description says "SSE updates animate in (with mocked stream)" but no Phase 4 unit implements SSE. `src/state/sse.ts` (declared in spec line 107) does not exist; SSE was wired in Phase 6e via `addEventListener('brief-updated')` directly on the BriefStrip. | `docs/SignalMap/spec.md:443`, `src/components/chrome/BriefStrip.tsx` | If the spec is republished as a v2 reference, fold the SSE clause into Phase 6 or rewrite it. |
| 2.10 | `vite.config.ts` `signalmapFixturePlugin` lazy `await import('./src/fixtures/signalmap')` calls `next()` on import failure (instead of returning 500). Falls through to other middleware → eventually returns the SPA index, breaking `await res.json()` in tests with a confusing `SyntaxError`. | `vite.config.ts` (signalmapFixturePlugin block) | If a future contributor breaks `src/fixtures/signalmap.ts` and the failure mode is mis-attributed. Add an explicit 500 response with a body identifying the fixture module. |
| 2.11 | `RegionPicker` uses the same `data-testid` pattern (`signalmap-rail-region-${id}`) for both standard and cloud regions. No collision today (IDs disjoint), but cloud branch is hidden behind `<details>` and the e2e suite never exercises a cloud region. | `src/components/rail/RegionPicker.tsx:44, 60` | First time a region ID collides, or when watchlist halos for cloud regions need verification. Add an e2e test clicking a cloud region and asserting it lands in `localStorage.signalmap-watchlist-regions`. |
| 2.12 | Default categories list duplicated between `filters.ts` (bare strings) and `CategoryToggle.tsx` (with metadata). `toggleAll()` compares `length === CATEGORY_META.length`, which silently drifts if the two lists ever desync. | `src/state/filters.ts:7-10`, `src/components/rail/CategoryToggle.tsx:6-19` | When category metadata needs to be referenced outside `CategoryToggle.tsx`. Export a single `CATEGORIES` const from `filters.ts` (or a new `categories-meta.ts`) and have all consumers import from it. |

## 3. Spec amendments deferred from Phase 6.5

These are spec-text issues spotted during Phase 6.5 hardening. Code is
internally consistent; the spec needs a touch-up if it's republished.

| # | Item | Resolution |
|---|------|------------|
| 3.1 | Gate-command typo: spec references `brief-stampede` but the file landed as `brief-per-event-stampede.test.mjs`. | Update spec line referencing the gate command. |
| 3.2 | Duplicate budget env var: `SIGNALMAP_BRIEF_RATE_LIMIT_PER_MIN` / `_PER_DAY` / `_LOCK_TIMEOUT_SECONDS` / `_STAMPEDE_POLL_MS` / `_DAILY_LLM_BUDGET_USD` declared twice in spec env table. | De-dup the env table. |
| 3.3 | Unused env vars: several `SIGNALMAP_BRIEF_*` knobs were defined in spec but never wired in code (rate-limit-per-min, stampede-poll-ms). | Either wire them or drop from spec. |
| 3.4 | Error-shape divergence: spec describes `{disabled, reason}` for the brief endpoints; codebase ships `{error: {code}}` (consistent with the Phase 3 stream handler). | Reconcile spec or accept divergence + amend spec. |

## 4. Closed during v1 (no longer in backlog)

For audit clarity, items previously flagged as deferred but resolved in v1:

- Per-event synthesis call wire-up — closed in Phase 6.5 (`src/server/lib/per-event-synth.ts`).
- Perplexity 5xx → fallback — closed in Phase 6.5 (`scripts/brief-cron.mjs`).
- Cost-refund usage-delta — closed in Phase 6.5.
- IP rate-limit-behind-proxy — closed in Phase 6.5 (`src/server/lib/client-ip.ts` with `TRUSTED_PROXY` env gate).
- `signalmap.brief.*` metrics — closed in Phase 6.5 (`src/server/lib/metrics.ts`).
- BriefStrip cross-tab admin-token storage listener — closed in Phase 6.5.
- AbortSignal plumbing in cron — closed in Phase 6.5.
- `extractHost` protocol filter — closed in Phase 6.5 (defense-in-depth).
- Bidi/zero-width strip in XML escape — closed in Phase 6.5.
- Spend-key TTL — closed in Phase 6.5 (7-day TTL armed on first incrByFloat).
- BriefSchema 1-7 vs prompt 3-5 buffer — closed in Phase 6.5 via separate `PerEventBriefSchema`.
