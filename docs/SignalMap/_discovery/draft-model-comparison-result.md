# Draft Model Comparison — Nemotron vs Kimi K2.6 (both moderated by Gemini 3.1 Pro)

Date: 2026-04-27T01:00:45.758Z
Test wall-clock total: 118679 ms (parallel both pipelines)
Input: realistic SignalMap brief context — Cloudflare 502 routing change, ransomware Eastern Europe, Microsoft 365 EU auth delays, plus 5 local signals (CF Radar PK anomaly, Okta global, Azure EU, ransomware HN, Citrix NetScaler 0day).

---

## Pipeline A: Nemotron-3-super-120b-a12b → Gemini 3.1 Pro

### Stage 1 — DRAFT (`nvidia/nemotron-3-super-120b-a12b`)
- Latency: **754 ms**
- Tokens: 847 prompt / 1200 completion
- Cost: **$0.000616**

```json
(no content)
```

### Stage 2 — MODERATE (`google/gemini-3.1-pro-preview`)
- Latency: **2139 ms**
- Tokens: 825 prompt / 1196 completion
- Cost: **$0.016002**

```json
{
  "bullets": [
    "Cloudflare resolved Workers 502 errors occurring between 14:20 and 14:38 UTC caused by a routing change in the LHR PoP.",
```

**Pipeline A total: $0.016618 • sequential latency 2893 ms**

---

## Pipeline B: Kimi K2.6 → Gemini 3.1 Pro

### Stage 1 — DRAFT (`moonshotai/kimi-k2.6`)
- Latency: **34553 ms**
- Tokens: 760 prompt / 1200 completion
- Cost: **$0.006152**

```json
(no content)
```

### Stage 2 — MODERATE (`google/gemini-3.1-pro-preview`)
- Latency: **3165 ms**
- Tokens: 825 prompt / 1196 completion
- Cost: **$0.016002**

```json
**Construct JSON:**
    ```json
    {
      "bullets": [
        "Cloudflare resolved Workers 502 errors occurring between 14:20 and 14:38 UTC,
```

**Pipeline B total: $0.022154 • sequential latency 37718 ms**

---

---

## Pipeline C: Gemini 3.1 Pro single-pass (no draft, no moderate — direct synthesis)

### Single call (`google/gemini-3.1-pro-preview`)
- Latency: **2790 ms**
- Tokens: 865 prompt / 1196 completion
- Cost: **$0.016082**

```json
 (22 words)
    *   *Bullet 3 (Okta - Global):* Okta reports elevated sign-in error rates globally over the past 32 minutes, potentially impacting users across monitored regions.
```

**Pipeline C total: $0.016082 • single-call latency 2790 ms**

---

## Side-by-side summary (3-way)

| Metric | A (Nemotron→Gemini) | B (Kimi→Gemini) | C (Gemini single) |
|--------|---------------------|------------------|--------------------|
| Calls per brief     | 2 | 2 | 1 |
| Draft cost          | $0.000616 | $0.006152 | n/a |
| Moderate / final cost | $0.016002 | $0.016002 | $0.016082 |
| **Total per brief** | **$0.016618** | **$0.022154** | **$0.016082** |
| Sequential latency  | 2893 ms | 37718 ms | 2790 ms |
| $5/day capacity     | 300 briefs/day | 225 briefs/day | 310 briefs/day |
| Cost vs C baseline  | 1.03× | 1.38× | 1.00× (baseline) |

## Verdict (manual review required)

Compare the two final (Stage 2) outputs above. The cost data is mechanical; the quality call is yours.
Look for:
1. Factual accuracy — does either final brief invent details not in retrieved_context / local_signals?
2. Coverage — does either drop important signals (e.g., the Citrix 0day)?
3. Tightness — bullets ≤ 25 words, no hedging?
4. Citation discipline — outlets named correctly, no URLs in prose?
5. Whether Kimi's premium draft produces a meaningfully better final after Gemini's polish — or whether Gemini's polish makes the draft quality near-irrelevant.
