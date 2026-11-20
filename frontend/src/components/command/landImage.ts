/**
 * The heat and the order-city dots, drawn as one image that lies on the globe surface (a raster layer).
 *
 * Why an image: on the globe, Mapbox paints fills (the sea) onto the surface first and draws circle and heatmap
 * layers on top afterwards, whatever the layer order. A raster is painted onto the surface with the fills, so
 * placed below the water layer the sea really covers it: heat and dots show on land only.
 *
 * The image covers the shop's region in Web Mercator, at about screen resolution for the current zoom, and is
 * redrawn after each zoom so it stays sharp.
 */
export interface LandPoint {
  position: [number, number];
  /** 0-1 */
  weight: number;
}

export interface LandImage {
  url: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
}

const TILE = 512;
const MAX_PX = 2048;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-84, Math.min(84, lat)) * Math.PI) / 360));

function hex(c: string): [number, number, number, number] {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a = "1"] = m[1].split(",").map((s) => s.trim());
    return [+r, +g, +b, Math.round(+a * 255)];
  }
  const h = c.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
}

/** Heat radius in screen pixels by zoom, the same curve the Mapbox heatmap used. */
function heatRadius(zoom: number) {
  return zoom <= 1 ? 14 : zoom <= 3 ? 14 + ((zoom - 1) / 2) * 18 : zoom <= 6 ? 32 + ((zoom - 3) / 3) * 28 : 60;
}

export function landImage(opts: { zoom: number; heat: LandPoint[] | null; ramp: [string, string, string, string] | null; dots: LandPoint[] }): LandImage | null {
  const pts = opts.heat ?? opts.dots;
  if (pts.length === 0) return null;
  const pxPerDeg = (TILE * 2 ** opts.zoom) / 360;
  const r = opts.heat ? heatRadius(opts.zoom) : 7;
  const pad = (r * 2.2) / pxPerDeg;
  const lons = pts.map((p) => p.position[0]);
  const lats = pts.map((p) => p.position[1]);
  const west = Math.min(...lons) - pad;
  const east = Math.max(...lons) + pad;
  const north = Math.min(84, Math.max(...lats) + pad * 1.6);
  const south = Math.max(-84, Math.min(...lats) - pad * 1.6);
  // Size in pixels at this zoom; Mercator rows so the image lines up with the map.
  const yN = mercY(north);
  const yS = mercY(south);
  let w = (east - west) * pxPerDeg;
  let h = ((yN - yS) * TILE * 2 ** opts.zoom) / (2 * Math.PI);
  const shrink = Math.max(1, w / MAX_PX, h / MAX_PX);
  w = Math.max(8, Math.round(w / shrink));
  h = Math.max(8, Math.round(h / shrink));
  const toPx = (p: [number, number]) => [((p[0] - west) / (east - west)) * w, ((yN - mercY(p[1])) / (yN - yS)) * h];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const rr = r / shrink;

  if (opts.heat && opts.ramp) {
    // density field (gaussian per city), then coloured with the layer's ramp
    const dens = new Float32Array(w * h);
    const sigma = rr / 2.2;
    for (const p of opts.heat) {
      const [cx, cy] = toPx(p.position);
      const x0 = Math.max(0, Math.floor(cx - rr));
      const x1 = Math.min(w - 1, Math.ceil(cx + rr));
      const y0 = Math.max(0, Math.floor(cy - rr));
      const y1 = Math.min(h - 1, Math.ceil(cy + rr));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const d2 = (x - cx) ** 2 + (y - cy) ** 2;
          if (d2 <= rr * rr) dens[y * w + x] += p.weight * Math.exp(-d2 / (2 * sigma * sigma));
        }
    }
    const stops = opts.ramp.map(hex);
    const at = [0, 0.3, 0.65, 1];
    const img = g.createImageData(w, h);
    for (let i = 0; i < dens.length; i++) {
      const d = Math.min(1, dens[i] * 1.2);
      if (d < 0.02) continue;
      let k = 0;
      while (k < 2 && d > at[k + 1]) k++;
      const t = (d - at[k]) / (at[k + 1] - at[k]);
      const a = stops[k];
      const b = stops[k + 1];
      img.data[i * 4] = a[0] + (b[0] - a[0]) * t;
      img.data[i * 4 + 1] = a[1] + (b[1] - a[1]) * t;
      img.data[i * 4 + 2] = a[2] + (b[2] - a[2]) * t;
      img.data[i * 4 + 3] = (a[3] + (b[3] - a[3]) * t) * 0.85;
    }
    g.putImageData(img, 0, 0);
  } else {
    // order cities: soft dots, bigger for more orders
    for (const p of opts.dots) {
      const [cx, cy] = toPx(p.position);
      const rad = (2.5 + p.weight * 3.5) / shrink;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.6);
      grad.addColorStop(0, "rgba(170,180,255,.95)");
      grad.addColorStop(0.55, "rgba(154,166,255,.6)");
      grad.addColorStop(1, "rgba(124,140,255,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, rad * 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  return {
    url: canvas.toDataURL("image/png"),
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
  };
}
