# Real-Workflow Brief Test — 3 Models on Live SignalMap Inputs

Date: 2026-04-27T01:24:33.310Z
Total wall-clock: 10581ms (1905ms ingest + 8676ms model calls)

## Inputs (pulled live)

| Source | Events | Latency | Status |
|--------|--------|---------|--------|
| Cloudflare Radar | 2 | 589ms | ok |
| Perplexity Sonar Pro | 0 citations | 1860ms | ok ($0.0075) |
| cloudflare_status | 0 | 246ms | ERR: Entity expansion limit exceeded: 1014 > 1000 |
| okta_status | 0 | 180ms | ERR: HTTP 401 |
| m365_status | 0 | 657ms | ok |
| azure_status | 0 | 539ms | ok |
| wasabi_status | 0 | 649ms | ERR: Entity expansion limit exceeded: 1045 > 1000 |
| thehackernews | 5 | 586ms | ok |
| bleepingcomputer | 5 | 524ms | ok |
| krebsonsecurity | 5 | 560ms | ok |

**Aggregate**: 17 raw → 17 deduped (capped at 25)
**Prompt size**: 4649 chars (~1162 tokens)

## Perplexity context (fed to LLM)

```
{
  "results_found": 0,
  "items": [],
  "summary": "No matching results in the configured domains for this window."
}
```



## Local signals (deduped, fed to LLM)

```json
[
  {
    "source": "cloudflare_radar",
    "category": "internet",
    "title": "PLATFORM — unknown",
    "severity": "medium",
    "startedAt": "2026-03-31T08:00:00Z",
    "endedAt": null,
    "region": "unknown",
    "description": "Iranian strikes on AWS data centers"
  },
  {
    "source": "cloudflare_radar",
    "category": "internet",
    "title": "NATIONWIDE — unknown",
    "severity": "medium",
    "startedAt": "2026-02-28T07:00:00Z",
    "endedAt": null,
    "region": "unknown",
    "description": "Iran Internet shutdown amid military actions"
  },
  {
    "source": "thehackernews",
    "category": "cyber",
    "title": "Researchers Uncover Pre-Stuxnet ‘fast16’ Malware Targeting Engineering Software",
    "startedAt": "Sat, 25 Apr 2026 14:56:00 +0530"
  },
  {
    "source": "thehackernews",
    "category": "cyber",
    "title": "CISA Adds 4 Exploited Flaws to KEV, Sets May 2026 Federal Deadline",
    "startedAt": "Sat, 25 Apr 2026 10:38:00 +0530"
  },
  {
    "source": "thehackernews",
    "category": "cyber",
    "title": "FIRESTARTER Backdoor Hit Federal Cisco Firepower Device, Survives Security Patches",
    "startedAt": "Fri, 24 Apr 2026 22:36:00 +0530"
  },
  {
    "source": "thehackernews",
    "category": "cyber",
    "title": "NASA Employees Duped in Chinese Phishing Scheme Targeting U.S. Defense Software",
    "startedAt": "Fri, 24 Apr 2026 19:43:00 +0530"
  },
  {
    "source": "thehackernews",
    "category": "cyber",
    "title": "Bridging the AI Agent Authority Gap: Continuous Observability as the Decision Engine",
    "startedAt": "Fri, 24 Apr 2026 17:19:00 +0530"
  },
  {
    "source": "bleepingcomputer",
    "category": "cyber",
    "title": "American utility firm Itron discloses breach of internal IT network",
    "startedAt": "Sun, 26 Apr 2026 10:22:34 -0400"
  },
  {
    "source": "bleepingcomputer",
    "category": "cyber",
    "title": "Microsoft rolls out revamped Windows Insider Program",
    "startedAt": "Sat, 25 Apr 2026 13:07:13 -0400"
  },
  {
    "source": "bleepingcomputer",
    "category": "cyber",
    "title": "Threat actor uses Microsoft Teams to deploy new “Snow” malware",
    "startedAt": "Sat, 25 Apr 2026 11:07:44 -0400"
  },
  {
    "source": "bleepingcomputer",
    "category": "cyber",
    "title": "ADT confirms data breach after ShinyHunters leak threat",
    "startedAt": "Fri, 24 Apr 2026 18:53:14 -0400"
  },
  {
    "source": "bleepingcomputer",
    "category": "cyber",
    "title": "Firestarter malware survives Cisco firewall updates, security patches",
    "startedAt": "Fri, 24 Apr 2026 16:34:08 -0400"
  },
  {
    "source": "krebsonsecurity",
    "category": "cyber",
    "title": "&#8216;Scattered Spider&#8217; Member &#8216;Tylerb&#8217; Pleads Guilty",
    "startedAt": "Tue, 21 Apr 2026 14:53:59 +0000"
  },
  {
    "source": "krebsonsecurity",
    "category": "cyber",
    "title": "Patch Tuesday, April 2026 Edition",
    "startedAt": "Tue, 14 Apr 2026 21:47:59 +0000"
  },
  {
    "source": "krebsonsecurity",
    "category": "cyber",
    "title": "Russia Hacked Routers to Steal Microsoft Office Tokens",
    "startedAt": "Tue, 07 Apr 2026 17:02:44 +0000"
  },
  {
    "source": "krebsonsecurity",
    "category": "cyber",
    "title": "Germany Doxes &#8220;UNKN,&#8221; Head of RU Ransomware Gangs REvil, GandCrab",
    "startedAt": "Mon, 06 Apr 2026 02:07:17 +0000"
  },
  {
    "source": "krebsonsecurity",
    "category": "cyber",
    "title": "&#8216;CanisterWorm&#8217; Springs Wiper Attack Targeting Iran",
    "startedAt": "Mon, 23 Mar 2026 15:43:04 +0000"
  }
]
```

---

## Model outputs

### google/gemini-3-flash-preview

- Latency: **1297 ms**
- Tokens: 1731 prompt / 148 completion (finish: stop)
- Cost: **$0.001309**

```json
{
  "bullets": [
    "Cloudflare Radar reports Iranian strikes targeting AWS data centers and a nationwide internet shutdown amid escalating military actions.",
    "The Hacker News reports Firestarter malware successfully persists on Cisco Firepower devices despite security patches and firmware updates.",
    "BleepingComputer confirms threat actors are utilizing Microsoft Teams to deploy new Snow malware across corporate environments.",
    "CISA added four exploited vulnerabilities to its Known Exploited Vulnerabilities catalog with a federal remediation deadline of May 2026.",
    "American utility firm Itron and security provider ADT both disclosed internal IT network breaches following recent cyberattacks, per BleepingComputer."
  ],
  "warnings": []
}
```

### anthropic/claude-sonnet-4.6

- Latency: **1833 ms**
- Tokens: 1748 prompt / 295 completion (finish: stop)
- Cost: **$0.009669**

```json
```json
{
  "bullets": [
    "Itron, a U.S. utility firm, confirmed a breach of its internal IT network, reported by BleepingComputer within the last 24 hours.",
    "FIRESTARTER backdoor persists on federal Cisco Firepower devices, surviving patches; confirmed by BleepingComputer and The Hacker News.",
    "CISA added 4 actively exploited flaws to KEV with a May 2026 federal remediation deadline, per The Hacker News.",
    "Microsoft Teams weaponized to deliver new 'Snow' malware, posing risk to M365 environments per BleepingComputer.",
    "Cloudflare Radar signals show ongoing Iran internet shutdown and reported strikes on AWS infrastructure; region metadata unresolved."
  ],
  "warnings": [
    "Two Cloudflare Radar signals carry unknown region metadata; EU/NA watchlist match cannot be confirmed — treat as unverified.",
    "Perplexity returned no results for this window; external corroboration for several signals is unavailable.",
    "Iranian infrastructure signals reference AWS, not watchlist providers (Cloudflare, Azure, M365); included for situational awareness only."
  ]
}
```
```

### openai/gpt-5.4-mini

- Latency: **551 ms**
- Tokens: 1467 prompt / 188 completion (finish: stop)
- Cost: **$0.001946**

```json
{"bullets":["Cloudflare Radar shows two active medium-severity internet disruptions in Iran: AWS data-center strikes and a nationwide internet shutdown.","Cyber activity stayed elevated, with The Hacker News reporting CISA added four exploited flaws to KEV before a May federal deadline.","BleepingComputer reported a breach at utility firm Itron and ADT confirming a data breach after a ShinyHunters leak threat.","Multiple supply-chain and endpoint threats resurfaced, including Firestarter backdoor persistence on Cisco Firepower and Teams-delivered Snow malware.","KrebsOnSecurity highlighted Russia-linked router compromise for Microsoft Office tokens and a guilty plea tied to Scattered Spider."],"warnings":["No matching results were found in the retrieved context window; bullets are based on local signals only.","Watchlist coverage for EU, NA, Cloudflare, Azure, and M365 was limited in the last 24h window."]}
```

---

## Cost summary

| Model | Tokens (in/out) | Cost | $5/day capacity |
|-------|------------------|------|------------------|
| google/gemini-3-flash-preview | 1731/148 | $0.001309 | 3818 briefs/day |
| anthropic/claude-sonnet-4.6 | 1748/295 | $0.009669 | 517 briefs/day |
| openai/gpt-5.4-mini | 1467/188 | $0.001946 | 2569 briefs/day |
| **(plus Perplexity per global brief)** | — | $0.007470 | — |

## Verdict (manual review)

Compare:
1. Did the model output VALID JSON matching the schema, or did it leak chain-of-thought / preamble?
2. Did the bullets correctly attribute facts to local_signals vs retrieved_context?
3. Did any model hallucinate sources or dates not in the inputs?
4. Did any model exceed the 25-word-per-bullet rule?
5. Cost vs quality tradeoff per model.