import { useEffect, useState, useMemo, useRef } from 'preact/hooks';
import { feature } from 'topojson-client';
import { geoEquirectangular, geoPath, geoInterpolate } from 'd3-geo';
import { zoom, type D3ZoomEvent } from 'd3-zoom';
import { select } from 'd3-selection';
import type { Topology } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';
import { mappableEvents } from '../../state/signals.ts';
import {
  regions as watchedRegions,
  mapControls,
  readOverlayLevel,
} from '../../state/watchlist.ts';
import { categories as activeCategories } from '../../state/filters.ts';
import { REGION_BBOX, eventInRegions } from '../../state/regions.ts';
import { UNDERSEA_CABLES, FLAGSHIP_CABLE_IDS } from '../../data/undersea-cables.ts';
import { DATA_CENTERS, FLAGSHIP_DATACENTER_IDS } from '../../data/datacenters.ts';
import { MapMarker } from './MapMarker.tsx';

const WIDTH = 960;
const HEIGHT = 480;

// Cables are stored as a small set of waypoints; rendered straight on an
// equirectangular projection that's a polygonal path, not the smooth arc
// the cable actually follows on the globe. Densify each segment with
// intermediate points along the great-circle arc (d3-geo geoInterpolate),
// then let pathGen project each point. The projection's natural curvature
// + many short segments produces the smooth arc shape.
const DENSIFY_SAMPLES = 32;
const densifyCache = new Map<string, [number, number][]>();
function densifyCablePoints(id: string, pts: [number, number][]): [number, number][] {
  const cached = densifyCache.get(id);
  if (cached) return cached;
  if (pts.length < 2) {
    densifyCache.set(id, pts);
    return pts;
  }
  const out: [number, number][] = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    const interp = geoInterpolate(pts[i]!, pts[i + 1]!);
    for (let s = 1; s <= DENSIFY_SAMPLES; s++) {
      out.push(interp(s / DENSIFY_SAMPLES) as [number, number]);
    }
  }
  densifyCache.set(id, out);
  return out;
}

export function WorldMap() {
  const [topo, setTopo] = useState<Topology | null>(null);
  const [error, setError] = useState(false);
  const [zoomTransform, setZoomTransform] = useState('');
  const [hoverCable, setHoverCable] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/topojson/world-110m.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Topology>;
      })
      .then((data) => {
        if (!cancelled) setTopo(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // d3-zoom binding — element-scoped, no window listeners.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        const { k, x, y } = event.transform;
        if (k === 1 && x === 0 && y === 0) {
          setZoomTransform('');
        } else {
          setZoomTransform(`translate(${x} ${y}) scale(${k})`);
        }
      });

    // d3-selection generic friction with Preact refs is well-known. Use one
    // narrowly-scoped any cast at the boundary; do not propagate.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select(svgEl as any).call(zoomBehavior);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select(svgEl as any).on('.zoom', null);
    };
  }, []);

  const { paths, projection, pathGen } = useMemo(() => {
    if (!topo) return { paths: [] as { d: string; key: string | number }[], projection: null, pathGen: null };

    const collection = feature(
      topo,
      // topojson-specification types the objects index as any-valued record;
      // we need to cast through unknown because the inferred return type depends
      // on the geometry object type, which is not statically known here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (topo as any).objects.countries,
    ) as unknown as FeatureCollection<Geometry>;

    const proj = geoEquirectangular().fitSize([WIDTH, HEIGHT], collection);
    const pathGen = geoPath(proj);

    const out = collection.features.map((f, i) => ({
      d: pathGen(f) ?? '',
      key: (f.id as string | number | undefined) ?? i,
    }));

    return { paths: out, projection: proj, pathGen };
  }, [topo]);

  return (
    <>
      <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      data-testid="signalmap-worldmap"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        filter: `brightness(${mapControls.value.brightness ?? 1})`,
      }}
    >
      {error ? (
        <text
          data-testid="signalmap-worldmap-error"
          x={WIDTH / 2}
          y={HEIGHT / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
        >
          map asset unavailable
        </text>
      ) : (
        <g data-testid="signalmap-worldmap-zoom" transform={zoomTransform || undefined}>
          <g data-testid="signalmap-worldmap-base">
            {paths.map(({ d, key }) => (
              <path
                key={key}
                d={d}
                style={{
                  fill: 'var(--land)',
                  stroke: 'var(--land-stroke)',
                  strokeWidth: 0.5,
                  vectorEffect: 'non-scaling-stroke',
                }}
              />
            ))}
          </g>
          {/* Undersea cables — filtered by mapControls.showCables level */}
          <g data-testid="signalmap-worldmap-cables">
            {(() => {
              if (!projection || !pathGen) return null;
              const level = readOverlayLevel(mapControls.value.showCables);
              if (level === 'off') return null;

              // Hoist signal reads to the IIFE top so Preact subscribes to
              // them on this component's render even though the actual use
              // is inside the cables.map() callback below.
              const thickness = mapControls.value.cableThickness ?? 0.1;

              let cables: typeof UNDERSEA_CABLES;
              if (level === 'main') {
                cables = UNDERSEA_CABLES.filter(c => FLAGSHIP_CABLE_IDS.has(c.id));
              } else if (level === 'all') {
                cables = UNDERSEA_CABLES;
              } else {
                // 'incident' — match cables whose landing-point country
                // appears in any active event's location. e.g. a UK
                // routing anomaly highlights every transatlantic cable
                // that lands in Great Britain (Grace Hopper, etc).
                const incidentCountries = new Set<string>();
                for (const ev of mappableEvents.value) {
                  for (const loc of ev.locations) {
                    const name = loc.name.toLowerCase();
                    incidentCountries.add(name);
                    // "Basra, Iraq" → also add "iraq"
                    const parts = name.split(',').map(p => p.trim());
                    if (parts.length > 1) incidentCountries.add(parts[parts.length - 1]!);
                  }
                }
                cables = UNDERSEA_CABLES.filter(c =>
                  FLAGSHIP_CABLE_IDS.has(c.id) &&
                  (c.landingPoints?.some(lp =>
                    incidentCountries.has(lp.countryName.toLowerCase()),
                  ) ?? false),
                );
              }

              return cables.map((cable) => {
                const densePoints = densifyCablePoints(cable.id, cable.points);
                const d = pathGen({ type: 'LineString', coordinates: densePoints } as never);
                if (!d) return null;
                const isHovered = hoverCable?.id === cable.id;
                return (
                  <g key={cable.id}>
                    {/* Visible path */}
                    <path
                      d={d}
                      data-testid={`signalmap-worldmap-cable-${cable.id}`}
                      style={{
                        fill: 'none',
                        stroke: isHovered ? '#a8e3f5' : '#5fa6c0',
                        strokeWidth: (thickness * (cable.major ? 1 : 0.7)) * (isHovered ? 2.5 : 1),
                        strokeOpacity: isHovered ? 0.95 : 0.5,
                        pointerEvents: 'none',
                        transition: 'stroke 80ms, stroke-width 80ms, stroke-opacity 80ms',
                      }}
                    >
                      <title>{cable.name} — {cable.id}</title>
                    </path>
                    {/* Wide invisible hit zone for hover */}
                    <path
                      d={d}
                      data-testid={`signalmap-worldmap-cable-hit-${cable.id}`}
                      style={{
                        fill: 'none',
                        stroke: 'transparent',
                        strokeWidth: 4,
                        pointerEvents: 'stroke',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e: MouseEvent) =>
                        setHoverCable({ id: cable.id, name: cable.name, x: e.clientX, y: e.clientY })
                      }
                      onMouseMove={(e: MouseEvent) =>
                        setHoverCable({ id: cable.id, name: cable.name, x: e.clientX, y: e.clientY })
                      }
                      onMouseLeave={() => setHoverCable(null)}
                    />
                  </g>
                );
              });
            })()}
          </g>
          {/* Datacenters — filtered by mapControls.showDatacenters level */}
          <g data-testid="signalmap-worldmap-datacenters">
            {(() => {
              if (!projection) return null;
              const level = readOverlayLevel(mapControls.value.showDatacenters);
              if (level === 'off') return null;

              let dcs: typeof DATA_CENTERS;
              if (level === 'main') {
                dcs = DATA_CENTERS.filter(d => FLAGSHIP_DATACENTER_IDS.has(d.id));
              } else if (level === 'all') {
                dcs = DATA_CENTERS;
              } else {
                // 'incident' — DCs whose country matches an active event's country.
                const incidentCountries = new Set<string>();
                for (const ev of mappableEvents.value) {
                  for (const loc of ev.locations) {
                    const name = loc.name.toLowerCase();
                    incidentCountries.add(name);
                    const parts = name.split(',').map(p => p.trim());
                    if (parts.length > 1) incidentCountries.add(parts[parts.length - 1]!);
                  }
                }
                dcs = DATA_CENTERS.filter(d =>
                  FLAGSHIP_DATACENTER_IDS.has(d.id) &&
                  incidentCountries.has(d.country.toLowerCase()),
                );
              }

              return dcs.map((dc) => {
                const xy = projection([dc.lon, dc.lat]);
                if (!xy) return null;
                const size = 1.4;
                return (
                  <g key={dc.id}>
                    <rect
                      x={xy[0] - size / 2}
                      y={xy[1] - size / 2}
                      width={size}
                      height={size}
                      data-testid={`signalmap-worldmap-datacenter-${dc.id}`}
                      style={{
                        fill: '#ffb020',
                        fillOpacity: 0.7,
                        stroke: 'rgba(255,176,32,0.3)',
                        strokeWidth: 0.4,
                        pointerEvents: 'none',
                      }}
                    >
                      <title>{dc.name} — {dc.owner}</title>
                    </rect>
                    <rect
                      x={xy[0] - 2}
                      y={xy[1] - 2}
                      width={4}
                      height={4}
                      data-testid={`signalmap-worldmap-datacenter-hit-${dc.id}`}
                      style={{
                        fill: 'transparent',
                        cursor: 'pointer',
                        pointerEvents: 'all',
                      }}
                      onMouseEnter={(e: MouseEvent) =>
                        setHoverCable({ id: dc.id, name: `${dc.name} (${dc.country})`, x: e.clientX, y: e.clientY })
                      }
                      onMouseMove={(e: MouseEvent) =>
                        setHoverCable({ id: dc.id, name: `${dc.name} (${dc.country})`, x: e.clientX, y: e.clientY })
                      }
                      onMouseLeave={() => setHoverCable(null)}
                    />
                  </g>
                );
              });
            })()}
          </g>
          {/* Watchlist region halos */}
          <g data-testid="signalmap-worldmap-halos">
            {(() => {
              if (!projection) return null;
              return watchedRegions.value.map((rid) => {
                const bbox = REGION_BBOX[rid];
                if (!bbox) return null;
                const [minLon, minLat, maxLon, maxLat] = bbox;
                const tl = projection([minLon, maxLat]);
                const br = projection([maxLon, minLat]);
                if (!tl || !br) return null;
                const x = Math.min(tl[0], br[0]);
                const y = Math.min(tl[1], br[1]);
                const w = Math.abs(br[0] - tl[0]);
                const h = Math.abs(br[1] - tl[1]);
                return (
                  <rect
                    key={rid}
                    x={x} y={y} width={w} height={h}
                    fill="var(--watchlist-soft)"
                    stroke="var(--watchlist)"
                    strokeWidth={0.6}
                    strokeDasharray="2 3"
                    rx={2}
                    pointerEvents="none"
                    opacity={0.85}
                    data-testid={`signalmap-worldmap-halo-${rid}`}
                  />
                );
              });
            })()}
          </g>
          {/* Event markers — category + region filtered the same way the
              LiveFeed is, so toggling a Signal Layers chip in the rail
              hides those markers on the map too. */}
          <g data-testid="signalmap-worldmap-markers">
            {projection && mappableEvents.value
              .filter((ev) => activeCategories.value.includes(ev.category))
              .filter((ev) => eventInRegions(ev, watchedRegions.value))
              .map((ev) => {
                const loc = ev.locations[0];
                if (typeof loc?.lon !== 'number' || typeof loc?.lat !== 'number') return null;
                const xy = projection([loc.lon, loc.lat]);
                if (!xy) return null;
                return <MapMarker key={ev.id} event={ev} cx={xy[0]} cy={xy[1]} />;
              })}
          </g>
        </g>
      )}
      </svg>
      {hoverCable && (
        <div
          className="sm-cable-tip"
          data-testid="signalmap-cable-tip"
          style={{
            position: 'fixed',
            left: hoverCable.x + 14,
            top: hoverCable.y + 14,
            pointerEvents: 'none',
            zIndex: 50,
          }}
        >
          <span className="sm-cable-tip-name">{hoverCable.name}</span>
          <span className="sm-cable-tip-id mono">{hoverCable.id}</span>
        </div>
      )}
    </>
  );
}
