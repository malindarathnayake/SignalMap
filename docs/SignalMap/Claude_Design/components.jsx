/* SignalMap UI components */
(function () {
  const { useState, useMemo, useEffect, useRef, useCallback } = React;

  const fmtAgo = (ts) => {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60), mm = m % 60;
    if (h < 24) return h + 'h ' + (mm ? mm + 'm ' : '') + 'ago';
    return Math.floor(h/24) + 'd ago';
  };
  window.fmtAgo = fmtAgo;

  const Icon = ({ name, size = 16, style }) => (
    <span className="material-symbols-outlined sm-icon"
      style={{ fontSize: size, lineHeight: 1, ...style }}>{name}</span>
  );
  window.Icon = Icon;

  // ===== Brand mark =====
  function Brand() {
    return (
      <div className="sm-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10.5" stroke="var(--accent)" strokeWidth="1" opacity="0.5"/>
          <circle cx="12" cy="12" r="6.5" stroke="var(--accent)" strokeWidth="1" opacity="0.7"/>
          <circle cx="12" cy="12" r="2.5" fill="var(--accent)"/>
          <circle cx="19" cy="6" r="1.5" fill="var(--sev-major)"/>
        </svg>
        <div className="sm-brand-name">SIGNALMAP</div>
        <div className="sm-brand-build mono">v0.4 · LIVE</div>
      </div>
    );
  }
  window.Brand = Brand;

  // ===== Header / command bar =====
  function CommandBar({ query, setQuery, timeRange, setTimeRange, sources, lastUpdate }) {
    const [openSources, setOpenSources] = useState(false);
    const ranges = ['1h','6h','24h','7d'];
    const sourceSummary = useMemo(() => {
      const ok = sources.filter(s => s.status === 'ok').length;
      const total = sources.length;
      const issues = sources.filter(s => s.status !== 'ok');
      return { ok, total, issues };
    }, [sources]);

    return (
      <header className="sm-cmdbar">
        <Brand />
        <div className="sm-cmdbar-search">
          <Icon name="search" size={16} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search signals, regions, providers, ASNs…"
          />
          <kbd className="sm-kbd mono">⌘K</kbd>
        </div>

        <div className="sm-cmdbar-right">
          <div className="sm-seg">
            {ranges.map(r => (
              <button key={r} className={`sm-seg-btn ${timeRange===r?'active':''}`}
                onClick={() => setTimeRange(r)}>{r}</button>
            ))}
          </div>

          <button className="sm-pill" onClick={() => setOpenSources(o => !o)}>
            <span className={`sm-dot ${sourceSummary.issues.length ? 'warn' : 'ok'}`}/>
            <span className="mono tnum">{sourceSummary.ok}/{sourceSummary.total}</span>
            <span className="sm-pill-label">sources</span>
            <Icon name="expand_more" size={14}/>
          </button>

          <div className="sm-pill subtle">
            <Icon name="autorenew" size={14}/>
            <span className="mono">{fmtAgo(lastUpdate)}</span>
          </div>

          <button className="sm-icon-btn" title="Settings"><Icon name="tune" size={16}/></button>
          <button className="sm-icon-btn" title="Share"><Icon name="ios_share" size={16}/></button>

          {openSources && <SourceHealth sources={sources} onClose={() => setOpenSources(false)} />}
        </div>
      </header>
    );
  }
  window.CommandBar = CommandBar;

  function SourceHealth({ sources, onClose }) {
    return (
      <>
        <div className="sm-pop-scrim" onClick={onClose}/>
        <div className="sm-pop sm-pop-sources">
          <div className="sm-pop-head">
            <span className="eyebrow">Source health</span>
            <button className="sm-pop-close" onClick={onClose}><Icon name="close" size={14}/></button>
          </div>
          <div className="sm-pop-body">
            {sources.map(s => (
              <div key={s.id} className="sm-source-row">
                <span className={`sm-dot ${s.status === 'ok' ? 'ok' : s.status === 'degraded' ? 'warn' : 'stale'}`}/>
                <div className="sm-source-name">
                  {s.label}
                  <span className="sm-tier">T{s.tier}</span>
                </div>
                <div className="sm-source-meta mono tnum">
                  {s.latency}ms
                </div>
                <div className="sm-source-status">
                  {s.status === 'ok' ? 'healthy' : s.status === 'degraded' ? 'degraded' : 'stale'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  // ===== Status strips =====
  function RadarStrip({ signals, lastUpdate }) {
    const radar = signals.filter(s => s.category === 'internet');
    const outages = radar.filter(s => s.radarKind === 'outage').length;
    const anomalies = radar.filter(s => s.radarKind === 'anomaly').length;
    const has = outages + anomalies > 0;

    return (
      <div className={`sm-strip ${has ? 'has' : 'calm'}`}>
        <div className="sm-strip-icon" style={{ color: has ? 'var(--cat-internet)' : 'var(--sev-resolved)' }}>
          <Icon name={has ? 'public' : 'verified'} size={18} />
        </div>
        <div className="sm-strip-main">
          <div className="sm-strip-eyebrow">
            <span className="eyebrow">Cloudflare Radar</span>
            <span className={`sm-mini-status ${has?'warn':'ok'}`}>
              <span className="sm-dot"/> {has ? 'Disruptions detected' : 'No active disruptions'}
            </span>
          </div>
          <div className="sm-strip-stats">
            <div className="sm-stat">
              <span className="sm-stat-num mono tnum" style={{color: outages?'var(--sev-critical)':'var(--ink-2)'}}>{outages}</span>
              <span className="sm-stat-label">outages</span>
            </div>
            <div className="sm-stat">
              <span className="sm-stat-num mono tnum" style={{color: anomalies?'var(--cat-internet)':'var(--ink-2)'}}>{anomalies}</span>
              <span className="sm-stat-label">anomalies</span>
            </div>
            {has && (
              <div className="sm-stat affected">
                <span className="sm-stat-label">Most affected</span>
                <span className="sm-stat-list">
                  {radar.slice(0,3).map((s,i) => (
                    <span key={s.id}>{i>0&&' · '}{s.locations[0].name}</span>
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="sm-strip-side mono">
          <div className="sm-strip-side-label">UPDATED</div>
          <div className="sm-strip-side-val">{fmtAgo(lastUpdate)}</div>
        </div>
      </div>
    );
  }
  window.RadarStrip = RadarStrip;

  function ProviderStrip({ signals, watchedProviders, lastUpdate }) {
    const provs = signals.filter(s => s.category === 'provider');
    const watched = provs.filter(s => watchedProviders.includes(s.provider));
    const global = provs.length - watched.length;

    return (
      <div className={`sm-strip ${provs.length ? 'has' : 'calm'}`}>
        <div className="sm-strip-icon" style={{ color: provs.length ? 'var(--cat-provider)' : 'var(--sev-resolved)' }}>
          <Icon name={provs.length ? 'cloud_alert' : 'cloud_done'} size={18}/>
        </div>
        <div className="sm-strip-main">
          <div className="sm-strip-eyebrow">
            <span className="eyebrow">Provider Status</span>
            <span className={`sm-mini-status ${provs.length?'warn':'ok'}`}>
              <span className="sm-dot"/> {provs.length ? `${provs.length} active incident${provs.length>1?'s':''}` : 'All providers healthy'}
            </span>
          </div>
          <div className="sm-strip-stats">
            <div className="sm-stat">
              <span className="sm-stat-num mono tnum" style={{color:'var(--watchlist)'}}>{watched.length}</span>
              <span className="sm-stat-label">in watchlist</span>
            </div>
            <div className="sm-stat">
              <span className="sm-stat-num mono tnum">{global}</span>
              <span className="sm-stat-label">global</span>
            </div>
            <div className="sm-stat affected">
              <span className="sm-stat-label">Affected</span>
              <span className="sm-stat-list">
                {[...new Set(provs.map(p => p.provider))].map((p,i) => (
                  <span key={p}>{i>0&&' · '}{p}</span>
                ))}
              </span>
            </div>
          </div>
        </div>
        <div className="sm-strip-side mono">
          <div className="sm-strip-side-label">UPDATED</div>
          <div className="sm-strip-side-val">{fmtAgo(lastUpdate)}</div>
        </div>
      </div>
    );
  }
  window.ProviderStrip = ProviderStrip;

  // ===== Left rail (filters + watchlist) =====
  function LeftRail({ categories, activeCats, toggleCat, regions, watchedRegions, toggleRegion,
                     providers, watchedProviders, toggleProvider, signals, mapControls, setMapControls }) {
    const counts = useMemo(() => {
      const c = {};
      categories.forEach(cat => c[cat.id] = signals.filter(s => s.category === cat.id).length);
      return c;
    }, [signals, categories]);

    return (
      <aside className="sm-rail">
        <div className="sm-rail-section">
          <div className="sm-rail-head">
            <span className="eyebrow">Signal layers</span>
            <button className="sm-rail-action" onClick={() => toggleCat('__all__')}>
              {activeCats.length === categories.length ? 'None' : 'All'}
            </button>
          </div>
          <div className="sm-cat-list">
            {categories.map(cat => {
              const active = activeCats.includes(cat.id);
              const n = counts[cat.id];
              return (
                <button key={cat.id}
                  className={`sm-cat-row ${active?'active':''} ${!n?'empty':''}`}
                  onClick={() => toggleCat(cat.id)}>
                  <span className="sm-cat-swatch" style={{ background: cat.color }}/>
                  <span className="sm-cat-label">{cat.label}</span>
                  <span className="sm-cat-count mono tnum">{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="sm-rail-section">
          <div className="sm-rail-head">
            <span className="eyebrow">My regions</span>
            <span className="sm-rail-meta mono tnum">{watchedRegions.length}</span>
          </div>
          <div className="sm-chips">
            {regions.filter(r => !r.kind).map(r => (
              <button key={r.id}
                className={`sm-chip ${watchedRegions.includes(r.id)?'on':''}`}
                onClick={() => toggleRegion(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <details className="sm-cloud">
            <summary>Cloud regions</summary>
            <div className="sm-chips dense">
              {regions.filter(r => r.kind === 'cloud').map(r => (
                <button key={r.id}
                  className={`sm-chip mono ${watchedRegions.includes(r.id)?'on':''}`}
                  onClick={() => toggleRegion(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
          </details>
        </div>

        <div className="sm-rail-section">
          <div className="sm-rail-head">
            <span className="eyebrow">My providers</span>
            <span className="sm-rail-meta mono tnum">{watchedProviders.length}</span>
          </div>
          <div className="sm-chips">
            {providers.map(p => (
              <button key={p.id}
                className={`sm-chip ${watchedProviders.includes(p.id)?'on':''}`}
                onClick={() => toggleProvider(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sm-rail-section">
          <div className="sm-rail-head">
            <span className="eyebrow">Map controls</span>
          </div>
          <div className="sm-controls">
            <label className="sm-control-row">
              <span>Confidence</span>
              <input type="range" min="0" max="1" step="0.05"
                value={mapControls.minConfidence}
                onChange={e => setMapControls(c => ({ ...c, minConfidence: +e.target.value }))} />
              <span className="mono tnum">{Math.round(mapControls.minConfidence*100)}%</span>
            </label>
            <label className="sm-control-toggle">
              <input type="checkbox" checked={mapControls.showCables}
                onChange={e => setMapControls(c => ({ ...c, showCables: e.target.checked }))} />
              <span>Subsea cables</span>
              <span className="sm-control-hint">on incident</span>
            </label>
            <label className="sm-control-toggle">
              <input type="checkbox" checked={mapControls.showDatacenters}
                onChange={e => setMapControls(c => ({ ...c, showDatacenters: e.target.checked }))} />
              <span>Datacenters</span>
              <span className="sm-control-hint">on incident</span>
            </label>
            <label className="sm-control-toggle">
              <input type="checkbox" checked={mapControls.cluster}
                onChange={e => setMapControls(c => ({ ...c, cluster: e.target.checked }))} />
              <span>Cluster nearby</span>
            </label>
          </div>
        </div>
      </aside>
    );
  }
  window.LeftRail = LeftRail;

  // ===== Right inspector =====
  function Inspector({ signal, onClose, watchedRegions, watchedProviders }) {
    if (!signal) return <InspectorEmpty/>;
    const isInternet = signal.category === 'internet';
    const isProvider = signal.category === 'provider';
    const cat = window.SM_CATEGORIES.find(c => c.id === signal.category);
    const sevLabel = (signal.severity || 'info').toUpperCase();
    const sevColor =
      signal.severity === 'critical' ? 'var(--sev-critical)' :
      signal.severity === 'major' ? 'var(--sev-major)' :
      signal.severity === 'minor' ? 'var(--sev-minor)' : 'var(--sev-info)';

    return (
      <aside className="sm-inspector">
        <div className="sm-insp-head">
          <div className="sm-insp-cat">
            <span className="sm-cat-swatch" style={{ background: `var(--cat-${signal.category})` }}/>
            <span className="eyebrow">{cat ? cat.label : signal.category}</span>
            <span className="sm-sev-pill" style={{ color: sevColor, borderColor: sevColor }}>{sevLabel}</span>
            {signal.watchlistMatch && (
              <span className="sm-watch-pill"><Icon name="bookmark" size={11}/>WATCHLIST</span>
            )}
          </div>
          <button className="sm-icon-btn" onClick={onClose}><Icon name="close" size={16}/></button>
        </div>

        <h2 className="sm-insp-title">{signal.title}</h2>

        <div className="sm-insp-meta">
          <span className="mono">{fmtAgo(signal.started)}</span>
          {signal.duration && <><span className="sep">·</span><span>Duration <span className="mono tnum">{signal.duration}</span></span></>}
          {signal.locations[0] && signal.locations[0].name && (
            <><span className="sep">·</span><Icon name="location_on" size={12}/><span>{signal.locations[0].name}</span></>
          )}
        </div>

        <p className="sm-insp-summary">{signal.summary}</p>

        {/* Specific blocks per type */}
        {isInternet && (
          <div className="sm-insp-grid">
            <Field label="Scope" value={signal.locations[0]?.scope || '—'} />
            <Field label="ASN / network" mono value={signal.asn || '—'} />
            <Field label="Started" mono value={new Date(signal.started).toISOString().slice(11,16) + ' UTC'} />
            <Field label="Duration" mono value={signal.duration || '—'} />
            <Field label="Cause" value={signal.cause || 'Unknown'} />
            <Field label="Radar verified" value={
              <span className="sm-badge ok"><Icon name="task_alt" size={11}/>Yes</span>
            }/>
          </div>
        )}

        {isProvider && (
          <div className="sm-insp-grid">
            <Field label="Provider" value={(signal.provider||'').toUpperCase()} />
            <Field label="Status" value={
              <span className="sm-badge warn">{signal.incidentStatus}</span>
            }/>
            <Field label="Impact" value={signal.impact} />
            <Field label="Started" mono value={new Date(signal.started).toISOString().slice(11,16) + ' UTC'} />
            <Field label="Duration" mono value={signal.duration || '—'} />
            <Field label="Region" value={signal.locations[0]?.name || '—'} />
          </div>
        )}

        {!isInternet && !isProvider && (
          <div className="sm-insp-grid">
            <Field label="Started" mono value={new Date(signal.started).toISOString().slice(11,16) + ' UTC'} />
            <Field label="Region" value={signal.locations[0]?.name || '—'} />
          </div>
        )}

        {/* Confidence panel */}
        <div className="sm-confidence">
          <div className="sm-conf-head">
            <span className="eyebrow">Confidence & corroboration</span>
          </div>
          <div className="sm-conf-rows">
            <ConfRow label="Extraction" value={signal.confidence}/>
            <ConfRow label="Location" value={signal.locConfidence}/>
            <div className="sm-conf-row">
              <span className="sm-conf-label">Corroboration</span>
              <div className="sm-corr">
                {Array.from({length: Math.max(5, signal.corroboration)}).map((_, i) => (
                  <span key={i} className={`sm-corr-pip ${i < signal.corroboration ? 'on' : ''}`}/>
                ))}
                <span className="mono tnum sm-corr-num">{signal.corroboration} source{signal.corroboration>1?'s':''}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sources */}
        <div className="sm-insp-section">
          <div className="eyebrow">Source stack</div>
          <div className="sm-source-stack">
            {signal.sources.map((src, i) => (
              <div key={i} className="sm-source-stack-row">
                <span className={`sm-tier-pill t${src.id==='radar'||src.id==='cf-status'||src.id==='okta-status'||src.id==='azure-status'||src.id==='wasabi-status'||src.id==='m365-health'||src.id==='rss-tier1'||src.id==='noaa'||src.id==='usgs' ? '1':'2'}`}>
                  {src.id==='radar'||src.id==='cf-status'||src.id==='okta-status'||src.id==='azure-status'||src.id==='wasabi-status'||src.id==='m365-health'||src.id==='rss-tier1'||src.id==='noaa'||src.id==='usgs' ? 'T1':'T2'}
                </span>
                <span className="sm-source-stack-label">{src.label}</span>
                {src.verified && <span className="sm-verified"><Icon name="verified" size={12}/>verified</span>}
                <Icon name="open_in_new" size={11} style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}/>
              </div>
            ))}
          </div>
        </div>

        {/* Tags */}
        {signal.tags && signal.tags.length > 0 && (
          <div className="sm-insp-section">
            <div className="eyebrow">Tags</div>
            <div className="sm-tags">
              {signal.tags.map(t => <span key={t} className="sm-tag mono">#{t}</span>)}
            </div>
          </div>
        )}

        <div className="sm-insp-actions">
          <button className="sm-btn primary"><Icon name="link" size={14}/>Open evidence</button>
          <button className="sm-btn"><Icon name="bookmark_add" size={14}/>Watch</button>
          <button className="sm-btn"><Icon name="ios_share" size={14}/></button>
        </div>
      </aside>
    );
  }
  window.Inspector = Inspector;

  function InspectorEmpty() {
    return (
      <aside className="sm-inspector empty">
        <div className="sm-insp-empty">
          <div className="sm-insp-empty-icon"><Icon name="ads_click" size={28}/></div>
          <div className="sm-insp-empty-title">Select a signal</div>
          <div className="sm-insp-empty-hint">
            Click any marker on the map or row in the live feed to inspect source stack, confidence, and timeline.
          </div>
          <div className="sm-insp-legend">
            <div className="eyebrow">Map legend</div>
            <div className="sm-legend-item">
              <span className="sm-legend-shape outage"/>
              <span>Internet outage</span>
              <span className="sm-legend-hint">Cloudflare Radar</span>
            </div>
            <div className="sm-legend-item">
              <span className="sm-legend-shape anomaly"/>
              <span>Traffic anomaly</span>
              <span className="sm-legend-hint">Cloudflare Radar</span>
            </div>
            <div className="sm-legend-item">
              <span className="sm-legend-shape diamond"/>
              <span>Provider incident</span>
              <span className="sm-legend-hint">Status feeds</span>
            </div>
            <div className="sm-legend-item">
              <span className="sm-legend-shape circle"/>
              <span>News / event</span>
              <span className="sm-legend-hint">Geolocated story</span>
            </div>
            <div className="sm-legend-item">
              <span className="sm-legend-shape watch"/>
              <span>Watchlist match</span>
              <span className="sm-legend-hint">Promoted</span>
            </div>
            <div className="sm-legend-foot">
              Absence of a marker means no active issue currently detected by Radar in that region.
            </div>
          </div>
        </div>
      </aside>
    );
  }

  function Field({ label, value, mono }) {
    return (
      <div className="sm-field">
        <div className="sm-field-label">{label}</div>
        <div className={`sm-field-value ${mono?'mono':''}`}>{value}</div>
      </div>
    );
  }

  function ConfRow({ label, value }) {
    const pct = Math.round(value * 100);
    const tone = value >= 0.85 ? 'high' : value >= 0.6 ? 'mid' : 'low';
    return (
      <div className="sm-conf-row">
        <span className="sm-conf-label">{label}</span>
        <div className="sm-conf-bar">
          <div className={`sm-conf-fill ${tone}`} style={{ width: pct + '%' }}/>
        </div>
        <span className="mono tnum sm-conf-num">{pct}%</span>
      </div>
    );
  }

  // ===== Live feed =====
  function LiveFeed({ signals, selectedId, onSelect, watchedRegions, watchedProviders }) {
    const grouped = useMemo(() => {
      // Sort: watchlist matches first, then severity, then recency
      const sevWeight = { critical: 4, major: 3, minor: 2, info: 1 };
      return [...signals].sort((a, b) => {
        if (!!b.watchlistMatch - !!a.watchlistMatch) return !!b.watchlistMatch - !!a.watchlistMatch;
        const sd = (sevWeight[b.severity]||0) - (sevWeight[a.severity]||0);
        if (sd) return sd;
        return b.started - a.started;
      });
    }, [signals]);

    return (
      <div className="sm-feed">
        <div className="sm-feed-head">
          <span className="eyebrow">Live feed</span>
          <span className="mono tnum sm-feed-count">{signals.length}</span>
          <div className="sm-feed-actions">
            <button className="sm-feed-action active">All</button>
            <button className="sm-feed-action">Watchlist</button>
            <button className="sm-feed-action">Critical</button>
          </div>
        </div>
        <div className="sm-feed-list">
          {grouped.map(s => <FeedRow key={s.id} signal={s} selected={selectedId===s.id} onSelect={() => onSelect(s.id)}/>)}
        </div>
      </div>
    );
  }
  window.LiveFeed = LiveFeed;

  function FeedRow({ signal, selected, onSelect }) {
    const sevColor =
      signal.severity === 'critical' ? 'var(--sev-critical)' :
      signal.severity === 'major' ? 'var(--sev-major)' :
      signal.severity === 'minor' ? 'var(--sev-minor)' : 'var(--sev-info)';
    const cat = window.SM_CATEGORIES.find(c => c.id === signal.category);

    return (
      <button className={`sm-feed-row ${selected?'selected':''} ${signal.watchlistMatch?'watch':''}`} onClick={onSelect}>
        <div className="sm-feed-rail" style={{ background: sevColor }}/>
        <div className="sm-feed-body">
          <div className="sm-feed-meta">
            <span className="sm-feed-cat" style={{ color: `var(--cat-${signal.category})` }}>
              <span className="sm-cat-swatch tiny" style={{ background: `var(--cat-${signal.category})` }}/>
              {cat?cat.short:signal.category}
            </span>
            {signal.watchlistMatch && (
              <span className="sm-feed-watch"><Icon name="bookmark" size={10}/>WATCH</span>
            )}
            {signal.lowConfidence && (
              <span className="sm-feed-low"><Icon name="help" size={10}/>LOW CONF</span>
            )}
            <span className="sm-feed-ago mono">{fmtAgo(signal.started)}</span>
          </div>
          <div className="sm-feed-title">{signal.title}</div>
          <div className="sm-feed-foot">
            {signal.locations[0] && signal.locations[0].name && (
              <span className="sm-feed-loc"><Icon name="location_on" size={10}/>{signal.locations[0].name}</span>
            )}
            <span className="sm-feed-srcs">
              {signal.sources.slice(0,3).map((s,i) => (
                <span key={i} className="sm-feed-src">{s.label.split(' ')[0]}</span>
              ))}
              {signal.sources.length > 3 && <span className="sm-feed-src more">+{signal.sources.length-3}</span>}
            </span>
            <span className="sm-feed-conf mono tnum" title="extraction confidence">
              {Math.round(signal.confidence*100)}%
            </span>
          </div>
        </div>
      </button>
    );
  }

  // ===== Timeline / velocity strip =====
  function TimelineStrip({ velocity, categories, activeCats, scrubT, setScrubT }) {
    const cats = activeCats.length ? activeCats : categories.map(c=>c.id);
    const max = useMemo(() => {
      let m = 0;
      velocity.forEach(slot => {
        let s = 0;
        cats.forEach(c => s += (slot[c]||0));
        if (s > m) m = s;
      });
      return m || 1;
    }, [velocity, cats.join(',')]);

    return (
      <div className="sm-timeline">
        <div className="sm-tl-head">
          <span className="eyebrow">Signal velocity · 24h</span>
          <div className="sm-tl-legend">
            {cats.slice(0, 6).map(cid => {
              const c = categories.find(x => x.id === cid);
              if (!c) return null;
              return (
                <span key={cid} className="sm-tl-leg-item">
                  <span className="sm-cat-swatch tiny" style={{background: c.color}}/>{c.short}
                </span>
              );
            })}
          </div>
          <span className="mono tnum sm-tl-now">NOW · {new Date().toISOString().slice(11,16)} UTC</span>
        </div>
        <div className="sm-tl-canvas">
          {/* hour ticks */}
          <div className="sm-tl-ticks">
            {[24,18,12,6,0].map(h => (
              <span key={h} className="sm-tl-tick mono" style={{ left: `${(1 - h/24) * 100}%` }}>
                -{h}h
              </span>
            ))}
          </div>
          {/* bars */}
          <div className="sm-tl-bars">
            {velocity.map((slot, i) => {
              let stack = 0;
              const segs = cats.map(cid => {
                const v = slot[cid] || 0;
                const seg = { cid, v, from: stack };
                stack += v;
                return seg;
              });
              const total = stack;
              const height = (total / max) * 100;
              return (
                <div key={i} className="sm-tl-bar" style={{ height: '100%', width: `${100/velocity.length}%` }}>
                  <div className="sm-tl-bar-stack" style={{ height: `${height}%` }}>
                    {segs.map(seg => (
                      <div key={seg.cid}
                        style={{
                          height: `${(seg.v/total)*100}%`,
                          background: `var(--cat-${seg.cid})`,
                          opacity: 0.85,
                        }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {/* scrubber */}
          <input type="range" min="0" max={velocity.length-1} value={scrubT}
            onChange={e => setScrubT(+e.target.value)}
            className="sm-tl-scrub"
          />
          <div className="sm-tl-handle" style={{ left: `${(scrubT/(velocity.length-1))*100}%` }}>
            <span className="mono tnum">
              {(() => {
                const minsAgo = Math.round(((velocity.length-1) - scrubT) * 15);
                const h = Math.floor(minsAgo/60), m = minsAgo%60;
                return h>0 ? `-${h}h ${m}m` : `-${m}m`;
              })()}
            </span>
          </div>
        </div>
      </div>
    );
  }
  window.TimelineStrip = TimelineStrip;

  Object.assign(window, { Brand, CommandBar, RadarStrip, ProviderStrip, LeftRail, Inspector, LiveFeed, TimelineStrip, Icon, fmtAgo });
})();
