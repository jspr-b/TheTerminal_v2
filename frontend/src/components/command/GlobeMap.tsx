"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { Layer, Marker, Source, type CircleLayerSpecification, type MapMouseEvent, type MapRef, type ViewStateChangeEvent } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, type CommandLocation, type CustomerDot } from "@/lib/api";
import { landImage } from "./landImage";

export interface PlacedLocation extends CommandLocation {
  position: [number, number];
}

/** City-level heat: one point per city, weight 0-1. Ramp runs from transparent to the hottest colour. */
export interface HeatmapData {
  points: { position: [number, number]; weight: number }[];
  ramp: [string, string, string, string];
}

/** One customer at one Shopify shipping address. `exact` false: Shopify gave no map position, so it sits near the city centre. */
export interface PlacedCustomer {
  dot: CustomerDot;
  position: [number, number];
  exact: boolean;
}

/** Order cities (exact Shopify, only cities with enough orders): frame the globe's home view. */
export interface OrderCity {
  name: string;
  country: string | null;
  position: [number, number];
  orders: number;
}

/** A product hovered in "Needs attention": the labels show its stock per location. */
export interface FocusProduct {
  title: string;
  at: Record<string, number>;
}

interface PointCollection {
  type: "FeatureCollection";
  features: { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: Record<string, number | string> }[];
}

type Side = "top" | "bottom" | "left" | "right";
const SIDES: Side[] = ["top", "bottom", "left", "right"];
const SIDE_CLASS: Record<Side, string> = {
  top: "bottom-full left-1/2 mb-2.5 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2.5 -translate-x-1/2",
  left: "right-full top-1/2 mr-3 -translate-y-1/2",
  right: "left-full top-1/2 ml-3 -translate-y-1/2",
};
const HOME_ZOOM = 2.7;
const MIN_ZOOM = 0.9;   // zoom out far enough to see the whole globe
const MAX_ZOOM = 15;  // street level: customer dots sit on their shipping address
const IDLE_MS = 4000;   // after you let go, the globe waits this long before drifting back
const SWAY_MAX_ZOOM = 4; // closer than this the map holds still: the sway is sized for the whole globe

function NodeShape({ kind, size }: { kind: string; size: number }) {
  const stroke = "#7c8cff";
  if (kind === "warehouse") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="5" fill="#14142a" stroke={stroke} strokeWidth="2.5" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="#14142a" stroke={stroke} strokeWidth="2.5" />
    </svg>
  );
}

const sizeFor = (units: number, max: number) => 20 + (max > 0 ? Math.sqrt(units / max) * 14 : 0);

function points(list: { position: [number, number]; props: Record<string, number | string> }[]): PointCollection {
  return { type: "FeatureCollection", features: list.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p.position }, properties: p.props })) };
}

export default function GlobeMap({
  locations,
  selected,
  onSelect,
  heatmap = null,
  cities = [],
  focus = null,
  people = [],
  chosenPerson = null,
  onPerson,
  insets = { right: 0, bottom: 0 },
}: {
  locations: PlacedLocation[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  heatmap?: HeatmapData | null;
  cities?: OrderCity[];
  focus?: FocusProduct | null;
  /** One green dot per customer per shipping address. */
  people?: PlacedCustomer[];
  chosenPerson?: PlacedCustomer | null;
  /** One customer's dot was clicked. Overlapping dots zoom the map in first, until each customer stands alone. */
  onPerson?: (hit: PlacedCustomer) => void;
  /** Pixels covered by panels on the right and bottom: the globe centres in the free space. */
  insets?: { right: number; bottom: number };
}) {
  const mapRef = useRef<MapRef | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; people: PlacedCustomer[] } | null>(null);
  const [sides, setSides] = useState<Record<string, Side>>({});
  const [zoom, setZoom] = useState(HOME_ZOOM);
  const motion = useRef({ t0: 0, lastTouch: 0, dragging: false, paused: false, hold: false, hovering: false, pointer: null as [number, number] | null, home: [0, 50] as [number, number] });
  motion.current.paused = paused;
  // a customer is open: the map holds still on them
  motion.current.hold = chosenPerson !== null;

  // Same atmosphere and darkening as the first Terminal map.
  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const paint = (layer: string, property: string, value: unknown) => {
      if (map.getLayer(layer)) map.setPaintProperty(layer, property as never, value as never);
    };
    paint("water", "fill-color", "#080812");
    paint("land", "background-color", "#0f0f1a");
    // A thin, crisp rim instead of a wide glow: dark space, a narrow violet-grey horizon.
    // No haze over the land: fog colour = water colour, fog only far away. The rim is one thin line of light.
    // Minimal space behind it: deep dark blue-black with a few faint stars.
    map.setFog({ color: "#080812", "high-color": "#1b1f45", "space-color": "#03030a", "horizon-blend": 0.012, "star-intensity": 0.22, range: [3, 14] });
    paint("admin-0-boundary", "line-color", "#2a2a3e");
    paint("admin-0-boundary", "line-opacity", 0.3);
    paint("admin-1-boundary", "line-opacity", 0.1);
    for (const layer of map.getStyle()?.layers ?? []) {
      if (layer.id.includes("label") || layer.id.includes("poi") || layer.id.includes("road")) {
        map.setLayoutProperty(layer.id, "visibility", layer.id === "country-label" ? "visible" : "none");
      }
      // No nature: parks, land cover, glaciers, hillshade, rivers.
      if (/landuse|landcover|national-park|park|hillshade|wetland|glacier|waterway|building|aeroway|land-structure/.test(layer.id)) {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    }
    paint("country-label", "text-opacity", 0.25);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __map?: unknown }).__map = map;   // dev checks only
    setReady(true);
  }, []);

  // Home: the middle of where the shop is (its locations and its order cities).
  const home = useMemo<[number, number]>(() => {
    const all = [...locations.map((l) => l.position), ...cities.map((c) => c.position)];
    if (all.length === 0) return [0, 30];
    return [all.reduce((a, p) => a + p[0], 0) / all.length, all.reduce((a, p) => a + p[1], 0) / all.length];
  }, [locations, cities]);
  motion.current.home = home;

  const goHome = useCallback((animate = true) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    motion.current.t0 = performance.now();
    motion.current.lastTouch = 0;
    if (animate) map.easeTo({ center: home, zoom: HOME_ZOOM, duration: 1200 });
    else map.jumpTo({ center: home, zoom: HOME_ZOOM });
  }, [home]);

  useEffect(() => {
    if (ready && locations.length > 0) goHome(false);
    // only once the shop is known; later changes (e.g. cities) keep the user's view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locations.length]);

  // Keep the globe centred in the space the panels leave free.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready) return;
    map.easeTo({ padding: { top: 0, left: 0, right: insets.right, bottom: insets.bottom }, duration: 450 });
  }, [insets.right, insets.bottom, ready]);

  // Always moving: a slow sway over the selling region (never a spin over empty oceans).
  // After a drag or zoom it waits, then drifts back into the sway.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    let raf = 0;
    const tick = (now: number) => {
      const m = motion.current;
      // over a dot only while one is really under the pointer (the map may have moved since the last mouse move)
      if (m.hovering && m.pointer) m.hovering = map.getLayer("people-hit") ? map.queryRenderedFeatures(m.pointer, { layers: ["people-hit"] }).length > 0 : false;
      const still = m.paused || m.hold || m.hovering || m.dragging || map.getZoom() > SWAY_MAX_ZOOM;
      if (still) m.lastTouch = Math.max(m.lastTouch, now - IDLE_MS + 1500);   // resume gently, not with a jump
      else if (now - m.lastTouch > IDLE_MS && !map.isEasing()) {
        const t = (now - m.t0) / 1000;
        const target: [number, number] = [m.home[0] + 12 * Math.sin(t / 9.5), m.home[1] + 3 * Math.sin(t / 13)];
        const c = map.getCenter();
        const k = 0.02;   // eases in from wherever you left it
        map.jumpTo({ center: [c.lng + (target[0] - c.lng) * k, c.lat + (target[1] - c.lat) * k] });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  const touch = useCallback((e: ViewStateChangeEvent) => {
    if ("originalEvent" in e && e.originalEvent) motion.current.lastTouch = performance.now();   // only the user's own moves
  }, []);

  const maxUnits = Math.max(0, ...locations.map((l) => l.units));

  // Labels: each takes the first side where it overlaps no other label or marker. Re-checked as the globe moves.
  const placeLabels = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const pts = locations.map((l) => ({ id: l.id, p: map.project(l.position) }));
    const taken = pts.map(({ id, p }) => ({ id, l: p.x - 18, t: p.y - 18, r: p.x + 18, b: p.y + 18 }));
    const next: Record<string, Side> = {};
    for (const { id, p } of pts) {
      const loc = locations.find((l) => l.id === id);
      if (!loc) continue;
      const w = focus ? 150 : loc.name.length * 7.4 + 80;
      const h = 27;
      for (const side of SIDES) {
        const l = side === "right" ? p.x + 22 : side === "left" ? p.x - 22 - w : p.x - w / 2;
        const t = side === "top" ? p.y - 24 - h : side === "bottom" ? p.y + 24 : p.y - h / 2;
        const box = { l, t, r: l + w, b: t + h };
        if (!taken.some((o) => o.id !== id && box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t)) {
          next[id] = side;
          taken.push({ id, ...box });
          break;
        }
      }
      next[id] ??= "top";
    }
    setSides((prev) => (Object.keys(next).every((k) => prev[k] === next[k]) && Object.keys(prev).length === Object.keys(next).length ? prev : next));
  }, [locations, focus]);
  useEffect(() => {
    if (ready) placeLabels();
  }, [ready, placeLabels]);
  const peopleData = useMemo(() => points(people.map((p, i) => ({ position: p.position, props: { i } }))), [people]);
  // Heat and dots: one image on the globe surface, below the water, so the sea covers them (see landImage.ts).
  // Redrawn after each zoom (rounded) so it stays sharp; between redraws it scales with the map.
  const zoomKey = Math.round(zoom * 4) / 4;
  const surface = useMemo(
    () =>
      ready
        ? landImage({
            zoom: zoomKey,
            heat: heatmap && heatmap.points.length > 0 ? heatmap.points : null,
            ramp: heatmap?.ramp ?? null,
            dots: [],
          })
        : null,
    [ready, zoomKey, heatmap],
  );
  // Customers: one fixed green point each, the same size at every zoom, at their shipping address.
  const cityPaint = useMemo<CircleLayerSpecification["paint"]>(
    () => ({ "circle-radius": 3.5, "circle-color": "#4ade80", "circle-stroke-width": 1, "circle-stroke-color": "#0b2a18", "circle-pitch-alignment": "viewport", "circle-opacity": 0.95 }),
    [],
  );
  const cityHit = useMemo<CircleLayerSpecification["paint"]>(() => ({ "circle-radius": 6, "circle-opacity": 0 }), []);
  const chosenData = useMemo(() => {
    const at = chosenPerson?.position;
    return points(at ? [{ position: at, props: { i: 0 } }] : []);
  }, [chosenPerson]);
  const hits = useCallback(
    (e: MapMouseEvent) =>
      (e.features ?? []).flatMap((f) => {
        const i = (f as { properties?: Record<string, unknown> | null }).properties?.i;
        return typeof i === "number" && people[i] ? [people[i]] : [];
      }),
    [people],
  );
  const below = ready && mapRef.current?.getMap()?.getLayer("water") ? "water" : undefined;

  const onMove = useCallback(
    (e: MapMouseEvent) => {
      const all = hits(e);
      motion.current.hovering = all.length > 0;
      motion.current.pointer = [e.point.x, e.point.y];
      setTip(all.length ? { x: e.point.x, y: e.point.y, people: all } : null);
    },
    [hits],
  );

  const zoomBy = (d: number) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    motion.current.lastTouch = performance.now();
    map.easeTo({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, map.getZoom() + d)), duration: 300 });
  };

  return (
    <>
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: 5, latitude: 48, zoom: HOME_ZOOM, pitch: 0, bearing: 0 }}
        style={{ position: "absolute", inset: 0 }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        projection="globe"
        onLoad={handleLoad}
        onMoveEnd={placeLabels}
        onClick={(e) => {
          const all = hits(e);
          setTip(null);
          if (!all.length || !onPerson) return onSelect(null);
          const lons = all.map((p) => p.position[0]);
          const lats = all.map((p) => p.position[1]);
          const spread = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats));
          const map = mapRef.current?.getMap();
          // several customers under the pointer at different addresses: zoom in on them instead of guessing one
          if (all.length > 1 && spread > 1e-5 && map && map.getZoom() < MAX_ZOOM - 0.5) {
            motion.current.lastTouch = performance.now();
            map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], {
              padding: { top: 80, bottom: 80 + insets.bottom, left: 80, right: 80 + insets.right },
              maxZoom: MAX_ZOOM,
              duration: 900,
            });
            return;
          }
          onPerson(all[0]);
        }}
        onDragStart={(e) => {
          motion.current.dragging = true;
          touch(e);
        }}
        onDragEnd={(e) => {
          motion.current.dragging = false;
          touch(e);
        }}
        onZoomStart={touch}
        onZoomEnd={(e) => {
          touch(e);
          setZoom(e.viewState.zoom);
        }}
        onMouseMove={onMove}
        onMouseLeave={() => {
          motion.current.hovering = false;
          setTip(null);
        }}
        interactiveLayerIds={ready ? ["people-hit"] : []}
        cursor={tip ? "pointer" : "grab"}
        dragRotate={false}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxPitch={0}
        minPitch={0}
      >
        {surface && (
          <Source id="land-surface" type="image" url={surface.url} coordinates={surface.coordinates}>
            <Layer id="land-surface" type="raster" paint={{ "raster-opacity": 1, "raster-fade-duration": 0, "raster-resampling": "linear" }} beforeId={below} />
          </Source>
        )}
        {ready && (
          <Source id="people" type="geojson" data={peopleData}>
            <Layer id="people-points" type="circle" paint={cityPaint} />
            <Layer id="people-hit" type="circle" paint={cityHit} />
          </Source>
        )}
        {ready && (
          <Source id="chosen-city" type="geojson" data={chosenData}>
            <Layer id="chosen-ring" type="circle" paint={{ "circle-radius": 8, "circle-color": "rgba(74,222,128,0.12)", "circle-stroke-width": 1.5, "circle-stroke-color": "#4ade80", "circle-pitch-alignment": "viewport" }} />
          </Source>
        )}
        {locations.map((l) => {
          const dim = selected !== null && selected !== l.id;
          const here = focus ? (focus.at[l.id] ?? 0) : null;
          return (
            <Marker
              key={l.id}
              longitude={l.position[0]}
              latitude={l.position[1]}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelect(l.id);
              }}
            >
              <button
                aria-label={l.name}
                onMouseEnter={() => setTip(null)}
                className="relative block cursor-pointer"
                style={{ opacity: dim ? 0.35 : 1 }}
              >
                <NodeShape kind={l.kind} size={sizeFor(l.units, maxUnits)} />
                <span className={`pointer-events-none absolute ${SIDE_CLASS[sides[l.id] ?? "top"]} whitespace-nowrap rounded-[9px] border border-accent/45 bg-[#0c0c1a]/92 px-2.5 py-1 text-left text-xs shadow-lg`}>
                  {focus ? (
                    <>
                      <b className="font-semibold">{l.city ?? l.name}</b> <span className="font-mono text-[15px]">{here}</span> <span className="text-[11px] text-muted">of {focus.title}</span>
                    </>
                  ) : (
                    <>
                      <b className="font-semibold">{l.name}</b> <span className="text-[11px] text-muted">· {l.units.toLocaleString()} units</span>
                    </>
                  )}
                </span>
              </button>
            </Marker>
          );
        })}
      </MapGL>
      {tip && (
        <div className="pointer-events-none absolute z-[8] w-max max-w-[280px] whitespace-normal break-words rounded-[9px] border border-[#4ade80]/40 bg-[#0f0f1c]/96 px-2.5 py-1.5 text-xs" style={{ left: tip.x + 14, top: tip.y - 44 }}>
          {tip.people.length === 1 ? (
            <>
              <b className="font-semibold">Customer {tip.people[0].dot.code}</b>{" "}
              <span className="text-[11px] text-muted">
                · {tip.people[0].dot.orders} {tip.people[0].dot.orders === 1 ? "order" : "orders"}, last 14 days
              </span>
              <span className="source-chip">Shopify</span>
              <span className="block text-[11px] leading-snug text-[#c9c9d8]">
                {[tip.people[0].dot.street, [tip.people[0].dot.zip, tip.people[0].dot.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                {!tip.people[0].exact && <span className="text-muted"> · no map position, shown at the city</span>}
              </span>
              <span className="block text-[11px] text-[#86efac]">Click for the customer card →</span>
            </>
          ) : (
            <>
              <b className="font-semibold">{tip.people.length} customers</b> <span className="text-[11px] text-muted">· {tip.people[0].dot.city}</span>
              <span className="source-chip">Shopify</span>
              <span className="block text-[11px] text-[#86efac]">Click to zoom in on them →</span>
            </>
          )}
        </div>
      )}
      {/* map controls: one small group in the corner */}
      <div
        className="absolute left-3.5 z-[6] flex flex-col overflow-hidden rounded-[10px] border border-edge bg-[#0c0c16]/88 transition-[bottom] duration-[450ms]"
        style={{ bottom: insets.bottom + (insets.bottom ? 14 : 40) }}
        role="group"
        aria-label="Map controls"
      >
        {(
          [
            ["+", "Zoom in", () => zoomBy(1)],
            ["−", "Zoom out", () => zoomBy(-1)],
            ["⌂", "Back to your region", () => goHome(true)],
            [paused ? "▶" : "❙❙", paused ? "Start moving" : "Pause movement", () => setPaused((p) => !p)],
          ] as const
        ).map(([label, aria, act], i) => (
          <button key={aria} type="button" onClick={act} aria-label={aria} title={aria} className={`h-[30px] w-8 text-[15px] text-muted hover:bg-white/[0.05] hover:text-[#e7e7f0] ${i ? "border-t border-edge" : ""}`}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
