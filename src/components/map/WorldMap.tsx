import { useEffect, useState, useMemo, useRef } from 'preact/hooks';
import { feature } from 'topojson-client';
import { geoEquirectangular, geoPath } from 'd3-geo';
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
import { UNDERSEA_CABLES } from '../../data/undersea-cables.ts';
import { MapMarker } from './MapMarker.tsx';

const WIDTH = 960;
const HEIGHT = 480;

const REGION_BBOX: Record<string, [number, number, number, number]> = {
  na:    [-170, 5,  -50, 75],
  eu:    [-25,  35,  45, 72],
  mena:  [-20,  10,  65, 40],
  apac:  [60,  -45, 180, 55],
  sa:    [60,    5,  95, 38],
  af:    [-20, -38,  55, 38],
  latam: [-95, -57, -30, 15],
  // global has no bbox (full world); skip rendering when watched
};

export function WorldMap() {
  const [topo, setTopo] = useState<Topology | null>(null);
  const [error, setError] = useState(false);
  const [zoomTransform, setZoomTransform] = useState('');
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
                fill="var(--land)"
                stroke="var(--land-stroke)"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          {/* Undersea cables — filtered by mapControls.showCables level */}
          <g data-testid="signalmap-worldmap-cables">
            {(() => {
              if (!projection || !pathGen) return null;
              const level = readOverlayLevel(mapControls.value.showCables);
              if (level === 'off') return null;

              let cables: typeof UNDERSEA_CABLES;
              if (level === 'main') {
                cables = UNDERSEA_CABLES.filter(c => c.major);
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
                  c.landingPoints?.some(lp =>
                    incidentCountries.has(lp.countryName.toLowerCase()),
                  ) ?? false,
                );
              }

              return cables.map((cable) => {
                const d = pathGen({ type: 'LineString', coordinates: cable.points } as never);
                if (!d) return null;
                return (
                  <path
                    key={cable.id}
                    d={d}
                    fill="none"
                    stroke="#5fa6c0"
                    strokeWidth={cable.major ? 0.18 : 0.1}
                    strokeOpacity={0.35}
                    vectorEffect="non-scaling-stroke"
                    data-testid={`signalmap-worldmap-cable-${cable.id}`}
                  >
                    <title>{cable.name}</title>
                  </path>
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
          {/* Event markers */}
          <g data-testid="signalmap-worldmap-markers">
            {projection && mappableEvents.value.map((ev) => {
              const loc = ev.locations[0];
              // Type guard already passed in mappableEvents — but re-narrow for TS:
              if (typeof loc?.lon !== 'number' || typeof loc?.lat !== 'number') return null;
              const xy = projection([loc.lon, loc.lat]);
              if (!xy) return null;
              return <MapMarker key={ev.id} event={ev} cx={xy[0]} cy={xy[1]} />;
            })}
          </g>
        </g>
      )}
    </svg>
  );
}
