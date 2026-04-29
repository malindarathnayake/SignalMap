/* SignalMap — main app */
(function () {
  const { useState, useMemo, useEffect, useCallback } = React;

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "dark",
    "demoState": "default",
    "showCables": false,
    "showDatacenters": false,
    "density": "comfortable"
  }/*EDITMODE-END*/;

  const DEFAULT_REGIONS = ['eu', 'na'];
  const DEFAULT_PROVIDERS = ['cloudflare', 'azure', 'm365'];
  const REGION_BBOX = {
    na:    [-168, 14, -52, 72],
    eu:    [-12, 35, 40, 71],
    mena:  [-12, 14, 60, 38],
    apac:  [95, -12, 152, 50],
    sa:    [60, 5, 92, 38],
    af:    [-18, -36, 52, 38],
    latam: [-82, -56, -34, 14],
  };

  function App() {
    const tweaks = window.useTweaks ? window.useTweaks(TWEAK_DEFAULTS) : { values: TWEAK_DEFAULTS, setValue: () => {} };
    const T = tweaks.values;

    useEffect(() => {
      document.documentElement.setAttribute('data-theme', T.theme);
    }, [T.theme]);

    const allSignals = window.SM_SIGNALS;
    const signals = useMemo(() => {
      if (T.demoState === 'calm') {
        return allSignals.filter(s => s.category !== 'internet' && s.category !== 'provider').slice(0, 5);
      }
      return allSignals;
    }, [T.demoState]);

    const [watchedRegions, setWatchedRegions] = useState(DEFAULT_REGIONS);
    const [watchedProviders, setWatchedProviders] = useState(DEFAULT_PROVIDERS);

    const enrichedSignals = useMemo(() => signals.map(s => ({
      ...s,
      watchlistMatch:
        (s.region && watchedRegions.includes(s.region)) ||
        (s.provider && watchedProviders.includes(s.provider)),
    })), [signals, watchedRegions, watchedProviders]);

    const allCats = window.SM_CATEGORIES.map(c => c.id);
    const [activeCats, setActiveCats] = useState(allCats);
    const toggleCat = useCallback((id) => {
      if (id === '__all__') {
        setActiveCats(c => c.length === allCats.length ? [] : allCats);
        return;
      }
      setActiveCats(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
    }, []);
    const toggleRegion = useCallback((id) => {
      setWatchedRegions(r => r.includes(id) ? r.filter(x => x !== id) : [...r, id]);
    }, []);
    const toggleProvider = useCallback((id) => {
      setWatchedProviders(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    }, []);

    const [query, setQuery] = useState('');
    const [timeRange, setTimeRange] = useState('24h');
    const [mapControls, setMapControls] = useState({
      minConfidence: 0.5,
      showCables: T.showCables,
      showDatacenters: T.showDatacenters,
      cluster: false,
    });
    useEffect(() => {
      setMapControls(c => ({ ...c, showCables: T.showCables, showDatacenters: T.showDatacenters }));
    }, [T.showCables, T.showDatacenters]);

    const [selectedId, setSelectedId] = useState('rdr-pk-01');
    const [scrubT, setScrubT] = useState(window.SM_VELOCITY.length - 1);

    const filteredSignals = useMemo(() => {
      let s = enrichedSignals;
      if (activeCats.length < allCats.length) {
        s = s.filter(x => activeCats.includes(x.category));
      }
      if (query.trim()) {
        const q = query.toLowerCase();
        s = s.filter(x =>
          x.title.toLowerCase().includes(q) ||
          (x.summary || '').toLowerCase().includes(q) ||
          (x.tags || []).some(t => t.toLowerCase().includes(q)) ||
          (x.locations || []).some(l => (l.name||'').toLowerCase().includes(q)) ||
          (x.provider || '').toLowerCase().includes(q)
        );
      }
      return s;
    }, [enrichedSignals, activeCats, query]);

    const selected = useMemo(() => filteredSignals.find(s => s.id === selectedId) || enrichedSignals.find(s => s.id === selectedId), [filteredSignals, enrichedSignals, selectedId]);

    const [lastUpdate, setLastUpdate] = useState(Date.now() - 18 * 1000);
    useEffect(() => {
      const i = setInterval(() => {
        if (Math.random() < 0.5) setLastUpdate(Date.now() - 4 * 1000);
      }, 25000);
      return () => clearInterval(i);
    }, []);

    const watchHalos = watchedRegions
      .map(id => ({ id, label: id, bbox: REGION_BBOX[id] }))
      .filter(r => r.bbox);

    const visibleOnMap = filteredSignals.filter(s => s.locations[0] && s.locations[0].lon != null && s.locConfidence >= 0.5);

    return (
      <div className="sm-app" data-density={T.density || 'comfortable'}>
        {/* Row 1: Command bar */}
        <CommandBar
          query={query} setQuery={setQuery}
          timeRange={timeRange} setTimeRange={setTimeRange}
          sources={window.SM_SOURCES}
          lastUpdate={lastUpdate}
        />

        {/* Row 2: Status strips */}
        <div className="sm-strips">
          <RadarStrip signals={enrichedSignals} lastUpdate={lastUpdate}/>
          <ProviderStrip signals={enrichedSignals} watchedProviders={watchedProviders} lastUpdate={lastUpdate}/>
        </div>

        {/* Row 3-4: workspace (rail | map+feed | inspector) */}
        <div className="sm-main">
          <LeftRail
            categories={window.SM_CATEGORIES}
            activeCats={activeCats}
            toggleCat={toggleCat}
            regions={window.SM_REGIONS}
            watchedRegions={watchedRegions}
            toggleRegion={toggleRegion}
            providers={window.SM_PROVIDERS}
            watchedProviders={watchedProviders}
            toggleProvider={toggleProvider}
            signals={enrichedSignals}
            mapControls={mapControls}
            setMapControls={setMapControls}
          />

          <div className="sm-center">
            <div className="sm-map-wrap">
              <WorldMap
                width={1280} height={640}
                signals={filteredSignals}
                contextLayers={window.SM_CONTEXT}
                onSelect={setSelectedId}
                selectedId={selectedId}
                watchlistRegions={watchHalos}
                showCables={mapControls.showCables}
                showDatacenters={mapControls.showDatacenters}
                minConfidence={mapControls.minConfidence}
                activeCategories={activeCats.length === allCats.length ? null : activeCats}
              />

              <div className="sm-map-overlays">
                <div className="sm-map-corner tl">
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Active on map</div>
                  <div style={{ display: 'flex', gap: 18, alignItems: 'baseline' }}>
                    <div>
                      <div className="mono tnum" style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink-1)' }}>
                        {visibleOnMap.length}
                      </div>
                      <div className="sm-stat-label">visible</div>
                    </div>
                    <div>
                      <div className="mono tnum" style={{ fontSize: 22, fontWeight: 600, color: 'var(--watchlist)' }}>
                        {filteredSignals.filter(s => s.watchlistMatch).length}
                      </div>
                      <div className="sm-stat-label">watchlist</div>
                    </div>
                    <div>
                      <div className="mono tnum" style={{ fontSize: 22, fontWeight: 600, color: 'var(--cat-internet)' }}>
                        {filteredSignals.filter(s => s.category === 'internet').length}
                      </div>
                      <div className="sm-stat-label">radar</div>
                    </div>
                  </div>
                </div>

                <div className="sm-map-corner tr" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="eyebrow">Projection</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>EQUIRECTANGULAR</span>
                  <span className="sm-map-coords">
                    <span className="sm-map-coords-label">EPSG</span> 4326
                    &nbsp;·&nbsp;
                    <span className="sm-map-coords-label">RES</span> 110m
                  </span>
                </div>

                <div className="sm-map-corner bl">
                  <span className="eyebrow" style={{ marginRight: 8 }}>Legend</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 12 }}>
                    <span style={{ width: 8, height: 8, background: 'var(--sev-major)', display: 'inline-block' }}/>outage
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 12 }}>
                    <span style={{ width: 8, height: 8, border: '1.5px solid var(--cat-internet)', borderRadius: '50%', display: 'inline-block', boxSizing: 'border-box' }}/>anomaly
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 12 }}>
                    <span style={{ width: 8, height: 8, background: 'var(--cat-provider)', transform: 'rotate(45deg)', display: 'inline-block' }}/>provider
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, background: 'var(--cat-supply)', borderRadius: '50%', display: 'inline-block' }}/>event
                  </span>
                </div>

                <div className="sm-map-corner br">
                  <div className="sm-map-stats">
                    <div className="eyebrow" style={{ marginBottom: 4 }}>Live</div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className="sm-pulse-dot"/>
                      <span className="mono">streaming</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Live feed below the map */}
            <LiveFeed
              signals={filteredSignals}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          <Inspector
            signal={selected}
            onClose={() => setSelectedId(null)}
            watchedRegions={watchedRegions}
            watchedProviders={watchedProviders}
          />
        </div>

        {/* Row 5: Timeline */}
        <TimelineStrip
          velocity={window.SM_VELOCITY}
          categories={window.SM_CATEGORIES}
          activeCats={activeCats}
          scrubT={scrubT} setScrubT={setScrubT}
        />

        {window.TweaksPanel && (
          <window.TweaksPanel title="Tweaks">
            <window.TweakSection title="Theme">
              <window.TweakRadio
                value={T.theme}
                onChange={v => tweaks.setValue('theme', v)}
                options={[{value:'dark',label:'Dark'},{value:'light',label:'Light'}]}
              />
            </window.TweakSection>
            <window.TweakSection title="Demo state">
              <window.TweakRadio
                value={T.demoState}
                onChange={v => tweaks.setValue('demoState', v)}
                options={[
                  {value:'default', label:'Mixed (default)'},
                  {value:'calm', label:'Calm — no Radar dots'},
                ]}
              />
            </window.TweakSection>
            <window.TweakSection title="Context layers">
              <window.TweakToggle
                label="Subsea cables"
                value={T.showCables}
                onChange={v => tweaks.setValue('showCables', v)}
              />
              <window.TweakToggle
                label="Datacenters"
                value={T.showDatacenters}
                onChange={v => tweaks.setValue('showDatacenters', v)}
              />
            </window.TweakSection>
          </window.TweaksPanel>
        )}
      </div>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App/>);
})();
