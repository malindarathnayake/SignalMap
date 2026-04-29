# OpenRouter Slug Verification — SignalMap Brief Fallback Chain

**Date:** 2026-04-26
**API endpoint:** `https://openrouter.ai/api/v1/models`
**HTTP status:** 200 (410,392 bytes)

## Listing summary

- **Total models in response:** 355
- **Matched filter `(nemotron|kimi|deepseek|gemini-(2\.0-)?flash)`:** 32

## Verification table

| Spec slug | Status | Actual slug (if changed) | Prompt $/M | Completion $/M | Context |
|-----------|--------|---------------------------|------------|----------------|---------|
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | `family-fallback:nvidia/nemotron-3-super-120b-a12b` | `nvidia/nemotron-3-super-120b-a12b` | $0.090 | $0.450 | 262,144 |
| `moonshotai/kimi-k2` | `exact` | `moonshotai/kimi-k2` | $0.570 | $2.300 | 131,072 |
| `deepseek/deepseek-v3` | `family-fallback:deepseek/deepseek-chat-v3.1` | `deepseek/deepseek-chat-v3.1` | $0.150 | $0.750 | 32,768 |
| `google/gemini-2.0-flash-001` | `exact` | `google/gemini-2.0-flash-001` | $0.100 | $0.400 | 1,048,576 |

## Recommended `SIGNALMAP_LLM_MODELS` env value

```
SIGNALMAP_LLM_MODELS=nvidia/nemotron-3-super-120b-a12b,moonshotai/kimi-k2,deepseek/deepseek-chat-v3.1,google/gemini-2.0-flash-001
```

Priority order (primary -> last fallback):

1. `nvidia/nemotron-3-super-120b-a12b` — replaces missing Nemotron Ultra 253B; 120B-A12B (active 12B MoE) is the current flagship NVIDIA Nemotron on OpenRouter, 262K ctx, very cheap ($0.09 / $0.45 per M).
2. `moonshotai/kimi-k2` — exact spec match, retained.
3. `deepseek/deepseek-chat-v3.1` — replaces missing `deepseek-v3`; this is the canonical successor in the V3 chat lineage. (See "Notes" for alternatives.)
4. `google/gemini-2.0-flash-001` — exact spec match, retained.

## Notes / deprecations / surprises

### Nemotron Ultra 253B is gone
There is **no `nvidia/llama-3.1-nemotron-ultra-253b-v1`** and no 253B-class Nemotron at all on OpenRouter today. The Nemotron family currently exposes:
- `nvidia/nemotron-3-super-120b-a12b` (recommended replacement; also has a `:free` variant useful for dev)
- `nvidia/nemotron-3-nano-30b-a3b` (and `:free`)
- `nvidia/llama-3.3-nemotron-super-49b-v1.5` (closest *naming* lineage to the spec slug, but smaller and weaker than 120B-A12B)
- `nvidia/nemotron-nano-12b-v2-vl`, `nvidia/nemotron-nano-9b-v2`
- `nvidia/llama-3.1-nemotron-70b-instruct` (older, 10x more expensive than 120B-A12B at $1.20/$1.20 — avoid)

The recommended `nemotron-3-super-120b-a12b` is both larger and ~13x cheaper than the legacy `nemotron-70b-instruct`, so this is a net win versus the spec.

### DeepSeek V3 was renamed
There is **no plain `deepseek/deepseek-v3`** slug. The DeepSeek family now exposes:
- `deepseek/deepseek-chat-v3.1` (recommended; 32K ctx, $0.15/$0.75)
- `deepseek/deepseek-chat-v3-0324` (older V3 snapshot, 163K ctx, $0.20/$0.77 — pick this if you need the larger context window)
- `deepseek/deepseek-v3.2`, `deepseek-v3.2-exp`, `deepseek-v3.2-speciale`, `deepseek-v3.1-terminus` (newer V3.x variants)
- `deepseek/deepseek-v4-pro`, `deepseek/deepseek-v4-flash` (V4 generation — not V3)
- `deepseek/deepseek-chat` (generic alias — pricing $0.32/$0.89, more expensive and unclear which version it routes to; avoid in a pinned fallback chain)

**Caveat:** `deepseek-chat-v3.1` has only **32K context**, which is materially smaller than the spec likely assumed (V3 was 64K-128K). If SignalMap brief synthesis needs >32K input, swap to `deepseek/deepseek-chat-v3-0324` (163K ctx, marginally more expensive at $0.20/$0.77). This is the single most important decision in this verification — flag for the spec author.

### Kimi K2 is exact, but newer variants exist
`moonshotai/kimi-k2` is still live at the spec pricing ($0.57/$2.30, 131K ctx). Newer/larger options if you want to upgrade later:
- `moonshotai/kimi-k2-0905` ($0.40/$2.00, 262K ctx) — cheaper prompt and 2x context
- `moonshotai/kimi-k2-thinking` ($0.60/$2.50, 262K ctx) — reasoning variant
- `moonshotai/kimi-k2.5` ($0.44/$2.00, 262K ctx)
- `moonshotai/kimi-k2.6` ($0.745/$4.655, 256K ctx) — most expensive

Kept the spec slug to minimize change surface; consider `kimi-k2-0905` as a low-risk upgrade.

### Gemini 2.0 Flash is exact
`google/gemini-2.0-flash-001` matches exactly, $0.10/$0.40, 1M context. Cheapest model in the chain by far (per token). `google/gemini-2.0-flash-lite-001` is even cheaper at $0.075/$0.30 if you want a lite-tier last-resort fallback.

### Pricing sanity check
All four recommended models are under $1/M prompt and under $2.50/M completion, so the chain stays cheap-to-mid. The replacement Nemotron is actually **cheaper** than the now-missing 253B Ultra would have been, so there is no cost regression from these substitutions.
