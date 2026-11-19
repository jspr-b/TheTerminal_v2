"use client";

import { useEffect, useRef, useState } from "react";
import type { ForecastRange } from "@/lib/api";
import { RISK_COLOR, UntestedTag, dayFromToday, dayName } from "@/components/shared/ProductVisuals";

/** Same background as the basket galaxy stage. */
const BG = "radial-gradient(75% 75% at 50% 42%,#121427 0%,#0a0a14 55%,#05050b 100%)";
const AHEAD = 14;

type Tower = { kind: "past"; i: number; date: string; units: number } | { kind: "ahead"; k: number };

/**
 * Sales skyline: one tower per day. Solid = exact units sold (Shopify, last 28 days).
 * Glass = Kumo's likely range for the next 14 days, spread evenly over the days (Kumo gives one 14-day range);
 * the outline cap is the top of the range. With sell-out shown (our math, untested), glass after the likely
 * run-out day turns red. Click a tower to see that day. Floor and camera follow the basket galaxy ("Spotlight").
 */
export default function SalesSkyline({
  sales,
  forecast,
  stale = false,
  stock,
  likelyOutDay,
  showStock,
  untested,
  compact = false,
  heading,
}: {
  /** Small panel (Products page): framed to its width, short labels, no legend. */
  compact?: boolean;
  /** Replaces the title block in compact mode. */
  heading?: React.ReactNode;
  sales: { date: string; units: number }[];
  forecast: ForecastRange | null;
  stale?: boolean;
  stock: number;
  /** Day the stock likely runs out (our math); null = lasts, or sell-out may not be shown. */
  likelyOutDay: number | null;
  /** Sell-out may be shown (CLAUDE.md backtest rule, or local dev). */
  showStock: boolean;
  untested: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<Tower | null>(null);
  const [day, setDay] = useState(1);
  const [failed, setFailed] = useState(false);
  // Live values for the render loop without rebuilding the scene.
  const live = useRef({ picked: null as Tower | null, day: 1, hovered: -1 });
  live.current.picked = picked;
  live.current.day = day;
  const api = useRef<{ fly: (t: Tower | null) => void } | null>(null);

  const perDay = forecast ? { lower: forecast.lower / AHEAD, value: forecast.value / AHEAD, upper: forecast.upper / AHEAD } : null;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let raf = 0;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (cancelled) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x0b0b15, 80, 170); // the background's mid colour: far things fade into the page
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35;
      controls.enablePan = false;
      controls.minPolarAngle = (8 * Math.PI) / 180; // camera stays above the floor
      controls.maxPolarAngle = (76 * Math.PI) / 180;
      controls.minDistance = 25;
      controls.maxDistance = 110;
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(-30, 60, 40);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x7c8cff, 0.9);
      rim.position.set(40, 20, -40);
      scene.add(rim);

      const STEP = 1.05;
      const n = sales.length;
      const xOf = (slot: number) => (slot - (n + AHEAD) / 2) * STEP; // slot 0..n-1 past, n..n+13 ahead
      const top = Math.max(1, ...sales.map((s) => s.units), perDay?.upper ?? 0);
      const H = 14 / top; // tallest tower about 14 high
      const DEPTH = 2.6;

      const disposables: { dispose: () => void }[] = [];
      const canvasTex = (draw: (g: CanvasRenderingContext2D, size: number) => void, size = 512) => {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const g = c.getContext("2d");
        if (g) draw(g, size);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        disposables.push(t);
        return t;
      };
      const radial = (g: CanvasRenderingContext2D, size: number, stops: [number, string][]) => {
        const q = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        stops.forEach(([o, c]) => q.addColorStop(o, c));
        return q;
      };
      // Floor: the "Spotlight" chosen for the basket galaxy: a softly lit patch, no lines, a soft shadow per tower.
      const plane = new THREE.PlaneGeometry(1, 1);
      disposables.push(plane);
      const spotMat = new THREE.MeshBasicMaterial({
        map: canvasTex((g, s) => {
          g.fillStyle = radial(g, s, [[0, "rgba(150,158,230,.24)"], [0.42, "rgba(110,118,190,.10)"], [1, "rgba(0,0,0,0)"]]);
          g.fillRect(0, 0, s, s);
        }),
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      disposables.push(spotMat);
      const spot = new THREE.Mesh(plane, spotMat);
      spot.rotation.x = -Math.PI / 2;
      spot.scale.set((n + AHEAD) * STEP * 1.6, 34, 1);
      spot.renderOrder = -1;
      scene.add(spot);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: canvasTex((g, s) => {
          g.fillStyle = radial(g, s, [[0, "rgba(0,0,0,.9)"], [0.45, "rgba(0,0,0,.45)"], [1, "rgba(0,0,0,0)"]]);
          g.fillRect(0, 0, s, s);
        }, 128),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        fog: false,
      });
      disposables.push(shadowMat);

      const box = new THREE.BoxGeometry(0.8, 1, DEPTH);
      disposables.push(box);
      const meshes: InstanceType<typeof THREE.Mesh>[] = [];
      const towers: Tower[] = [];
      const caps: InstanceType<typeof THREE.LineSegments>[] = [];
      const shadow = (x: number) => {
        const m = new THREE.Mesh(plane, shadowMat);
        m.rotation.x = -Math.PI / 2;
        m.scale.set(1.8, DEPTH * 1.5, 1);
        m.position.set(x, 0.02, 0);
        scene.add(m);
      };
      sales.forEach((s, i) => {
        const mat = new THREE.MeshStandardMaterial({ color: 0xc9cbe0, roughness: 0.55, metalness: 0.1, transparent: true });
        disposables.push(mat);
        const m = new THREE.Mesh(box, mat);
        const h = Math.max(0.05, s.units * H);
        m.scale.y = h;
        m.position.set(xOf(i), h / 2, 0);
        scene.add(m);
        shadow(xOf(i));
        meshes.push(m);
        towers.push({ kind: "past", i, date: s.date, units: s.units });
      });
      if (perDay) {
        for (let k = 1; k <= AHEAD; k++) {
          const gone = showStock && likelyOutDay !== null && k >= likelyOutDay;
          const color = stale ? 0x55556d : gone ? 0xf87171 : 0x7c8cff;
          const mat = new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: gone ? 0.3 : 0.5, roughness: 0.15, emissive: gone ? 0x2a0b0b : 0x1c2266 });
          disposables.push(mat);
          const m = new THREE.Mesh(box, mat);
          const mid = Math.max(0.05, perDay.value * H);
          m.scale.y = mid;
          m.position.set(xOf(n + k - 1), mid / 2, 0);
          scene.add(m);
          shadow(xOf(n + k - 1));
          const hi = Math.max(0.05, perDay.upper * H);
          const capGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.8, hi, DEPTH));
          const capMat = new THREE.LineBasicMaterial({ color: 0x9aa6ff, transparent: true, opacity: 0.8 });
          disposables.push(capGeo, capMat);
          const cap = new THREE.LineSegments(capGeo, capMat);
          cap.position.set(xOf(n + k - 1), hi / 2, 0);
          scene.add(cap);
          caps.push(cap);
          meshes.push(m);
          towers.push({ kind: "ahead", k });
        }
      }
      // "today": a faint upright plane between the last solid and the first glass tower
      const todayMat = new THREE.MeshBasicMaterial({ color: 0x7c8cff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
      disposables.push(todayMat);
      const today = new THREE.Mesh(plane, todayMat);
      today.scale.set(DEPTH * 2.2, 18, 1);
      today.rotation.y = Math.PI / 2;
      today.position.set((xOf(n - 1) + xOf(n)) / 2, 9, 0);
      scene.add(today);
      // slider day marker on the floor, and a white outline for the picked tower
      const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
      disposables.push(markMat);
      const marker = new THREE.Mesh(plane, markMat);
      marker.rotation.x = -Math.PI / 2;
      marker.scale.set(0.95, DEPTH * 1.4, 1);
      marker.position.y = 0.03;
      marker.visible = perDay !== null;
      scene.add(marker);
      const outGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.92, 1, DEPTH + 0.12));
      const outMat = new THREE.LineBasicMaterial({ color: 0xffffff });
      disposables.push(outGeo, outMat);
      const outline = new THREE.LineSegments(outGeo, outMat);
      outline.visible = false;
      scene.add(outline);

      const home = new THREE.Vector3(0, 4, 0);
      controls.target.copy(home);
      camera.position.set(-20, 26, 58);
      let flyTarget: InstanceType<typeof THREE.Vector3> | null = null;
      const indexOf = (t: Tower) => towers.findIndex((x) => (t.kind === "past" ? x.kind === "past" && x.i === t.i : x.kind === "ahead" && x.k === t.k));
      api.current = {
        fly: (t) => {
          controls.autoRotate = t === null;
          const m = t ? meshes[indexOf(t)] : null;
          // The small panel keeps the whole row in view; only the full stage turns towards the tower.
          flyTarget = m && !compact ? new THREE.Vector3(m.position.x, 3, 0) : home.clone();
        },
      };

      const size = () => {
        const w = Math.max(1, el.clientWidth);
        const h = Math.max(1, el.clientHeight);
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        if (compact) {
          // Fit the whole row of towers to the panel width (and the tallest tower to its height).
          const halfW = ((n + AHEAD) * STEP) / 2 + 1;
          const vf = (camera.fov * Math.PI) / 360;
          const hf = Math.atan(Math.tan(vf) * camera.aspect);
          // The view is from the front-left, so the near end sits closer: leave room for it (and for turning).
          const dist = Math.max(halfW / Math.tan(hf), 11 / Math.tan(vf)) * 1.12;
          const dir = new THREE.Vector3(-12, 20, 60).normalize();
          camera.position.copy(home).addScaledVector(dir, dist);
          controls.maxDistance = Math.max(110, dist * 1.6);
          controls.minDistance = Math.min(25, dist * 0.5);
        }
      };
      const ro = new ResizeObserver(size);
      ro.observe(el);
      size();

      const ray = new THREE.Raycaster();
      const ptr = new THREE.Vector2();
      const hit = (ev: PointerEvent) => {
        const b = renderer.domElement.getBoundingClientRect();
        ptr.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
        ray.setFromCamera(ptr, camera);
        const h = ray.intersectObjects(meshes)[0];
        return h ? meshes.indexOf(h.object as InstanceType<typeof THREE.Mesh>) : -1;
      };
      let down: [number, number] | null = null;
      const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY]);
      const onUp = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; // a drag turns the view
        const i = hit(e);
        const t = i >= 0 ? towers[i] : null;
        setPicked(t);
        if (t && t.kind === "ahead") setDay(t.k);
        api.current?.fly(t);
      };
      const onMove = (e: PointerEvent) => {
        const i = hit(e);
        live.current.hovered = i;
        renderer.domElement.style.cursor = i >= 0 ? "pointer" : "grab";
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.style.cursor = "grab";

      const v = new THREE.Vector3();
      const loop = () => {
        const { picked: p, day: d, hovered } = live.current;
        const pi = p ? indexOf(p) : -1;
        meshes.forEach((m, i) => {
          const t = towers[i];
          const mat = m.material as InstanceType<typeof THREE.MeshStandardMaterial>;
          const dim = pi >= 0 && i !== pi;
          if (t.kind === "past") {
            mat.opacity = dim ? 0.25 : 1;
            mat.emissive.setHex(i === pi ? 0x6b6f9a : i === hovered ? 0x2a2c44 : 0x000000);
          } else {
            const isDay = t.k === d;
            mat.opacity = i === pi ? 0.95 : dim ? 0.18 : isDay ? 0.85 : mat.color.getHex() === 0xf87171 ? 0.3 : 0.5;
            mat.emissiveIntensity = i === pi ? 3 : isDay ? 2.2 : i === hovered ? 1.8 : 1;
            (caps[t.k - 1].material as InstanceType<typeof THREE.LineBasicMaterial>).opacity = dim ? 0.25 : 0.8;
          }
        });
        marker.position.x = xOf(n + d - 1);
        outline.visible = pi >= 0;
        if (pi >= 0) {
          outline.scale.set(1, meshes[pi].scale.y, 1);
          outline.position.copy(meshes[pi].position);
          // keep the detail card beside its tower
          const card = cardRef.current;
          if (card) {
            v.set(meshes[pi].position.x, meshes[pi].scale.y + 0.6, 0).project(camera);
            const w = el.clientWidth;
            const h = el.clientHeight;
            const x = ((v.x + 1) / 2) * w;
            const y = ((1 - v.y) / 2) * h;
            if (compact) {
              // Small panel: the card goes to the side away from the tower, so the tower stays visible.
              card.style.left = `${x > w / 2 ? 8 : w - card.offsetWidth - 8}px`;
              card.style.top = "76px";
            } else {
              card.style.left = `${Math.min(w - card.offsetWidth - 8, Math.max(8, x + 24))}px`;
              card.style.top = `${Math.min(h - card.offsetHeight - 90, Math.max(70, y - card.offsetHeight / 2))}px`;
            }
          }
        }
        if (flyTarget) {
          controls.target.lerp(flyTarget, 0.08);
          if (controls.target.distanceTo(flyTarget) < 0.05) flyTarget = null;
        }
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("pointermove", onMove);
        controls.dispose();
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        renderer.forceContextLoss();
        el.innerHTML = "";
        api.current = null;
      };
    })().catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      cleanup();
    };
    // The scene is built once per product's data; selection and day are read live.
  }, [sales, forecast, stale, likelyOutDay, showStock, compact]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && live.current.picked) {
        setPicked(null);
        api.current?.fly(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setPicked(null);
    api.current?.fly(null);
  };
  const left = (k: number) => {
    if (!forecast) return null;
    const lo = Math.max(0, Math.round(stock - (forecast.upper * k) / AHEAD));
    const hi = Math.max(0, Math.round(stock - (forecast.lower * k) / AHEAD));
    return lo === hi ? `${lo}` : `${lo}–${hi}`;
  };
  const dayRange = perDay ? `${Math.floor(perDay.lower)}–${Math.max(Math.ceil(perDay.upper), Math.floor(perDay.lower) + 1)}` : null;

  return (
    <div className="absolute inset-0" style={{ background: BG }}>
      <div ref={host} className="absolute inset-0" />
      {failed && <p className="absolute inset-0 grid place-items-center text-muted">The 3D view could not start in this browser.</p>}
      {compact ? (
        <div className="absolute inset-x-3 top-2.5 z-[2]">{heading}</div>
      ) : (
      <div className="pointer-events-none absolute left-5 top-4 z-[2] max-w-[560px]">
        <div className="flex items-center text-[15px] font-semibold">
          Sales skyline<span className="source-chip">Shopify</span>
          <span className="source-chip">Kumo</span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          One tower per day. Solid: what sold, last {sales.length} days. Glass: Kumo&apos;s likely range for the next 14 days, spread evenly over the days; the
          outline is the top of the range.
        </p>
      </div>
      )}
      {!compact && (
      <div className="pointer-events-none absolute right-5 top-[18px] z-[2] flex flex-col gap-1 text-right text-[11px] text-muted">
        <span>
          sold <i className="ml-2 inline-block h-2 w-3 rounded-sm bg-[#c9cbe0] align-middle" />
        </span>
        {perDay && (
          <>
            <span>
              likely (middle) <i className="ml-2 inline-block h-2 w-3 rounded-sm bg-[#7c8cff]/75 align-middle" />
            </span>
            <span>
              top of range <i className="ml-2 inline-block h-2 w-3 rounded-sm border border-[#9aa6ff] align-middle" />
            </span>
          </>
        )}
        {showStock && likelyOutDay !== null && (
          <span>
            stock likely gone <i className="ml-2 inline-block h-2 w-3 rounded-sm bg-[#f87171]/55 align-middle" />
          </span>
        )}
      </div>
      )}

      {picked && (
        <div ref={cardRef} role="dialog" aria-label="Day detail" className={`absolute z-[4] ${compact ? "w-[200px] px-3 py-2 [&_.big]:text-[20px]" : "w-[300px]"} rounded-xl border border-edge bg-[#0f0f1c]/95 px-3.5 py-3 shadow-[0_12px_40px_rgba(0,0,0,.5)] backdrop-blur`}>
          <button type="button" onClick={close} aria-label="Close" className="absolute right-2.5 top-1.5 text-base text-muted hover:text-[#e7e7f0]">
            ×
          </button>
          {picked.kind === "past" ? (
            <PastDetail sales={sales} i={picked.i} compact={compact} />
          ) : (
            perDay &&
            forecast && (
              <>
                <div className="flex items-center text-[10px] uppercase tracking-[0.06em] text-muted">
                  {dayFromToday(picked.k)}
                  <span className="source-chip">Kumo</span>
                </div>
                <div className="big my-1 font-mono text-[26px] leading-tight">
                  {dayRange}
                  <small className="ml-1.5 font-sans text-xs text-muted">likely sold</small>
                </div>
                {!compact && <Line label="Kumo's range, all 14 days" value={`${Math.round(forecast.lower)}–${Math.round(forecast.upper)}`} />}
                {showStock && (
                  <Line
                    label={
                      <>
                        Stock left after this day{untested && <UntestedTag />}
                      </>
                    }
                    value={left(picked.k) ?? "–"}
                  />
                )}
                {!compact && <Line label="In stock today" value={`${stock}`} />}
                {showStock && likelyOutDay !== null && picked.k >= likelyOutDay ? (
                  <p className="mt-2 text-xs" style={{ color: RISK_COLOR.high }}>
                    By this day the stock is likely gone, so these sales can only happen with more stock.
                  </p>
                ) : (
                  !compact && <p className="mt-2 text-xs text-[#c9c9d8]">Kumo gives one range for all 14 days; it is spread evenly over the days here.</p>
                )}
              </>
            )
          )}
        </div>
      )}

      {!compact && <div className="pointer-events-none absolute bottom-[84px] right-5 z-[2] text-[11px] text-[#55556d]">Click a tower to see that day · drag to turn</div>}
      {perDay && (
        <div
          className={`absolute z-[3] flex items-center rounded-[10px] border border-edge bg-[#0c0c16]/85 backdrop-blur ${
            compact ? "inset-x-2 bottom-2 flex-wrap gap-x-3 gap-y-0.5 px-2.5 py-1.5" : "inset-x-5 bottom-4 gap-4 px-3.5 py-2.5"
          }`}
        >
          {!compact && <span className="whitespace-nowrap text-[11px] text-muted">tomorrow</span>}
          <input
            type="range"
            min={1}
            max={AHEAD}
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
            aria-label="Day after today"
            className="flex-1 accent-[#7c8cff]"
          />
          {!compact && <span className="whitespace-nowrap text-[11px] text-muted">day 14</span>}
          <div className={compact ? "w-full text-[11px] text-muted" : "w-[340px] flex-none text-xs text-muted"}>
            <b className="font-medium text-[#e7e7f0]">{dayFromToday(day)}</b> · likely sells <b className="font-mono font-medium text-[#e7e7f0]">{dayRange}</b>
            {showStock && (
              <>
                {" "}
                · stock left <b className="font-mono font-medium text-[#e7e7f0]">{left(day)}</b>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="flex justify-between gap-2.5 border-t border-white/[0.07] py-1.5 text-xs text-muted">
      <span className="flex items-center">{label}</span>
      <b className="font-mono font-medium text-[#e7e7f0]">{value}</b>
    </div>
  );
}

/** A past day: exact units, and the usual span for the same weekday in the window. */
function PastDetail({ sales, i, compact = false }: { sales: { date: string; units: number }[]; i: number; compact?: boolean }) {
  const s = sales[i];
  const same = sales.filter((_, j) => (j - i) % 7 === 0).map((x) => x.units);
  return (
    <>
      <div className="flex items-center text-[10px] uppercase tracking-[0.06em] text-muted">
        {dayName(s.date)}
        <span className="source-chip">Shopify</span>
      </div>
      <div className="big my-1 font-mono text-[26px] leading-tight">
        {s.units}
        <small className="ml-1.5 font-sans text-xs text-muted">sold</small>
      </div>
      <Line label={`Same weekday, last ${same.length} weeks`} value={`${Math.min(...same)}–${Math.max(...same)}`} />
      {!compact && <p className="mt-2 text-xs text-[#c9c9d8]">Exact sales from Shopify orders, cancelled orders left out.</p>}
    </>
  );
}
