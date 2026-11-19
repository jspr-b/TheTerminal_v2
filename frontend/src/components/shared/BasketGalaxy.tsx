"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ConfigOptions, ForceGraph3DInstance } from "3d-force-graph";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ForecastRange, OverviewProduct, PairLink, PairNode, ProductPairs } from "@/lib/api";
import { rangeText } from "./Forecast";
import SourceChip from "./SourceChip";

// ---- Colours (from the approved mockup: calm, no glow) ----

/** Muted palette per product type, in order of units sold. Types beyond it and products without a type are neutral. */
const PALETTE = ["#8f98d9", "#7fbfb6", "#c8a6cc", "#cdb27a", "#8fb0cf", "#cf9aa3"];
const NEUTRAL = "#9a9ab0";
const ACCENT = "#7c8cff";
const DIM_NODE = "#20202f";
const DIM_LINK = "#17172a";
const LINK_STRONG = "#9aa0c8";
const LINK_WEAK = "#3a3d5c";
const STAGE_BG = "radial-gradient(70% 70% at 50% 46%, #121427 0%, #0b0b15 55%, #06060b 100%)";

export function typeColors(nodes: PairNode[]): Map<string, string> {
  const sold = new Map<string, number>();
  for (const n of nodes) if (n.product_type) sold.set(n.product_type, (sold.get(n.product_type) ?? 0) + n.sold);
  const types = [...sold.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  return new Map(types.slice(0, PALETTE.length).map((t, i) => [t, PALETTE[i]]));
}

// ---- Facts from the pairs (exact Shopify data) ----

export interface Neighbour {
  id: string;
  title: string;
  orders: number;
}

/** Products bought in the same order as `id`, most shared orders first. */
export function neighbours(pairs: ProductPairs, id: string): Neighbour[] {
  const title = new Map(pairs.nodes.map((n) => [n.id, n.title]));
  return pairs.links
    .filter((l) => l.source === id || l.target === id)
    .map((l) => {
      const other = l.source === id ? l.target : l.source;
      return { id: other, title: title.get(other) ?? "Product", orders: l.orders };
    })
    .sort((a, b) => b.orders - a.orders || a.title.localeCompare(b.title));
}

export function strongestPairs(pairs: ProductPairs, count: number): (PairLink & { a: string; b: string })[] {
  const title = new Map(pairs.nodes.map((n) => [n.id, n.title]));
  return [...pairs.links]
    .sort((x, y) => y.orders - x.orders)
    .slice(0, count)
    .map((l) => ({ ...l, a: title.get(l.source) ?? "Product", b: title.get(l.target) ?? "Product" }));
}

// ---- Time: 28 days of Shopify sales, then Kumo's 14-day range ----

export const PAST = 28;
export const AHEAD = 14;

/** Daily units for one product: `past` has 28 days, the last one is today (UTC). */
export interface DaySeries {
  past: number[];
  forecast: ForecastRange | null;
}

export function seriesFrom(products: OverviewProduct[]): Map<string, DaySeries> {
  return new Map(products.map((p) => [p.id, { past: p.sales_28d, forecast: p.forecast }]));
}

/**
 * Units per day on slider day `d` (-27 … 14, 0 = today). Past: 7-day average of what sold.
 * Future: Kumo gives one 14-day range, so every future day is its likely value / 14.
 * Without a forecast the size stays at today's.
 */
function perDayAt(s: DaySeries, d: number): number {
  const avg = (end: number) => {
    const from = Math.max(0, end - 6);
    let sum = 0;
    for (let i = from; i <= end; i++) sum += s.past[i] ?? 0;
    return sum / (end - from + 1);
  };
  if (d <= 0) return avg(Math.max(0, PAST - 1 + Math.round(d)));
  return s.forecast ? s.forecast.value / AHEAD : avg(PAST - 1);
}
function perDaySmooth(s: DaySeries, d: number): number {
  const a = Math.floor(d), b = Math.ceil(d);
  if (a === b) return perDayAt(s, a);
  return perDayAt(s, a) + (perDayAt(s, b) - perDayAt(s, a)) * (d - a);
}

// ---- The graph ----

interface GNode {
  id: string;
  title: string;
  type: string | null;
  sold: number;
  x?: number;
  y?: number;
  z?: number;
}
interface GLink {
  source: string | GNode;
  target: string | GNode;
  orders: number;
}
type Graph = ForceGraph3DInstance<GNode, GLink>;
type GraphCtor = new (el: HTMLElement, options?: ConfigOptions) => Graph;
type Three = typeof import("three");

const idOf = (v: string | GNode) => (typeof v === "string" ? v : v.id);
const linkKey = (l: { source: string | GNode; target: string | GNode }) => `${idOf(l.source)}|${idOf(l.target)}`;
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Bought together: products as calm spheres on a softly lit floor, a line for every pair bought in the same order.
 * mini: a slowly turning, non-interactive picture that fills its card (focusId lights one product and its pairs).
 * Full: drag, zoom, click a product; a side panel explains it. With `products`, a time bar runs from
 * 28 days ago (Shopify) to 14 days ahead (Kumo). With `onFocus` the parent controls the focus.
 */
export default function BasketGalaxy({
  pairs,
  products,
  focusId = null,
  mini = false,
  onFocus,
}: {
  pairs: ProductPairs;
  products?: OverviewProduct[];
  focusId?: string | null;
  mini?: boolean;
  onFocus?: (id: string | null) => void;
}) {
  const [own, setOwn] = useState<string | null>(focusId);
  useEffect(() => setOwn(focusId), [focusId]);
  const focus = onFocus ? focusId : own;
  const setFocus = onFocus ?? setOwn;
  const [day, setDay] = useState(0);

  const colors = useMemo(() => typeColors(pairs.nodes), [pairs]);
  const series = useMemo(() => (products ? seriesFrom(products) : undefined), [products]);
  const known = useMemo(() => new Set(pairs.nodes.map((n) => n.id)), [pairs]);
  const shown = focus !== null && known.has(focus) ? focus : null;

  if (mini) return <GalaxyStage pairs={pairs} colors={colors} focus={shown} mini />;
  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-w-0 flex-1 overflow-hidden" style={{ background: STAGE_BG }}>
        <GalaxyStage pairs={pairs} colors={colors} focus={shown} onFocus={setFocus} series={series} day={day} labels autoRotate={shown === null} />
        <TypeKeys colors={colors} />
        <div className="pointer-events-none absolute right-[18px] top-4 z-[2] text-xs text-muted">Drag to rotate · scroll to zoom · click a product</div>
        {series && <TimeBar day={day} onDay={setDay} />}
      </div>
      <SidePanel pairs={pairs} series={series} focus={shown} onFocus={setFocus} day={series ? day : 0} />
    </div>
  );
}

/** Colour key per product type, top left of a stage. */
export function TypeKeys({ colors, small = false }: { colors: Map<string, string>; small?: boolean }) {
  return (
    <div className={`pointer-events-none absolute z-[2] flex flex-col gap-1 text-muted ${small ? "left-3 top-2.5 text-[10px]" : "left-[18px] top-4 text-xs"}`}>
      {[...colors.entries()].map(([t, c]) => (
        <span key={t}>
          <i className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: c }} />
          {t}
        </span>
      ))}
    </div>
  );
}

/**
 * The 3D stage alone. Interactive unless mini. autoRotate: turn slowly while nobody is looking around (mini always does).
 * `focus` must be a product in `pairs` or null. `series` + `day` size the products per day; without them, by units sold.
 * Everything changes smoothly: sizes and colours ease towards their new value, nothing is rebuilt.
 */
export const STAGE_BACKGROUND = STAGE_BG;

export function GalaxyStage({
  pairs,
  colors,
  focus,
  mini = false,
  autoRotate = false,
  labels = false,
  series,
  day = 0,
  onFocus,
}: {
  pairs: ProductPairs;
  colors: Map<string, string>;
  focus: string | null;
  mini?: boolean;
  autoRotate?: boolean;
  labels?: boolean;
  series?: Map<string, DaySeries>;
  day?: number;
  onFocus?: (id: string | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const graph = useRef<Graph | null>(null);
  const focusRef = useRef<string | null>(focus);
  const dayRef = useRef(day);
  dayRef.current = day;
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const rotateRef = useRef(autoRotate);
  rotateRef.current = autoRotate;
  const controlsRef = useRef<OrbitControls | null>(null);
  const applyFocus = useRef<(fly: boolean) => void>(() => {});

  useEffect(() => {
    const host = el.current;
    if (!host) return;
    let cancelled = false;
    let raf = 0;
    let g: Graph | null = null;
    let ro: ResizeObserver | null = null;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const maxOrders = Math.max(1, ...pairs.links.map((l) => l.orders));
    const strength = (l: { orders: number }) => l.orders / maxOrders;
    const typeColor = (n: GNode) => (n.type ? (colors.get(n.type) ?? NEUTRAL) : NEUTRAL);
    // Size scale: units per day, relative to the busiest product in the pairs window.
    const basePerDay = (n: GNode) => n.sold / Math.max(1, pairs.days);
    const maxPerDay = Math.max(0.01, ...pairs.nodes.map((n) => n.sold / Math.max(1, pairs.days)));
    const radius = (perDay: number) => 2.6 * Math.cbrt(1 + (8 * perDay) / maxPerDay);
    const topIds = new Set([...pairs.nodes].sort((a, b) => b.sold - a.sold).slice(0, 8).map((n) => n.id));

    (async () => {
      const [fg, three, css2d] = await Promise.all([
        import("3d-force-graph"),
        import("three"),
        import("three/examples/jsm/renderers/CSS2DRenderer.js"),
      ]);
      if (cancelled) return;
      const T: Three = three;
      const ForceGraph3D = fg.default as unknown as GraphCtor;
      const showLabels = labels && !mini;
      const extra = showLabels ? [new css2d.CSS2DRenderer() as unknown as NonNullable<ConfigOptions["extraRenderers"]>[number]] : [];
      g = new ForceGraph3D(host, { controlType: "orbit", extraRenderers: extra });
      graph.current = g;

      // --- per product: a solid sphere, a label, a soft shadow on the floor
      type NodeView = { mat: import("three").MeshLambertMaterial; sphere: import("three").Mesh; label?: HTMLDivElement; labelObj?: import("three").Object3D; to: import("three").Color; r: number };
      const views = new Map<string, NodeView>();
      const sphereGeo = new T.SphereGeometry(1, mini ? 14 : 28, mini ? 10 : 18);
      const lit = (id: string) => focusRef.current === null || hi.nodes.has(id);
      const hi = { nodes: new Set<string>(), links: new Set<string>() };
      const nodeTarget = (n: GNode) => new T.Color(n.id === focusRef.current ? ACCENT : lit(n.id) ? typeColor(n) : DIM_NODE);
      const sizeOf = (n: GNode, d: number) => {
        const s = seriesRef.current?.get(n.id);
        return radius(s ? perDaySmooth(s, d) : basePerDay(n));
      };
      let shownDay = dayRef.current;

      const nodeObject = (n: GNode) => {
        const group = new T.Group();
        const mat = new T.MeshLambertMaterial({ color: nodeTarget(n) });
        const sphere = new T.Mesh(sphereGeo, mat);
        group.add(sphere);
        const view: NodeView = { mat, sphere, to: nodeTarget(n), r: sizeOf(n, shownDay) };
        sphere.scale.setScalar(view.r);
        if (showLabels) {
          const d = document.createElement("div");
          d.textContent = n.title;
          d.style.cssText =
            "font:500 11px var(--font-sans, system-ui), sans-serif;color:rgba(231,231,240,.85);white-space:nowrap;pointer-events:none;transition:opacity .3s;text-shadow:0 1px 3px #000;transform:translateY(4px)";
          d.style.opacity = topIds.has(n.id) ? "1" : "0";
          const obj = new css2d.CSS2DObject(d);
          obj.position.set(0, -(view.r + 4), 0);
          group.add(obj as unknown as import("three").Object3D);
          view.label = d;
          view.labelObj = obj as unknown as import("three").Object3D;
        }
        views.set(n.id, view);
        return group;
      };

      // --- per link: our own cylinder (width and colour can change without rebuilding) and two soft dots
      type LinkView = { mesh: import("three").Mesh; mat: import("three").MeshLambertMaterial; to: import("three").Color; dots: import("three").Mesh[]; dotsNow: number; dotsTo: number };
      const linkViews = new Map<string, LinkView>();
      const cyl = new T.CylinderGeometry(1, 1, 1, 10, 1, true);
      cyl.rotateX(Math.PI / 2);
      const dotGeo = new T.SphereGeometry(1, 10, 8);
      const linkTarget = (l: GLink) =>
        new T.Color(focusRef.current !== null ? (hi.links.has(linkKey(l)) ? ACCENT : DIM_LINK) : strength(l) > 0.3 ? LINK_STRONG : LINK_WEAK);
      const dotsTarget = (l: GLink) => (focusRef.current !== null ? (hi.links.has(linkKey(l)) ? 1 : 0) : strength(l) > 0.45 ? 0.85 : 0);
      const linkObject = (l: GLink) => {
        const mat = new T.MeshLambertMaterial({ color: linkTarget(l), transparent: true, opacity: 0.6, depthWrite: false });
        const mesh = new T.Mesh(cyl, mat);
        const dots = mini
          ? []
          : [0, 0.5].map((o) => {
              const m = new T.Mesh(dotGeo, new T.MeshBasicMaterial({ color: "#dfe2ff", transparent: true, opacity: 0, depthWrite: false }));
              m.userData.offset = o;
              m.visible = false;
              g!.scene().add(m);
              return m;
            });
        linkViews.set(linkKey(l), { mesh, mat, to: linkTarget(l), dots, dotsNow: dotsTarget(l), dotsTo: dotsTarget(l) });
        return mesh;
      };
      const placeLink = (obj: import("three").Object3D, pos: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } }, l: GLink) => {
        const { start, end } = pos;
        const len = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) || 1;
        const w = (0.25 + 2.4 * strength(l)) / 2;
        obj.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
        obj.lookAt(end.x, end.y, end.z);
        obj.scale.set(w, w, len);
        return true;
      };

      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      g.width(w)
        .height(h)
        .backgroundColor("rgba(0,0,0,0)")
        .showNavInfo(false)
        .nodeThreeObject(nodeObject)
        .nodeThreeObjectExtend(false)
        .nodeLabel((n) =>
          mini
            ? ""
            : `<div style="font:12px system-ui,sans-serif;padding:5px 8px;background:#16162a;border:1px solid #22223a;border-radius:6px;color:#e7e7f0">${escapeHtml(n.title)}<br><span style="color:#8d8da6">${n.sold.toLocaleString()} sold in ${pairs.days} days</span></div>`,
        )
        .linkThreeObject(linkObject)
        .linkPositionUpdate(placeLink)
        .cooldownTime(3500)
        .enablePointerInteraction(!mini)
        .graphData({
          nodes: pairs.nodes.map((n) => ({ id: n.id, title: n.title, type: n.product_type, sold: n.sold })),
          links: pairs.links.map((l) => ({ source: l.source, target: l.target, orders: l.orders })),
        });
      g.d3Force("link")?.distance((l: GLink) => 52 - 22 * strength(l));
      g.d3Force("charge")?.strength(-110);
      g.d3ReheatSimulation();
      const renderer = g.renderer();
      renderer.setClearColor(0x000000, 0);

      // --- the floor: a soft spotlight under the graph, a soft shadow per product, light fog
      const scene = g.scene();
      scene.fog = new T.Fog(0x0b0b15, 420, 1300);
      const texture = (draw: (c: CanvasRenderingContext2D, n: number) => void, size: number) => {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        draw(c.getContext("2d")!, size);
        const t = new T.CanvasTexture(c);
        t.colorSpace = T.SRGBColorSpace;
        return t;
      };
      const radial = (c: CanvasRenderingContext2D, n: number, stops: [number, string][]) => {
        const r = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
        for (const [o, col] of stops) r.addColorStop(o, col);
        return r;
      };
      const flat = (t: import("three").Texture, order: number) => {
        const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
        m.rotation.x = -Math.PI / 2;
        m.renderOrder = order;
        scene.add(m);
        return m;
      };
      const spot = flat(
        texture((c, n) => {
          c.fillStyle = radial(c, n, [[0, "rgba(150,158,230,.22)"], [0.42, "rgba(110,118,190,.10)"], [1, "rgba(0,0,0,0)"]]);
          c.fillRect(0, 0, n, n);
        }, 512),
        -1,
      );
      const shadowTex = texture((c, n) => {
        c.fillStyle = radial(c, n, [[0, "rgba(0,0,0,.9)"], [0.45, "rgba(0,0,0,.45)"], [1, "rgba(0,0,0,0)"]]);
        c.fillRect(0, 0, n, n);
      }, 128);
      const shadowMat = new T.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
      const shadowGeo = new T.PlaneGeometry(2, 2);
      const shadows = new Map<string, import("three").Mesh>();
      for (const n of pairs.nodes) {
        const m = new T.Mesh(shadowGeo, shadowMat);
        m.rotation.x = -Math.PI / 2;
        scene.add(m);
        shadows.set(n.id, m);
      }
      const nodes = () => g!.graphData().nodes.filter((n) => n.x !== undefined && n.y !== undefined && n.z !== undefined);
      const ground = () => {
        const ns = nodes();
        if (ns.length === 0) return;
        const fy = Math.min(...ns.map((n) => n.y! - radius(basePerDay(n)))) - 16;
        const cx = ns.reduce((a, n) => a + n.x!, 0) / ns.length;
        const cz = ns.reduce((a, n) => a + n.z!, 0) / ns.length;
        const R = Math.max(...ns.map((n) => Math.hypot(n.x! - cx, n.z! - cz))) + 24;
        spot.position.set(cx, fy, cz);
        spot.scale.set(R * 3.2, R * 3.2, 1);
        for (const n of ns) {
          const sh = shadows.get(n.id);
          const v = views.get(n.id);
          if (sh) {
            sh.position.set(n.x!, fy + 0.3, n.z!);
            sh.scale.setScalar((v?.r ?? 3) * 1.9);
          }
        }
      };
      g.onEngineTick(ground);

      // --- camera: slightly from above, never below the floor, never inside or far away
      const controls = g.controls() as OrbitControls;
      controlsRef.current = controls;
      controls.maxPolarAngle = (76 * Math.PI) / 180;
      controls.minPolarAngle = (8 * Math.PI) / 180;
      controls.autoRotateSpeed = 0.45;
      controls.autoRotate = mini || rotateRef.current;
      if (mini) {
        controls.enableRotate = false;
        controls.enableZoom = false;
        controls.enablePan = false;
      } else {
        controls.enablePan = false;
        g.onNodeClick((n) => onFocusRef.current?.(n.id)).onBackgroundClick(() => onFocusRef.current?.(null));
        g.onNodeHover((n) => {
          host.style.cursor = n ? "pointer" : "";
          hover = n ? n.id : null;
          styleLabels();
        });
        host.addEventListener("pointerdown", () => {
          controls.autoRotate = false;
          clearTimeout(idle);
          idle = setTimeout(() => {
            if (focusRef.current === null && rotateRef.current) controls.autoRotate = true;
          }, 8000);
        });
      }
      const frameAll = (ms: number) => {
        const ns = nodes();
        if (ns.length === 0 || !g) return;
        const c = { x: 0, y: 0, z: 0 };
        for (const n of ns) {
          c.x += n.x! / ns.length;
          c.y += n.y! / ns.length;
          c.z += n.z! / ns.length;
        }
        const R = Math.max(10, ...ns.map((n) => Math.hypot(n.x! - c.x, n.y! - c.y, n.z! - c.z))) + 20;
        c.y -= R * 0.22; // aim a little below the middle, so the floor is in the picture
        const cam = g.camera() as import("three").PerspectiveCamera;
        const fov = ((Math.min(cam.fov, (2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect) * 180) / Math.PI)) * Math.PI) / 180;
        const dist = (R / Math.sin(fov / 2)) * (mini ? 1.0 : 1.12);
        const dir = { x: 0.34, y: 0.42, z: 0.84 };
        g.cameraPosition({ x: c.x + dir.x * dist, y: c.y + dir.y * dist, z: c.z + dir.z * dist }, c, ms);
        controls.target.set(c.x, c.y, c.z);
        controls.minDistance = R * 0.9;
        controls.maxDistance = R * 5;
      };
      const flyTo = (id: string) => {
        const n = g?.graphData().nodes.find((x) => x.id === id);
        if (!g || !n || n.x === undefined || n.y === undefined || n.z === undefined) return;
        const cam = g.cameraPosition();
        const dx = cam.x - n.x, dz = cam.z - n.z, d = Math.max(1, Math.hypot(dx, dz));
        g.cameraPosition({ x: n.x + (dx / d) * 230, y: n.y + 95, z: n.z + (dz / d) * 230 }, { x: n.x, y: n.y, z: n.z }, 1100);
        controls.target.set(n.x, n.y, n.z);
      };

      // --- focus: set fade targets; the frame loop does the fading
      let hover: string | null = null;
      const styleLabels = () => {
        if (!showLabels) return;
        for (const n of g!.graphData().nodes) {
          const v = views.get(n.id);
          if (!v?.label) continue;
          const f = focusRef.current;
          const show = n.id === f || n.id === hover || (f !== null ? hi.nodes.has(n.id) : topIds.has(n.id));
          v.label.style.opacity = show ? "1" : "0";
          v.label.style.color = n.id === f ? "#ffffff" : "rgba(231,231,240,.85)";
          v.label.style.fontWeight = n.id === f ? "600" : "500";
        }
      };
      applyFocus.current = (fly: boolean) => {
        const f = focusRef.current;
        hi.nodes.clear();
        hi.links.clear();
        if (f !== null) {
          hi.nodes.add(f);
          for (const l of pairs.links) {
            if (l.source === f || l.target === f) {
              hi.nodes.add(l.source);
              hi.nodes.add(l.target);
              hi.links.add(linkKey(l));
            }
          }
        }
        if (!g) return;
        for (const n of g.graphData().nodes) {
          const v = views.get(n.id);
          if (v) v.to = nodeTarget(n);
        }
        for (const l of g.graphData().links) {
          const v = linkViews.get(linkKey(l));
          if (v) {
            v.to = linkTarget(l);
            v.dotsTo = dotsTarget(l);
          }
        }
        styleLabels();
        if (!fly || mini) return;
        if (f !== null) {
          controls.autoRotate = false;
          flyTo(f);
        } else {
          frameAll(900);
          controls.autoRotate = rotateRef.current;
        }
      };
      applyFocus.current(false);

      // --- one frame loop: ease the shown day, sizes, colours and dots
      let last = performance.now();
      const frame = (now: number) => {
        if (cancelled || !g) return;
        const dt = Math.min(0.25, (now - last) / 1000);
        last = now;
        const k = Math.min(1, dt * 6);
        const target = dayRef.current;
        const before = shownDay;
        shownDay += (target - shownDay) * Math.min(1, dt * 5);
        if (Math.abs(target - shownDay) < 0.002) shownDay = target;
        const resize = shownDay !== before;
        for (const n of g.graphData().nodes) {
          const v = views.get(n.id);
          if (!v) continue;
          v.mat.color.lerp(v.to, k);
          if (resize) {
            v.r = sizeOf(n, shownDay);
            v.sphere.scale.setScalar(v.r);
            v.labelObj?.position.set(0, -(v.r + 4), 0);
          }
        }
        if (resize) ground();
        const t = now / 1000;
        for (const l of g.graphData().links) {
          const v = linkViews.get(linkKey(l));
          if (!v) continue;
          v.mat.color.lerp(v.to, k);
          v.dotsNow += (v.dotsTo - v.dotsNow) * k;
          const a = l.source as GNode, b = l.target as GNode;
          if (a.x === undefined || b.x === undefined) continue;
          const dw = 0.5 + 0.9 * strength(l);
          for (const m of v.dots) {
            const f = (t * 0.35 + (m.userData.offset as number)) % 1;
            m.position.set(a.x + (b.x! - a.x) * f, a.y! + (b.y! - a.y!) * f, a.z! + (b.z! - a.z!) * f);
            m.scale.setScalar(dw);
            (m.material as import("three").MeshBasicMaterial).opacity = v.dotsNow * Math.sin(Math.PI * f);
            m.visible = v.dotsNow > 0.01;
          }
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);

      // Frame the camera once the layout has settled (onEngineStop does not always fire, so also a timer).
      g.onEngineStop(() => {
        ground();
        if (focusRef.current === null || mini) frameAll(800);
      });
      settle = setTimeout(() => {
        if (!g || cancelled) return;
        ground();
        if (focusRef.current !== null && !mini) flyTo(focusRef.current);
        else frameAll(mini ? 0 : 700);
      }, 3800);

      let reframe: ReturnType<typeof setTimeout> | undefined;
      ro = new ResizeObserver(() => {
        if (!g || host.clientWidth === 0 || host.clientHeight === 0) return;
        g.width(host.clientWidth).height(host.clientHeight);
        // The panel changed size (e.g. a product was picked or cleared): frame the whole galaxy again.
        clearTimeout(reframe);
        reframe = setTimeout(() => {
          if (g && (focusRef.current === null || mini)) frameAll(500);
        }, 120);
      });
      ro.observe(host);
    })().catch(() => {
      // WebGL not available: the card keeps its plain-language line.
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      clearTimeout(idle);
      ro?.disconnect();
      if (g) {
        const renderer = g.renderer();
        g._destructor();
        renderer.forceContextLoss();
      }
      graph.current = null;
      controlsRef.current = null;
      applyFocus.current = () => {};
      host.innerHTML = "";
    };
  }, [pairs, colors, mini, labels]);

  useEffect(() => {
    focusRef.current = focus;
    applyFocus.current(true);
  }, [focus]);

  useEffect(() => {
    if (controlsRef.current && !mini && focusRef.current === null) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate, mini]);

  return <div ref={el} className={`absolute inset-0 ${mini ? "pointer-events-none" : ""}`} aria-hidden={mini ? true : undefined} />;
}

// ---- Time bar: 28 days back (Shopify) to 14 days ahead (Kumo) ----

const dayDate = (d: number) =>
  new Date(Date.now() + d * 864e5).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function TimeBar({ day, onDay }: { day: number; onDay: (d: number) => void }) {
  const [playing, setPlaying] = useState(false);
  const dayRef = useRef(day);
  dayRef.current = day;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      if (dayRef.current >= AHEAD) {
        setPlaying(false);
        return;
      }
      onDay(dayRef.current + 1);
    }, 240);
    return () => clearInterval(t);
  }, [playing, onDay]);
  const today = (100 * (PAST - 1)) / (PAST - 1 + AHEAD);
  return (
    <div className="absolute inset-x-[18px] bottom-4 z-[3] flex items-center gap-3.5 rounded-[10px] border border-edge bg-[rgba(12,12,22,.82)] px-3.5 pb-2 pt-2.5 backdrop-blur">
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => {
          if (playing) return setPlaying(false);
          if (day >= AHEAD) onDay(-(PAST - 1));
          setPlaying(true);
        }}
        className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full border border-edge bg-[#14142a] text-[11px] hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="relative h-[34px] flex-1">
        <div className="absolute inset-x-0 top-[9px] h-[2px]">
          <i className="absolute left-0 h-[2px] bg-[#5a5f8c]" style={{ width: `${today}%` }} />
          <i
            className="absolute right-0 h-[2px]"
            style={{ left: `${today}%`, background: `repeating-linear-gradient(90deg, ${ACCENT} 0 5px, transparent 5px 9px)` }}
          />
        </div>
        <input
          type="range"
          aria-label="Day"
          min={-(PAST - 1)}
          max={AHEAD}
          step={1}
          value={day}
          onChange={(e) => {
            setPlaying(false);
            onDay(Number(e.target.value));
          }}
          className="time-range absolute -inset-x-[7px] top-0 m-0 h-5 w-[calc(100%+14px)] cursor-pointer appearance-none bg-transparent"
        />
        <div className="absolute inset-x-0 top-5 text-[11px] text-muted">
          <span className="absolute left-0">{PAST - 1} days ago</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${today}%` }}>
            Today
          </span>
          <span className="absolute right-0">+{AHEAD} days</span>
        </div>
      </div>
      <div className="w-[210px] flex-none text-right text-xs text-muted [&_.source-chip]:ml-1.5">
        <b className="font-medium text-[#e7e7f0]">{day === 0 ? "Today" : day < 0 ? `${plural(-day, "day")} ago` : `In ${plural(day, "day")}`}</b> · {dayDate(day)}
        <SourceChip source={day > 0 ? "kumo" : "shopify"} />
      </div>
    </div>
  );
}

// ---- Side panel (full view) ----

export function PairRow({ label, orders, max, onClick }: { label: string; orders: number; max: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group grid w-full grid-cols-[1fr_auto] gap-x-2.5 gap-y-1 border-b border-white/[0.07] py-[7px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <b className="font-medium group-hover:text-white">{label}</b>
      <span className="font-mono text-xs text-muted">{orders.toLocaleString()} orders</span>
      <span className="col-span-2 h-[3px] rounded-sm bg-white/[0.06]">
        <span className="block h-[3px] rounded-sm bg-accent" style={{ width: `${(100 * orders) / max}%` }} />
      </span>
    </button>
  );
}

function SecTitle({ children, sources = ["shopify"] }: { children: ReactNode; sources?: ("shopify" | "kumo")[] }) {
  return (
    <div className="mb-2 mt-[18px] flex items-center text-[11px] uppercase tracking-[0.06em] text-muted [&_.source-chip]:normal-case [&_.source-chip]:tracking-normal">
      {children}
      {sources.map((s) => (
        <SourceChip key={s} source={s} />
      ))}
    </div>
  );
}

/** How closely two products' daily sales go up and down together (Pearson over 28 days). */
export function sameDays(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 7) return 0;
  const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i < n; i++) {
    xy += (a[i] - ma) * (b[i] - mb);
    xx += (a[i] - ma) ** 2;
    yy += (b[i] - mb) ** 2;
  }
  return xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : 0;
}
const sameDaysWord = (r: number) => (r > 0.6 ? "strong" : r > 0.4 ? "medium" : "weak");
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function DayChart({ s, day }: { s: DaySeries; day: number }) {
  const W = 300, H = 92;
  const span = PAST - 1 + AHEAD;
  const X = (d: number) => 6 + ((W - 12) * (d + PAST - 1)) / span;
  const f = s.forecast;
  const top = Math.max(1, ...s.past, f ? f.upper / AHEAD : 0) * 1.1;
  const Y = (v: number) => H - 16 - ((H - 26) * v) / top;
  const past = s.past.map((v, i) => `${X(i - (PAST - 1))},${Y(v)}`).join(" ");
  const cur = day <= 0 ? s.past[PAST - 1 + day] : f ? f.value / AHEAD : null;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full">
      {f && <rect x={X(0)} y={Y(f.upper / AHEAD)} width={X(AHEAD) - X(0)} height={Math.max(1, Y(f.lower / AHEAD) - Y(f.upper / AHEAD))} fill={ACCENT} fillOpacity={0.16} />}
      {f && <line x1={X(0)} x2={X(AHEAD)} y1={Y(f.value / AHEAD)} y2={Y(f.value / AHEAD)} stroke={ACCENT} strokeWidth={1.6} strokeDasharray="3 3" />}
      <polyline points={past} fill="none" stroke="#c9cdf0" strokeWidth={1.6} />
      <line x1={X(0)} x2={X(0)} y1={6} y2={H - 14} stroke="rgba(255,255,255,.18)" />
      <line x1={X(day)} x2={X(day)} y1={6} y2={H - 14} stroke="#ffffff" strokeWidth={1.2} />
      {cur !== null && cur !== undefined && <circle cx={X(day)} cy={Y(cur)} r={3.5} fill="#fff" />}
      <text x={6} y={H - 2} fill="#6c6c86" fontSize={10}>
        {PAST - 1} days ago
      </text>
      <text x={X(0)} y={H - 2} fill="#6c6c86" fontSize={10} textAnchor="middle">
        Today
      </text>
      <text x={W - 6} y={H - 2} fill="#6c6c86" fontSize={10} textAnchor="end">
        +{AHEAD}
      </text>
    </svg>
  );
}

function dayLine(s: DaySeries, day: number): ReactNode {
  const f = s.forecast;
  if (day < 0) return <><b className="font-medium text-[#e7e7f0]">{plural(-day, "day")} ago:</b> {s.past[PAST - 1 + day].toLocaleString()} sold.</>;
  if (day === 0) return <><b className="font-medium text-[#e7e7f0]">Today so far:</b> {s.past[PAST - 1].toLocaleString()} sold.{f ? ` Next 14 days: likely ${rangeText(f)}.` : ""}</>;
  if (!f) return <><b className="font-medium text-[#e7e7f0]">In {plural(day, "day")}:</b> no Kumo forecast for this product yet.</>;
  return (
    <>
      <b className="font-medium text-[#e7e7f0]">Next 14 days:</b> likely {rangeText(f)} sold, about {rangeText({ lower: f.lower / AHEAD, upper: f.upper / AHEAD })} a day.
    </>
  );
}

function SidePanel({
  pairs,
  series,
  focus,
  onFocus,
  day,
}: {
  pairs: ProductPairs;
  series?: Map<string, DaySeries>;
  focus: string | null;
  onFocus: (id: string | null) => void;
  day: number;
}) {
  const max = Math.max(1, ...pairs.links.map((l) => l.orders));
  const note = (
    <p className="mt-[18px] text-xs text-muted">
      Size = units sold per day{series ? ", or Kumo's likely per day after today" : ""}. Lines: last {pairs.days} days, pairs need at least {pairs.min_orders} shared
      orders. Nothing past 14 days.
    </p>
  );
  const node = focus !== null ? pairs.nodes.find((n) => n.id === focus) : undefined;

  if (!node) {
    const top = strongestPairs(pairs, 7);
    const linked = new Set(pairs.links.flatMap((l) => [l.source, l.target]));
    const alone = pairs.nodes.filter((n) => !linked.has(n.id));
    return (
      <aside className="w-[340px] flex-none overflow-auto border-l border-edge bg-[#0f0f1c] p-[18px]">
        <h3 className="mb-1 text-[17px] font-semibold">Bought together</h3>
        <p className="text-muted">Products that end up in the same order. The thicker the line, the more often.</p>
        <SecTitle>Strongest pairs</SecTitle>
        {top.length === 0 ? (
          <p className="text-muted">Not enough shared orders yet.</p>
        ) : (
          top.map((l) => <PairRow key={`${l.source}|${l.target}`} label={`${l.a} + ${l.b}`} orders={l.orders} max={max} onClick={() => onFocus(l.source)} />)
        )}
        {alone.length > 0 && (
          <>
            <SecTitle>Mostly bought on their own</SecTitle>
            <p className="text-muted">{alone.map((n) => n.title).join(", ")}</p>
          </>
        )}
        {note}
      </aside>
    );
  }

  const list = neighbours(pairs, node.id);
  const s = series?.get(node.id);
  const last14 = s ? s.past.slice(-14).reduce((a, b) => a + b, 0) : 0;
  const prev14 = s ? s.past.slice(0, 14).reduce((a, b) => a + b, 0) : 0;
  const trend = last14 > prev14 * 1.08 ? "Rising" : last14 < prev14 * 0.92 ? "Falling" : "Steady";
  const todayDow = new Date().getUTCDay();
  const byDow = [0, 0, 0, 0, 0, 0, 0];
  s?.past.forEach((v, i) => (byDow[(((todayDow - (PAST - 1 - i)) % 7) + 7) % 7] += v));
  const busiest = s && Math.max(...byDow) > 0 ? WEEKDAYS[byDow.indexOf(Math.max(...byDow))] : "–";
  const moves =
    s && series
      ? pairs.nodes
          .filter((o) => o.id !== node.id && series.has(o.id))
          .map((o) => ({ o, r: sameDays(s.past, series.get(o.id)!.past) }))
          .filter((x) => x.r > 0.3)
          .sort((a, b) => b.r - a.r)
          .slice(0, 4)
      : [];

  return (
    <aside key={node.id} className="panel-fade w-[340px] flex-none overflow-auto border-l border-edge bg-[#0f0f1c] p-[18px]">
      <button type="button" onClick={() => onFocus(null)} className="mb-3 text-xs text-accent hover:underline">
        ← Whole shop
      </button>
      <h3 className="mb-1 text-[17px] font-semibold">{node.title}</h3>
      <p className="text-muted">
        {node.product_type ? `${node.product_type} · ` : ""}
        <span className="font-mono">{node.sold.toLocaleString()}</span> sold in the last {pairs.days} days
      </p>
      <Link href={`/products/${encodeURIComponent(node.id)}`} className="mt-2 inline-block text-xs text-accent hover:underline">
        Open product page →
      </Link>

      {s && (
        <>
          <SecTitle sources={["shopify", "kumo"]}>Sold per day</SecTitle>
          <DayChart s={s} day={day} />
          <p className="mt-1.5 text-[13px] text-muted">{dayLine(s, day)}</p>
        </>
      )}

      <SecTitle>What Kumo gets to see</SecTitle>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-edge bg-edge">
        {[
          ["Orders", node.orders.toLocaleString()],
          ["Customers", node.customers.toLocaleString()],
          ["Bought again", node.repeat_customers.toLocaleString()],
          ["Returned", node.returned.toLocaleString()],
          ...(s
            ? [
                ["Last 2 weeks", `${trend} · ${prev14} → ${last14}`],
                ["Busiest day", busiest],
              ]
            : []),
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 bg-[#0f0f1c] px-2.5 py-2">
            <span className="text-[11px] text-muted">{k}</span>
            <b className="font-medium">{v}</b>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
        <i className="rounded-full border border-edge px-2 py-0.5 not-italic">{node.orders.toLocaleString()} orders</i>
        <span className="text-[#55556d]">→</span>
        <i className="rounded-full border border-edge px-2 py-0.5 not-italic">{node.customers.toLocaleString()} customers</i>
        <span className="text-[#55556d]">→</span>
        <i className="rounded-full border border-edge px-2 py-0.5 not-italic">{list.length} other products</i>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Last {pairs.days} days. Kumo learns from these linked tables, not from names, emails or addresses.
      </p>

      {s && (
        <>
          <SecTitle>Sells on the same days as</SecTitle>
          {moves.length === 0 ? (
            <p className="text-muted">No product moves with it.</p>
          ) : (
            moves.map(({ o, r }) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onFocus(o.id)}
                className="group flex w-full items-center justify-between border-b border-white/[0.07] py-1.5 text-left"
              >
                <b className="font-medium group-hover:text-white">{o.title}</b>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    sameDaysWord(r) === "strong" ? "border-accent/50 text-[#c3c9ff]" : "border-edge text-muted"
                  }`}
                >
                  {sameDaysWord(r)}
                </span>
              </button>
            ))
          )}
        </>
      )}

      <SecTitle>Bought with it</SecTitle>
      {list.length === 0 ? (
        <p className="text-muted">Not enough shared orders yet.</p>
      ) : (
        list.map((b) => <PairRow key={b.id} label={b.title} orders={b.orders} max={max} onClick={() => onFocus(b.id)} />)
      )}
      {note}
    </aside>
  );
}
