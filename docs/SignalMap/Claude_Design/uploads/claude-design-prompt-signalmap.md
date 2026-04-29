# Claude Design Prompt - SignalMap UI Revamp

Use this prompt with Claude Design after attaching:

- A screenshot of the current WorldMonitor UI.
- Any design mockups or brand references you want preserved.
- Optional logo, color, or typography references.

```text
You are redesigning WorldMonitor into SignalMap, a public web intelligence dashboard for live global signals.

Context:
- The current product is a dense real-time global intelligence dashboard with a world map, many data panels, and live feeds for geopolitics, finance, technology, cyber, climate, military, aviation, maritime, infrastructure, and supply chain.
- The existing codebase already has a large public-source foundation: RSS feeds with source tiers, public GDELT/news intelligence, public disaster/weather/climate sources, provider status checks, Cloudflare Radar seed/RPC plumbing, and static context layers such as cloud regions, datacenters, undersea cables, airports, ports, and tech HQs.
- The revamped product should feel like a serious analyst-grade public web app, not a marketing landing page.
- SignalMap's main product promise is: show only meaningful signals on the map. The map should not be cluttered with generic data points.
- Static context layers should support analysis, not create fake activity. Do not show a dot merely because a cloud region, cable, datacenter, airport, port, or company HQ exists. Promote those locations only when a real incident, outage, anomaly, advisory, or high-confidence story affects them.
- Cloudflare Radar internet outages and traffic anomalies should be front and center as the primary signal layer. Internet-health dots should appear only when Cloudflare Radar reports an outage, disruption, or traffic anomaly. If the internet is normal in a region, do not render a dot there.
- Provider/service health is also a first-class signal source. SignalMap should ingest and visualize relevant incidents from Cloudflare Status, Okta Status RSS, Microsoft service health feed, Azure status RSS, and Wasabi Status.
- Users must be able to choose "My Regions" and "My Providers" so the dashboard prioritizes only regions and cloud/SaaS providers that matter to them. Global signals can remain visible, but region/provider watchlist matches should be visually promoted.
- The second major feature is an LLM-enriched story map: RSS/scraped news items are deduplicated, tagged, geolocated, and shown only when location confidence is high enough. Categories include Technology, Finance, GeoPolitics, Conflict, Cyber, Climate, Health, Energy, Supply Chain, and Infrastructure.
- I will attach the current UI screenshot and design mockup files. Use them as context, but create a more coherent, polished, modern interface.

Design objective:
Create a high-fidelity dashboard UI for SignalMap that opens directly into the usable product. The first viewport must be the actual intelligence workspace: map, internet-health signal layer, live event layer, filters, feed, and selected-signal details. Do not create a hero page, marketing homepage, or explanatory brochure.

Core layout:
- Map-first interface with the global map as the main surface.
- Cloudflare Radar status should be visible immediately: global status, active outages/anomalies count, most affected locations, and last update time.
- Internet-health issue markers should have priority over generic news markers.
- Existing public signals should be visible as source health and filtered categories, but not all enabled at once by default.
- Left rail or top command area for signal filters: Internet Health, Provider Status, GeoPolitics, Finance, Technology, Cyber, Climate, Health, Energy, Supply Chain, Infrastructure.
- Region watchlist control: users can select regions such as Global, North America, Europe, MENA, Asia-Pacific, South Asia, Africa, South America, or specific cloud regions such as Azure East US, Azure West Europe, Wasabi EU-West-1, Wasabi AP-Southeast-1, and similar provider regions.
- Provider watchlist control: Cloudflare, Okta, Microsoft 365, Azure, Wasabi, and future providers.
- Right-side signal inspector that opens for a selected map item with title, source stack, summary, confidence, timestamp, category, locations, and tags.
- Bottom or side timeline showing signal velocity over the last 24 hours.
- Compact live feed grouped by severity and category.
- Clear credibility indicators: source tier, corroboration count, extraction confidence, location confidence, and Radar verification status.
- Responsive mobile layout where map remains primary and panels become bottom sheets/tabs.

Cloudflare Radar behavior:
- Show a calm "No active internet disruptions detected" state when there are no current Radar issues.
- Do not show decorative or placeholder dots for healthy regions.
- Internet-health markers should distinguish outage, traffic anomaly, ASN/network issue, country-level issue, and regional/subnational issue.
- The inspector for Radar items should show affected location, scope, ASN/network when available, start time, duration, cause when known, and source as Cloudflare Radar.
- The map legend should make it clear that absence of a dot means no active issue currently detected by Radar.

Provider status behavior:
- Provider incidents should appear as signal cards and map markers only when there is an active or recent incident, degraded performance, partial outage, major outage, scheduled maintenance with expected impact, or similar issue.
- Do not show map dots for operational provider regions.
- Cloudflare Status API should be treated as separate from Cloudflare Radar: Status shows Cloudflare's own service health, while Radar shows broader Internet outages and traffic anomalies.
- Okta Status RSS, Microsoft service health feed, Azure status RSS, and Wasabi Status should be normalized into the same provider-status signal model.
- When a provider incident has no reliable geography, show it in the provider/status feed and do not invent a map location.
- If a provider incident maps to a selected user region, visually promote it in the header/status strip and feed.

Visual direction:
- Serious, high-contrast, modern intelligence operations feel.
- Avoid a one-note dark blue/slate interface; introduce restrained category color accents.
- Use crisp typography, clear hierarchy, compact spacing, and strong scanability.
- Avoid oversized cards, decorative gradient blobs, or generic SaaS landing-page styling.
- Cards should be functional and compact, with border radius no larger than 8px.
- Use meaningful icons for outages, anomalies, alerts, time, sources, location confidence, and layer controls.
- Make category colors distinguishable and accessible.
- Internet-health issues should feel urgent but not alarmist.

Required screens/states:
- Desktop dashboard at 1440px wide.
- Mobile dashboard at 390px wide.
- Default healthy state with no Radar dots and a clear global status summary.
- Active internet disruption state with Radar issue markers on the map.
- Active provider incident state with Cloudflare/Okta/Microsoft/Azure/Wasabi signal cards.
- "My Regions" configuration state where the user selects regions/providers that matter to them.
- Selected Radar issue state with signal inspector open.
- Selected provider-status issue state with service, region, incident status, impact, and latest update visible.
- Selected LLM geolocated news story state with event inspector open.
- Filtered category state for Internet Health, Provider Status, Technology, or GeoPolitics.
- Empty/low-confidence news state where the app explains that no reliable map location was found without inventing a marker.
- Loading, stale-data, and partial-source-failure states.

Required components:
- Header/command bar with product name SignalMap, search, time range, refresh status, and source health.
- Radar status strip: global health, active outages, active anomalies, last update.
- Provider status strip: watched providers, watched-region incidents, global provider incidents, last update.
- Public source health indicator: RSS/GDELT, disaster/weather/climate, security advisories, provider status, Radar, and optional keyed enrichments.
- Map controls: layer toggle, cluster toggle, confidence threshold, time range.
- Signal category segmented control.
- Region/provider watchlist picker.
- Event marker/cluster styles for severity and category.
- Internet-health marker styles for outage vs anomaly.
- Provider-status marker/card styles for degraded performance, partial outage, major outage, maintenance, and resolved/recent.
- Signal inspector panel.
- Live feed row component.
- Timeline/velocity strip.
- Source confidence badge.
- Compact legend.

Content examples to use in the mockup:
- "Cloudflare Radar detects traffic anomaly in Pakistan"
- "Regional internet disruption reported in southern Iraq"
- "Cloudflare Status reports degraded Workers performance"
- "Okta reports elevated sign-in error rates"
- "Azure reports service management issues in West Europe"
- "Wasabi US-West-1 reports degraded S3 API performance"
- "Taiwan chip suppliers reroute shipments after port disruption"
- "Central bank surprise cut pressures regional currencies"
- "Cyber campaign targets energy operators in Eastern Europe"
- "Flooding disrupts rail freight near Milan"
- "New export controls hit advanced AI accelerators"

UX rules:
- The map should never be visually buried under panels.
- The user should be able to filter, inspect, and return to the map in one or two clicks.
- Confidence and source quality must be visible without reading documentation.
- Distinguish primary incident signals from static context/reference layers.
- Do not show full article text; show short summaries, source links, and evidence snippets.
- Do not imply certainty when the location confidence is low.
- Do not show map dots for normal/healthy locations.
- Let users select regions and providers that matter to them, and make those watchlist matches more prominent than unrelated global noise.
- Make it obvious that SignalMap is signal-first, not a generic world news feed.

Deliverables:
- Produce a polished desktop mockup.
- Produce a polished mobile mockup.
- Provide a small design system: colors, typography, spacing, key components, and marker styles.
- Include implementation notes for a Preact/Vite app with existing class-based panel components.
- Keep the design practical for incremental implementation over the current UI.
```
