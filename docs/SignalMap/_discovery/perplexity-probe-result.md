# Perplexity Sonar Pro — Discovery Probe Result (Unit 0a)

- **Date**: 2026-04-26
- **API endpoint**: `https://api.perplexity.ai/chat/completions`
- **Model probed**: `sonar-pro`
- **Auth**: Bearer token (`pplx-…`) in `Authorization` header

---

## 20-Domain Probe (`perplexity-probe-raw.json`)

- **HTTP status**: `200 OK`
- **Body size**: 1,332 bytes
- **Verifier**: `PASS — Perplexity Sonar Pro shape verified.` (exit 0)

### Top-level response keys (in order returned)

```
id, model, created, usage, citations, search_results, object, choices
```

| Key | Type | Notes |
|-----|------|-------|
| `id` | string | UUID — `d715bf82-ec74-4f5b-a845-45c478ac8905` |
| `model` | string | `sonar-pro` (echoes request) |
| `created` | number | Unix epoch seconds — `1777247629` |
| `object` | string | `chat.completion` (OpenAI-compatible) |
| `choices` | array | Length 1; standard chat-completion shape with `index`, `message{role,content}`, `delta{role,content}`, `finish_reason` |
| `usage` | object | See pricing section below |
| `citations` | array | **Top-level**, NOT inside `choices[0]`. Empty `[]` in this run (model returned "no incidents in the last hour"). |
| `search_results` | array | **Top-level**, separate from `citations`. Empty `[]` in this run. |

### `choices[0]` shape

```jsonc
{
  "index": 0,
  "message": { "role": "assistant", "content": "<838 chars of prose>" },
  "delta":   { "role": "assistant", "content": "" },
  "finish_reason": "stop"
}
```

`delta` is present but empty (artifact of streaming-compatible schema). For non-streaming requests we should read `message.content`, not `delta.content`.

### `citations` / `search_results` shape

Both arrays were empty in this run because Perplexity legitimately found nothing within the last-hour window matching the query. **We did not observe the populated shape on this probe.** Documentation and prior community reports indicate:

- `citations`: array of URL strings (e.g. `["https://reuters.com/...", ...]`)
- `search_results`: array of objects with `title`, `url`, `date` (and possibly `snippet`)

**The verifier accepts `citations` at top level OR at `choices[0].citations`.** This run confirms top-level placement. If we want assurance on populated-array shape, we should re-probe with a wider recency filter (`day` or `week`) — recommend the next worker do this before locking in the spec contract.

---

## 21-Domain Probe (`perplexity-probe-21-domains-raw.json`)

- **HTTP status**: `400 Bad Request`
- **Body size**: 135 bytes
- **Behavior**: Hard reject — server does NOT silently truncate to 20

### Exact error body

```json
{
  "error": {
    "message": "Validation error: search_domain_filters has a max length of 20",
    "type": "invalid_search_domain_filter",
    "code": 400
  }
}
```

**Verdict**: 20-domain cap is enforced server-side as a hard validation. Our brief backend MUST cap `search_domain_filter` at 20 entries before sending — there is no graceful degradation. Recommend client-side validation that throws (or trims with a logged warning) at exactly 20.

---

## Pricing fields surfaced (`usage`)

The Sonar Pro response includes a richer `usage` object than vanilla OpenAI chat completions:

```json
{
  "prompt_tokens": 18,
  "completion_tokens": 170,
  "total_tokens": 188,
  "search_context_size": "low",
  "cost": {
    "input_tokens_cost":  0.00005,
    "output_tokens_cost": 0.00255,
    "request_cost":       0.006,
    "total_cost":         0.0086
  }
}
```

Observations:

- `cost.total_cost = 0.0086` USD for one minimal probe (~$0.0086 / call).
- `request_cost: 0.006` is a fixed per-request charge (the per-search component for Sonar Pro). This dominates over token cost for short briefs.
- `search_context_size: "low"` is an echoed setting — defaults to `"low"` when not specified. Perplexity supports `low | medium | high` per docs. Higher values increase cost but improve grounding.
- Token costs roughly back-calculate to: input ~$2.78/Mtok, output ~$15.00/Mtok — consistent with Perplexity's published Sonar Pro pricing ($3/Mtok input, $15/Mtok output, $5/1k requests).
- **For brief budgeting**: assume ~$0.008–$0.015 per brief at default `search_context_size=low` and `max_tokens=200–500`. Higher `max_tokens` and `search_context_size=medium/high` will scale this up.

---

## Recency filter behavior

Used `search_recency_filter: "hour"`. Model returned:

> "No major cybersecurity incidents were reported in the last hour (10:53 PM to 11:53 PM UTC on April 26, 2026)."

The model both honored the filter AND echoed the time window. We cannot independently verify date-stamps on citations because `citations` and `search_results` came back empty. Recommend re-probing with `recency=day` or `recency=week` to (a) confirm citation date metadata format, (b) sanity-check that returned URLs actually fall within the requested window.

Documented recency values per Perplexity docs: `hour | day | week | month | year`.

---

## Verdict — Spec alignment

The Perplexity Sonar Pro response shape **matches** what `docs/SignalMap/spec.md §Brief Backend` and `docs/SignalMap/design-summary.md` assume, with the following clarifications/amendments needed:

### Confirmed assumptions

1. OpenAI-compatible chat-completion envelope (`choices[0].message.content` for prose).
2. `search_domain_filter` cap is exactly **20** — hard server-side validation, returns HTTP 400 on overflow with `type: "invalid_search_domain_filter"`.
3. `search_recency_filter` accepts `hour` (and is honored).
4. `usage.{prompt_tokens, completion_tokens, total_tokens}` present and numeric.

### Spec amendments recommended

1. **Citations location**: `citations` is at the **top level** of the response, NOT nested inside `choices[0]`. Spec should pin this. The verifier accepts both for safety, but the implementation should read `r.citations` first.
2. **`search_results` is a separate top-level array** distinct from `citations`. If the brief UI wants titles/dates, we need `search_results[i].title` / `.url` / `.date` — not the bare URL strings in `citations`. Spec should clarify which one feeds the citation chips.
3. **Pricing telemetry**: `usage.cost.{input_tokens_cost, output_tokens_cost, request_cost, total_cost}` is present and should be persisted per-brief for cost tracking. Spec currently doesn't mention these fields. Recommend logging `total_cost` to the brief metadata table.
4. **`search_context_size`**: defaults to `"low"`. Spec should explicitly set this (or document the default) and consider `medium` for higher-value briefs. This is a cost lever.
5. **Empty-array case**: `citations` and `search_results` can BOTH come back as `[]` even on HTTP 200 — when the recency filter window genuinely yields nothing. Brief UI must handle "no citations" gracefully (model prose only). Spec should call this out.
6. **Cap enforcement**: backend MUST validate `search_domain_filter.length <= 20` BEFORE calling Perplexity. Returning a 400 from upstream as a 500 to the user is bad UX.

### Open questions for next discovery unit

- What does a populated `citations` / `search_results` look like? (Re-probe with `recency=day`.)
- Does `search_context_size: "high"` materially change quality vs cost for our use case?
- Does `return_images: true` or `return_related_questions: true` add anything we want?

---

## Files produced by this unit

- `docs/SignalMap/_discovery/perplexity-probe.json` — request body (20 domains)
- `docs/SignalMap/_discovery/perplexity-probe-raw.json` — 200 OK response
- `docs/SignalMap/_discovery/perplexity-probe-21-domains-raw.json` — 400 error body
- `docs/SignalMap/_discovery/perplexity-probe-result.md` — this document
- `scripts/verify-perplexity-shape.mjs` — assertion script (passes, exit 0)

## Test gate

```
$ node scripts/verify-perplexity-shape.mjs docs/SignalMap/_discovery/perplexity-probe-raw.json
PASS — Perplexity Sonar Pro shape verified.
  model: sonar-pro
  choices[0].message.content: 838 chars
  usage: prompt=18 completion=170 total=188
  citations: 0 entries
EXIT_CODE=0
```
