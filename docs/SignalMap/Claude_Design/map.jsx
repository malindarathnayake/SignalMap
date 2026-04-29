/* WorldMap — a flat equirectangular SVG world.
   Renders country outlines (via topojson loaded from CDN) and provides
   a coordinate->pixel projection so signals can be placed.
*/
(function () {
  const { useEffect, useState, useRef, useMemo, useCallback } = React;

  // Equirectangular projection: lon/lat -> normalized [0..1] coords on a 2:1 canvas
  function project(lon, lat) {
    return [(lon + 180) / 360, (90 - lat) / 180];
  }
  window.SM_project = project;

  // Build a path-d from a GeoJSON geometry using a flat projection over (W, H).
  function geometryToPath(geom, W, H) {
    if (!geom) return '';
    const drawRing = (ring) => {
      let d = '';
      for (let i = 0; i < ring.length; i++) {
        const [lon, lat] = ring[i];
        const [x, y] = project(lon, lat);
        d += (i === 0 ? 'M' : 'L') + (x * W).toFixed(1) + ',' + (y * H).toFixed(1);
      }
      return d + 'Z';
    };
    if (geom.type === 'Polygon') {
      return geom.coordinates.map(drawRing).join('');
    }
    if (geom.type === 'MultiPolygon') {
      return geom.coordinates.flatMap(poly => poly.map(drawRing)).join('');
    }
    return '';
  }

  let _worldCache = null;
  async function loadWorld() {
    if (_worldCache) return _worldCache;
    // world-atlas 110m simplified, via jsdelivr
    const topo = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r => r.json());
    const geo = window.topojson.feature(topo, topo.objects.countries);
    _worldCache = geo;
    return geo;
  }

  function WorldMap({
    width = 1280,
    height = 640,
    signals = [],
    contextLayers = {},
    onSelect,
    selectedId,
    watchlistRegions = [],
    showCables = false,
    showDatacenters = false,
    showAirports = false,
    timeRange = '24h',
    minConfidence = 0,
    activeCategories = null, // null = all
    hideHealthy = true,
  }) {
    const [geo, setGeo] = useState(null);
    const [hoverId, setHoverId] = useState(null);
    const ref = useRef(null);

    useEffect(() => {
      let alive = true;
      loadWorld().then(g => alive && setGeo(g)).catch(e => console.warn('world load failed', e));
      return () => { alive = false; };
    }, []);

    // Visible signals after filters
    const visibleSignals = useMemo(() => {
      return signals.filter(s => {
        if (!s.locations || !s.locations.length) return false;
        if (s.locations[0].lon == null) return false;
        if (s.locConfidence < 0.5) return false; // require map-able geo
        if (s.confidence < minConfidence) return false;
        if (activeCategories && !activeCategories.includes(s.category)) return false;
        return true;
      });
    }, [signals, minConfidence, activeCategories]);

    // Country paths
    const countryPaths = useMemo(() => {
      if (!geo) return [];
      return geo.features.map(f => ({
        id: f.id,
        name: f.properties && f.properties.name,
        d: geometryToPath(f.geometry, width, height),
      }));
    }, [geo, width, height]);

    // Graticule
    const graticule = useMemo(() => {
      const lines = [];
      for (let lon = -180; lon <= 180; lon += 30) {
        const x = ((lon + 180) / 360) * width;
        lines.push(<line key={'lo'+lon} x1={x} y1={0} x2={x} y2={height} stroke="var(--grid)" strokeWidth="0.5" />);
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = ((90 - lat) / 180) * height;
        lines.push(<line key={'la'+lat} x1={0} y1={y} x2={width} y2={y} stroke="var(--grid)" strokeWidth="0.5" />);
      }
      return lines;
    }, [width, height]);

    const handleClick = useCallback((s, e) => {
      e.stopPropagation();
      onSelect && onSelect(s.id);
    }, [onSelect]);

    return (
      <div className="sm-map" ref={ref} style={{ position: 'relative', width: '100%', height: '100%' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid slice"
          style={{ width: '100%', height: '100%', display: 'block', background: 'var(--bg-map)' }}
          onClick={() => onSelect && onSelect(null)}
        >
          {/* Graticule */}
          <g opacity="0.5">{graticule}</g>

          {/* Countries */}
          <g>
            {countryPaths.map((c, idx) => (
              <path
                key={c.id || ('c'+idx)}
                d={c.d}
                fill="var(--land)"
                stroke="var(--land-stroke)"
                strokeWidth="0.4"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          {/* Cables (context) */}
          {showCables && (contextLayers.cables || []).map(cable => {
            const d = cable.path.map(([lon, lat], i) => {
              const [x, y] = project(lon, lat);
              return (i === 0 ? 'M' : 'L') + (x * width).toFixed(1) + ',' + (y * height).toFixed(1);
            }).join('');
            return (
              <path key={cable.id} d={d}
                stroke="var(--ink-4)" strokeWidth="0.8" fill="none"
                strokeDasharray="3 3" opacity="0.55"
              />
            );
          })}

          {/* Datacenters (context) */}
          {showDatacenters && (contextLayers.datacenters || []).map(dc => {
            const [x, y] = project(dc.lon, dc.lat);
            return (
              <g key={dc.id} transform={`translate(${x*width} ${y*height})`} opacity="0.55">
                <rect x="-3" y="-3" width="6" height="6"
                  fill="none" stroke="var(--ink-3)" strokeWidth="0.8"
                  transform="rotate(45)"
                />
              </g>
            );
          })}

          {/* Watchlist region halos */}
          {watchlistRegions.map(r => r.bbox && (
            <rect key={r.id}
              x={((r.bbox[0]+180)/360)*width}
              y={((90-r.bbox[3])/180)*height}
              width={((r.bbox[2]-r.bbox[0])/360)*width}
              height={((r.bbox[3]-r.bbox[1])/180)*height}
              fill="var(--watchlist-soft)"
              stroke="var(--watchlist)"
              strokeWidth="0.6"
              strokeDasharray="2 3"
              rx="2"
              pointerEvents="none"
              opacity="0.85"
            />
          ))}

          {/* Signal markers */}
          <g>
            {visibleSignals.map(s => {
              const loc = s.locations[0];
              const [nx, ny] = project(loc.lon, loc.lat);
              const x = nx * width, y = ny * height;
              const isSelected = selectedId === s.id;
              const isHover = hoverId === s.id;
              const isInternet = s.category === 'internet';
              const isProvider = s.category === 'provider';
              const sevColor =
                s.severity === 'critical' ? 'var(--sev-critical)' :
                s.severity === 'major' ? 'var(--sev-major)' :
                s.severity === 'minor' ? 'var(--sev-minor)' : 'var(--sev-info)';
              const catColor = `var(--cat-${s.category})`;
              const ring = isInternet ? sevColor : catColor;
              const baseR = isInternet ? 5.5 : (isProvider ? 5 : 4);
              const r = isSelected ? baseR + 2 : (isHover ? baseR + 1 : baseR);

              return (
                <g key={s.id}
                   transform={`translate(${x} ${y})`}
                   onMouseEnter={() => setHoverId(s.id)}
                   onMouseLeave={() => setHoverId(null)}
                   onClick={(e) => handleClick(s, e)}
                   style={{ cursor: 'pointer' }}>
                  {/* watchlist outer ring */}
                  {s.watchlistMatch && (
                    <circle r={r + 6} fill="none" stroke="var(--watchlist)" strokeWidth="1" opacity="0.7" />
                  )}
                  {/* pulse for internet incidents */}
                  {isInternet && (
                    <circle r={r} fill={ring} opacity="0.18">
                      <animate attributeName="r" values={`${r};${r+10};${r}`} dur="2.4s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.25;0;0.25" dur="2.4s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* outer glow */}
                  <circle r={r + 2} fill={ring} opacity="0.2" />
                  {/* marker */}
                  {isInternet ? (
                    s.radarKind === 'outage' ? (
                      // Outage: filled square, sharper
                      <rect x={-r} y={-r} width={r*2} height={r*2} fill={ring} stroke="var(--bg-map)" strokeWidth="1" />
                    ) : (
                      // Anomaly: hollow ring with cross
                      <g>
                        <circle r={r} fill="var(--bg-map)" stroke={ring} strokeWidth="1.5" />
                        <line x1={-r*0.6} y1="0" x2={r*0.6} y2="0" stroke={ring} strokeWidth="1.2" />
                        <line x1="0" y1={-r*0.6} x2="0" y2={r*0.6} stroke={ring} strokeWidth="1.2" />
                      </g>
                    )
                  ) : isProvider ? (
                    // Provider: diamond
                    <g transform="rotate(45)">
                      <rect x={-r*0.85} y={-r*0.85} width={r*1.7} height={r*1.7} fill={ring} stroke="var(--bg-map)" strokeWidth="0.8" />
                    </g>
                  ) : (
                    // News/event: filled circle
                    <circle r={r} fill={ring} stroke="var(--bg-map)" strokeWidth="0.8" />
                  )}

                  {/* selection ring */}
                  {isSelected && (
                    <circle r={r + 5} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
                  )}

                  {/* severity dot for critical */}
                  {s.severity === 'critical' && !isInternet && (
                    <circle r="1.5" cx={r*0.7} cy={-r*0.7} fill="var(--sev-critical)" stroke="var(--bg-map)" strokeWidth="0.6" />
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hover tooltip */}
        {hoverId && (() => {
          const s = visibleSignals.find(x => x.id === hoverId);
          if (!s) return null;
          const loc = s.locations[0];
          const [nx, ny] = project(loc.lon, loc.lat);
          return (
            <div className="sm-map-tip" style={{
              left: `${nx * 100}%`,
              top: `${ny * 100}%`,
            }}>
              <div className="sm-map-tip-cat" style={{ color: `var(--cat-${s.category})` }}>
                {s.category.toUpperCase()} · {(s.severity||'').toUpperCase()}
              </div>
              <div className="sm-map-tip-title">{s.title}</div>
              <div className="sm-map-tip-meta">
                <span>{loc.name}</span>
                <span>·</span>
                <span className="mono tnum">{Math.round(s.confidence*100)}%</span>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  window.WorldMap = WorldMap;
})();
