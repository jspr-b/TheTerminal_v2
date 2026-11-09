"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MapGL, { Marker, NavigationControl, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, type CommandLocation } from "@/lib/api";

export interface PlacedLocation extends CommandLocation {
  position: [number, number];
}

type Side = "right" | "left" | "top" | "bottom";
const SIDES: Side[] = ["right", "left", "top", "bottom"];
const LABEL_H = 32;
const GAP = 16;
const SIDE_CLASS: Record<Side, string> = {
  right: "left-full top-1/2 -translate-y-1/2 ml-3 text-left",
  left: "right-full top-1/2 -translate-y-1/2 mr-3 text-right",
  top: "bottom-full left-1/2 -translate-x-1/2 mb-3 text-center",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-3 text-center",
};

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

export default function GlobeMap({ locations, selected, onSelect }: { locations: PlacedLocation[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const mapRef = useRef<MapRef | null>(null);
  const [sides, setSides] = useState<Record<string, Side>>({});
  const [ready, setReady] = useState(false);

  // Same atmosphere and darkening as the first Terminal map.
  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    // Guarded: Mapbox reports an error when a layer is not in this style version.
    const paint = (layer: string, property: string, value: unknown) => {
      if (map.getLayer(layer)) map.setPaintProperty(layer, property as never, value as never);
    };
    paint("water", "fill-color", "#080812");
    paint("land", "background-color", "#0f0f1a");
    map.setFog({ color: "#080812", range: [0.5, 10], "horizon-blend": 0.1 });
    paint("admin-0-boundary", "line-color", "#2a2a3e");
    paint("admin-0-boundary", "line-opacity", 0.3);
    paint("admin-1-boundary", "line-opacity", 0.1);
    for (const layer of map.getStyle()?.layers ?? []) {
      if (layer.id.includes("label") || layer.id.includes("poi") || layer.id.includes("road")) {
        map.setLayoutProperty(layer.id, "visibility", layer.id === "country-label" ? "visible" : "none");
      }
    }
    paint("country-label", "text-opacity", 0.25);
    setReady(true);
  }, []);

  // HTML labels, placed so they never overlap each other or another marker.
  const placeLabels = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const taken = locations.map((l) => {
      const p = map.project(l.position);
      return { id: l.id, l: p.x - 18, t: p.y - 18, r: p.x + 18, b: p.y + 18 };
    });
    const next: Record<string, Side> = {};
    for (const loc of locations) {
      const p = map.project(loc.position);
      const w = Math.max(loc.name.length, 10) * 6.6;
      for (const side of SIDES) {
        const l = side === "right" ? p.x + GAP : side === "left" ? p.x - GAP - w : p.x - w / 2;
        const t = side === "top" ? p.y - GAP - LABEL_H : side === "bottom" ? p.y + GAP : p.y - LABEL_H / 2;
        const box = { l, t, r: l + w, b: t + LABEL_H };
        const hit = taken.some((o) => o.id !== loc.id && box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t);
        if (!hit) {
          next[loc.id] = side;
          taken.push({ id: loc.id, ...box });
          break;
        }
      }
      next[loc.id] ??= "right";
    }
    setSides(next);
  }, [locations]);

  // Centre on the merchant's own locations once they are known.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready || locations.length === 0) return;
    const lng = locations.reduce((a, l) => a + l.position[0], 0) / locations.length;
    const lat = locations.reduce((a, l) => a + l.position[1], 0) / locations.length;
    map.jumpTo({ center: [lng, lat], zoom: 2.4 });
    placeLabels();
  }, [locations, ready, placeLabels]);

  const maxUnits = Math.max(0, ...locations.map((l) => l.units));

  return (
    <MapGL
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={{ longitude: -40, latitude: 25, zoom: 2.2, pitch: 0, bearing: 0 }}
      style={{ position: "absolute", inset: 0 }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      projection="globe"
      onLoad={handleLoad}
      onMoveEnd={placeLabels}
      onClick={() => onSelect(null)}
      dragRotate={false}
      maxPitch={0}
      minPitch={0}
    >
      <NavigationControl position="top-left" showCompass={false} />
      {locations.map((l) => {
        const dim = selected !== null && selected !== l.id;
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
            <button aria-label={l.name} className="relative block cursor-pointer" style={{ opacity: dim ? 0.3 : 1 }}>
              <NodeShape kind={l.kind} size={sizeFor(l.units, maxUnits)} />
              <span className={`pointer-events-none absolute whitespace-nowrap text-[11px] leading-[15px] [text-shadow:0_1px_3px_#000] ${SIDE_CLASS[sides[l.id] ?? "right"]}`}>
                <span className="block text-[#e7e7f0]">{l.name}</span>
                <span className="block text-muted">{l.units.toLocaleString()} units</span>
              </span>
            </button>
          </Marker>
        );
      })}
    </MapGL>
  );
}
