/**
 * The Products "world": one three.js scene in which every product is a galaxy node, a skyline row and a
 * 3D card at the same time. Switching views morphs between them; clicking a product opens a focus view
 * with an in-world detail card. Ported from docs/mockups/products-world.html (approved).
 *
 * Plain imperative three.js, created once per data set; React talks to it through the returned API.
 */
import type * as T from "three";

export interface WorldProduct {
  id: string;
  title: string;
  type: string;
  color: string;
  stock: number;
  /** Kumo's 14-day range, null when there are too few sales. */
  f: { lo: number; mid: number; hi: number } | null;
  /** Sell-out (our math), only when it may be shown; null otherwise or when it lasts. */
  out: { e: number; l: number | null } | null;
  band: "low" | "medium" | "high" | null;
  /** Exact units per day, oldest first; the last value is today. */
  past: number[];
  sold14: number;
}
export interface WorldPair {
  a: number;
  b: number;
  o: number;
}
export type View = 0 | 1 | 2;
export interface WorldCallbacks {
  onSelect: (index: number | null) => void;
  onOpen: (index: number) => void;
  onView: (view: View) => void;
}
export interface WorldApi {
  setView: (v: View) => void;
  select: (index: number | null) => void;
  setFilter: (matches: boolean[], order: number[]) => void;
  /** Pixels covered on the right (the product list): the detail card stays clear of it. */
  setInset: (px: number) => void;
  dispose: () => void;
}

const RISK: Record<"low" | "medium" | "high", string> = { high: "#f87171", medium: "#fbbf24", low: "#34d399" };
const ACCENT = "#7c8cff";
const FONT = "IBM Plex Sans, Inter, system-ui, sans-serif";
const MONO = "IBM Plex Mono, ui-monospace, monospace";

function dayLabel(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export interface WorldOptions {
  /** The product whose page this is: its card shows "You are here" instead of the open button. */
  here?: number | null;
}

export async function createWorld(host: HTMLElement, tip: HTMLElement, prods: WorldProduct[], pairs: WorldPair[], cb: WorldCallbacks, opts: WorldOptions = {}): Promise<WorldApi> {
  const THREE = await import("three");
  const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
  const N = prods.length;
  const maxOrders = Math.max(1, ...pairs.map((l) => l.o));
  const partners = (i: number) =>
    pairs
      .filter((l) => l.a === i || l.b === i)
      .map((l) => ({ id: l.a === i ? l.b : l.a, o: l.o }))
      .sort((x, y) => y.o - x.o);

  let matches = prods.map(() => true);
  let rank = prods.map((_, i) => i);
  let selected: number | null = null;
  let hovered: number | null = null;
  let hoverTower: T.Mesh | null = null;
  let mode = 0;
  let modeTarget: number | null = null;
  let dragging: number | null = null;
  let focus = 0;
  let disposed = false;
  let inset = 0;
  let insetNow = 0;

  const R = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  R.setPixelRatio(Math.min(2, window.devicePixelRatio));
  host.appendChild(R.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0b15, 120, 280);
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 800);
  const ctl = new OrbitControls(cam, R.domElement);
  ctl.enableDamping = true;
  ctl.enablePan = false;
  ctl.autoRotateSpeed = 0.35;
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const kl = new THREE.DirectionalLight(0xffffff, 1.1);
  kl.position.set(-30, 60, 40);
  scene.add(kl);
  const rl = new THREE.DirectionalLight(0x7c8cff, 0.9);
  rl.position.set(40, 20, -40);
  scene.add(rl);

  const disposables: { dispose: () => void }[] = [];
  const keep = <D extends { dispose: () => void }>(d: D): D => (disposables.push(d), d);
  const canvasTex = (c: HTMLCanvasElement) => {
    const t = keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const mkCanvas = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (g) draw(g, w, h);
    return c;
  };
  // the "Spotlight" floor
  const plane = keep(new THREE.PlaneGeometry(1, 1));
  const floor = new THREE.Mesh(
    plane,
    keep(
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        map: canvasTex(
          mkCanvas(512, 512, (g, w) => {
            const q = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
            q.addColorStop(0, "rgba(150,158,230,.24)");
            q.addColorStop(0.42, "rgba(110,118,190,.10)");
            q.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = q;
            g.fillRect(0, 0, w, w);
          }),
        ),
      }),
    ),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.scale.set(140, 110, 1);
  floor.position.y = -0.02;
  floor.renderOrder = -1;
  scene.add(floor);

  // text in the world: sprites move with their object, no screen jitter
  function textSprite(text: string, { size = 40, color = "#e7e7f0", weight = 500, bg = null as string | null } = {}) {
    const pad = bg ? 18 : 6;
    const m = document.createElement("canvas").getContext("2d");
    if (m) m.font = `${weight} ${size}px ${FONT}`;
    const w = Math.ceil(m ? m.measureText(text).width : text.length * size * 0.55) + pad * 2;
    const h = Math.ceil(size * 1.5);
    const c = mkCanvas(w, h, (g) => {
      if (bg) {
        g.fillStyle = bg;
        g.beginPath();
        g.roundRect(0, 0, w, h, h / 2);
        g.fill();
      }
      g.font = `${weight} ${size}px ${FONT}`;
      g.fillStyle = color;
      g.textBaseline = "middle";
      g.shadowColor = "#000";
      g.shadowBlur = bg ? 0 : 6;
      g.fillText(text, pad, h / 2);
    });
    const s = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, depthTest: false })));
    s.userData.aspect = w / h;
    s.renderOrder = 6;
    scene.add(s);
    return s;
  }
  const sizeSprite = (s: T.Sprite, h: number) => s.scale.set(h * (s.userData.aspect as number), h, 1);

  // galaxy layout: a small 3D force layout
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gal = prods.map(() => new THREE.Vector3((rnd() - 0.5) * 30, 10 + (rnd() - 0.5) * 20, (rnd() - 0.5) * 30));
  const pinned = new Set<number>();
  const relax = (steps: number, fixed: number | null = null) => {
    for (let s = 0; s < steps; s++) {
      const f = gal.map(() => new THREE.Vector3());
      for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) {
          const d = gal[i].clone().sub(gal[j]);
          const L = Math.max(1, d.length());
          d.multiplyScalar(140 / (L * L * L));
          f[i].add(d);
          f[j].sub(d);
        }
      pairs.forEach(({ a, b, o }) => {
        const d = gal[b].clone().sub(gal[a]);
        const L = d.length();
        d.multiplyScalar(((L - (13 - (o / maxOrders) * 7)) * 0.04) / Math.max(L, 0.01));
        f[a].add(d);
        f[b].sub(d);
      });
      gal.forEach((p, i) => {
        f[i].add(new THREE.Vector3(0, 10, 0).sub(p).multiplyScalar(0.012));
        if (i !== fixed && !pinned.has(i)) p.add(f[i].clampLength(0, 2));
      });
    }
  };
  relax(400);
  {
    const c = gal.reduce((a, v) => a.add(v.clone().divideScalar(N)), new THREE.Vector3());
    const far = Math.max(1, ...gal.map((v) => v.distanceTo(c)));
    gal.forEach((v) => v.sub(c).multiplyScalar(20 / far).add(new THREE.Vector3(0, 11, 0)));
  }

  // skyline + cards layout
  const SX = 1.0;
  const ROW = Math.min(3.1, 50 / Math.max(1, N));
  const X0 = -21;
  const skyRowZ = (r: number) => (r - (N - 1) / 2) * ROW;
  const maxDay = Math.max(1, ...prods.flatMap((p) => [...p.past, p.f ? p.f.hi / 14 : 0]));
  const H = 7 / maxDay;
  const COLS = 2;
  const cardPos = (r: number) => new THREE.Vector3(r % COLS ? 10.5 : -10.5, 30 - Math.floor(r / COLS) * 3.6, 0);
  const cardsTop = 30;
  const cardsMid = cardsTop - (Math.ceil(N / COLS) - 1) * 1.8;

  const nodeGeo = keep(new THREE.SphereGeometry(1, 28, 18));
  const box = keep(new THREE.BoxGeometry(0.78, 1, Math.min(1.9, ROW * 0.62)));
  const cardGeo = keep(new THREE.PlaneGeometry(19, 3.1));

  function drawRowCard(g: CanvasRenderingContext2D, w: number, h: number, p: WorldProduct, on: boolean) {
    g.clearRect(0, 0, w, h);
    g.fillStyle = on ? "rgba(24,24,52,.97)" : "rgba(17,17,31,.94)";
    g.strokeStyle = on ? "rgba(157,170,255,.95)" : "rgba(124,140,255,.35)";
    g.lineWidth = on ? 5 : 3;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 26);
    g.fill();
    g.stroke();
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(44, 58, 11, 0, 7);
    g.fill();
    g.fillStyle = "#e7e7f0";
    g.font = `500 36px ${FONT}`;
    g.fillText(p.title, 72, 70, 470);
    g.fillStyle = "#8d8da6";
    g.font = `26px ${FONT}`;
    g.fillText(`${p.stock} in stock · ${p.f ? `likely ${p.f.lo}–${p.f.hi}` : "too few sales"}`, 72, 118, 470);
    if (p.f) {
      const x0 = 500;
      const W = 230;   // ends at 730: the run-out text gets its own column on the right
      const m = Math.max(p.stock, p.f.hi, 1) * 1.08;
      const x = (v: number) => x0 + (Math.max(0, v) / m) * W;
      const c = p.band ? RISK[p.band] : ACCENT;
      g.fillStyle = "rgba(255,255,255,.2)";
      g.fillRect(x0, 80, x(p.stock) - x0, 8);
      g.fillStyle = c + "38";
      g.strokeStyle = c;
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(x(p.f.lo), 64, Math.max(4, x(p.f.hi) - x(p.f.lo)), 40, 8);
      g.fill();
      g.stroke();
      g.fillStyle = "#e7e7f0";
      g.fillRect(x(p.stock) - 2, 58, 4, 52);
    }
    g.font = `500 24px ${FONT}`;
    g.textAlign = "right";
    g.fillStyle = p.out && p.band ? RISK[p.band] : "#8d8da6";
    g.fillText(!p.f || !p.out ? "" : p.out.l ? `run out day ${p.out.e}–${p.out.l}` : `run out from day ${p.out.e}`, w - 34, 94, 230);
    g.textAlign = "left";
  }

  interface Item {
    p: WorldProduct;
    node: T.Mesh<T.SphereGeometry, T.MeshStandardMaterial>;
    halo: T.Mesh<T.SphereGeometry, T.MeshBasicMaterial>;
    towers: T.Mesh<T.BoxGeometry, T.MeshStandardMaterial>[];
    card: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
    cardCanvas: HTMLCanvasElement;
    cardTex: T.CanvasTexture;
    cardOn: boolean;
    label: T.Sprite;
    pos: T.Vector3;
    cpos: T.Vector3;
    z: number;
    hmul: number;
  }
  const items: Item[] = prods.map((p, idx) => {
    const col = new THREE.Color(p.color);
    const node = new THREE.Mesh(nodeGeo, keep(new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.4, transparent: true })));
    node.userData.idx = idx;
    scene.add(node);
    const halo = new THREE.Mesh(nodeGeo, keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.BackSide })));
    scene.add(halo);
    const towers: Item["towers"] = [];
    p.past.forEach((u, i) => {
      const m = new THREE.Mesh(box, keep(new THREE.MeshStandardMaterial({ color: 0xc9cbe0, emissive: 0x000000, roughness: 0.55, transparent: true })));
      m.userData = { idx, kind: "past", i, u, h: Math.max(0.05, u * H) };
      scene.add(m);
      towers.push(m);
    });
    if (p.f) {
      let st = p.stock;
      for (let k = 1; k <= 14; k++) {
        st -= p.f.mid / 14;
        const gone = p.out !== null && st <= 0;
        const m = new THREE.Mesh(
          box,
          keep(new THREE.MeshPhysicalMaterial({ color: gone ? 0xf87171 : 0x7c8cff, emissive: gone ? 0x2a0b0b : 0x1c2266, transparent: true, opacity: 0.5, roughness: 0.15 })),
        );
        m.userData = { idx, kind: "ahead", k, gone, left: Math.max(0, Math.round(st)), h: Math.max(0.05, (p.f.mid / 14) * H) };
        scene.add(m);
        towers.push(m);
      }
    }
    const cc = mkCanvas(1024, 168, (g, w, h) => drawRowCard(g, w, h, p, false));
    const ct = canvasTex(cc);
    const card = new THREE.Mesh(cardGeo, keep(new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, side: THREE.FrontSide })));
    card.userData.idx = idx;
    scene.add(card);
    return { p, node, halo, towers, card, cardCanvas: cc, cardTex: ct, cardOn: false, label: textSprite(p.title), pos: gal[idx].clone(), cpos: cardPos(0), z: skyRowZ(0), hmul: 1 };
  });

  // links: thin lines; for the focused product glowing tubes, flowing dots (speed = orders) and order counts
  const linkMats = pairs.map(() => keep(new THREE.LineBasicMaterial({ color: 0x7c8cff, transparent: true, opacity: 0.4 })));
  const links = pairs.map((_, i) => {
    const ln = new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])), linkMats[i]);
    scene.add(ln);
    return ln;
  });
  const tubeGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true));
  const tubes = pairs.map(({ o }) => {
    const m = new THREE.Mesh(tubeGeo, keep(new THREE.MeshBasicMaterial({ color: 0x9aa6ff, transparent: true, opacity: 0, depthWrite: false })));
    m.userData.r = 0.1 + (o / maxOrders) * 0.45;
    scene.add(m);
    return m;
  });
  const flowGeo = keep(new THREE.SphereGeometry(0.28, 10, 8));
  const flows = pairs.map(() =>
    Array.from({ length: 5 }, () => {
      const m = new THREE.Mesh(flowGeo, keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })));
      scene.add(m);
      return m;
    }),
  );
  const orderTags = pairs.map(({ o }) => textSprite(`${o} orders`, { size: 30, color: "#c3c9ff", weight: 500, bg: "rgba(20,20,46,.92)" }));
  const ticks = [-27, -20, -13, -6, 0, 7, 14].map((d) => ({ d, s: textSprite(d === 0 ? "today" : dayLabel(d), { size: 30, color: d === 0 ? "#c3c9ff" : "#8d8da6" }) }));

  // the selected product's detail card: plain HTML on top of the world, so the text stays sharp
  const card = document.createElement("div");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Product details");
  Object.assign(card.style, {
    position: "absolute", left: "0", top: "0", zIndex: "4", display: "none", boxSizing: "border-box",
    padding: "12px 14px 12px", borderRadius: "14px", border: "1px solid rgba(124,140,255,.45)",
    background: "rgba(14,14,28,.96)", boxShadow: "0 12px 40px rgba(0,0,0,.45)", color: "#e7e7f0",
    fontFamily: FONT, transformOrigin: "0% 50%", willChange: "transform, opacity",
  } satisfies Partial<CSSStyleDeclaration>);
  host.appendChild(card);
  const TETHER_N = 32;
  const tether = new THREE.Line(
    keep(new THREE.BufferGeometry().setFromPoints(Array.from({ length: TETHER_N }, () => new THREE.Vector3()))),
    keep(new THREE.LineBasicMaterial({ color: 0x9aa6ff, transparent: true, opacity: 0.6, depthTest: false })),
  );
  tether.renderOrder = 9;
  tether.visible = false;
  scene.add(tether);
  let pop = 0;
  let shownId: number | null = null;
  /** The picked day in the focused skyline row: an index into that product's towers (past days, then the next 14). */
  let day: number | null = null;
  let pending: { idx: number; day: number } | null = null;
  let skyCard = false;
  let drawnDay: number | null = null;
  const todayOf = (i: number) => Math.max(0, prods[i].past.length - 1);
  const weekday = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString("en-GB", { weekday: "short" });
  };

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, style: Partial<CSSStyleDeclaration>, text?: string): HTMLElementTagNameMap[K] => {
    const n = document.createElement(tag);
    Object.assign(n.style, style);
    if (text !== undefined) n.textContent = text;   // merchant data: always as text, never as HTML
    return n;
  };
  const stat = (value: string, label: string, color = "#e7e7f0", labelColor = "#8d8da6", align: "left" | "right" = "left") => {
    const box = el("div", { textAlign: align, minWidth: "0" });
    box.append(
      el("div", { fontFamily: MONO, fontSize: "20px", fontWeight: "500", lineHeight: "1.15", color, whiteSpace: "nowrap" }, value),
      el("div", { fontSize: "11px", color: labelColor, whiteSpace: "nowrap", marginTop: "1px" }, label),
    );
    return box;
  };
  const iconButton = (label: string, aria: string, on: boolean, act: () => void) => {
    const b = el("button", { width: "26px", height: "26px", borderRadius: "50%", border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: on ? "#c9c9d8" : "#3a3a52", fontSize: "15px", lineHeight: "1", cursor: on ? "pointer" : "default", flex: "none" }, label);
    b.type = "button";
    b.disabled = !on;
    b.setAttribute("aria-label", aria);
    b.onclick = act;
    b.onmouseenter = () => on && (b.style.borderColor = ACCENT);
    b.onmouseleave = () => (b.style.borderColor = "rgba(255,255,255,.12)");
    return b;
  };

  /** The card: name; stock, likely, run-out (or, in the skyline, one day with ‹ ›); open button. */
  function drawDetail(p: WorldProduct, idx: number) {
    card.replaceChildren();
    const head = el("div", { display: "flex", alignItems: "center", gap: "8px" });
    head.append(
      el("span", { width: "9px", height: "9px", borderRadius: "50%", background: p.color, flex: "none" }),
      el("div", { fontSize: "15px", fontWeight: "600", flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, p.title),
      iconButton("✕", "Close", true, () => cb.onSelect(null)),
    );
    card.append(head);
    const row = el("div", { display: "flex", justifyContent: "space-between", gap: "12px", margin: "10px 0 12px" });
    const tw = items[idx].towers[day ?? -1];
    if (skyCard && day !== null && tw) {
      const P = p.past.length;
      const last = items[idx].towers.length - 1;
      const u = tw.userData;
      const offset = day - (P - 1);
      const when = offset === 0 ? "today so far" : offset < 0 ? `${-offset} day${offset === -1 ? "" : "s"} ago` : `in ${offset} day${offset === 1 ? "" : "s"}`;
      const nav = el("div", { display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" });
      const label = el("div", { flex: "1", textAlign: "center", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
      label.append(el("span", { fontWeight: "500", color: offset === 0 ? "#c3c9ff" : "#e7e7f0" }, dayLabel(offset)), el("span", { color: "#8d8da6" }, ` · ${when}`));
      nav.append(iconButton("‹", "Previous day", day > 0, () => step(-1)), label, iconButton("›", "Next day", day < last, () => step(1)));
      card.append(nav);
      if (u.kind === "past") {
        row.append(stat(String(u.u as number), "sold"));
        const d0 = day;
        const same = p.past.filter((_, j) => j !== d0 && (j - d0) % 7 === 0);
        if (same.length) row.append(stat(`${Math.min(...same)}–${Math.max(...same)}`, `usual on a ${weekday(offset)}`));
        if (offset === 0) row.append(stat(String(p.stock), "in stock", "#e7e7f0", "#8d8da6", "right"));
      } else if (p.f) {
        row.append(stat(`${Math.floor(p.f.lo / 14)}–${Math.ceil(p.f.hi / 14)}`, "likely · Kumo"));
        if (p.band) row.append(u.gone ? stat("gone", "stock · untested", RISK.high, "#fbbf24", "right") : stat(`~${u.left as number}`, "stock left · untested", "#e7e7f0", "#fbbf24", "right"));
      }
    } else {
      row.append(stat(String(p.stock), "in stock"), stat(p.f ? `${p.f.lo}–${p.f.hi}` : "–", p.f ? "likely sells" : "too few sales"));
    }
    card.append(row);
    if (!(skyCard && day !== null && tw) && p.out && p.band) {
      const ro = el("div", { margin: "-4px 0 12px", fontSize: "12px", color: "#c9c9d8" });
      ro.append(
        el("span", {}, "Could run out "),
        el("span", { fontFamily: MONO, fontWeight: "500", color: RISK[p.band] }, p.out.l ? `day ${p.out.e}–${p.out.l}` : `from day ${p.out.e}`),
        el("span", { color: "#fbbf24", fontSize: "11px" }, " · untested"),
      );
      card.append(ro);
    }
    if (idx === opts.here) {
      card.append(el("div", { fontSize: "12px", color: "#8d8da6", textAlign: "center" }, "You are on this product's page"));
      return;
    }
    const open = el("button", { width: "100%", padding: "7px 0", borderRadius: "9px", border: `1px solid ${ACCENT}`, background: "rgba(124,140,255,.18)", color: "#e7e7f0", fontSize: "13px", fontWeight: "500", cursor: "pointer" }, "Open product page →");
    open.type = "button";
    open.onmouseenter = () => Object.assign(open.style, { background: ACCENT, color: "#0a0a14" });
    open.onmouseleave = () => Object.assign(open.style, { background: "rgba(124,140,255,.18)", color: "#e7e7f0" });
    open.onclick = () => cb.onOpen(idx);
    card.append(open);
  }

  // cameras per view; in focus the product sits left of centre and the card on the right
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const CAMS = [
    { p: V(0, 30, 112), t: V(0, 13, 0) },
    { p: V(-10, 64, 74), t: V(1, 0, 3) },
    { p: V(0, cardsMid - 1.5, Math.max(50, Math.ceil(N / COLS) * 7.6)), t: V(0, cardsMid, 0) },
  ];
  const FOCUS = [
    { p: V(4, 20, 78), t: V(4, 11, 0) },
    { p: V(6, 36, 76), t: V(15, 4, 0) },
    { p: V(6, 17, 58), t: V(7, 17, 4) },
  ];
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const blend = (A: { p: T.Vector3; t: T.Vector3 }[], m: number) => {
    const a = m <= 1 ? A[0] : A[1];
    const b = m <= 1 ? A[1] : A[2];
    const t = ease(m <= 1 ? m : m - 1);
    return { p: a.p.clone().lerp(b.p, t), t: a.t.clone().lerp(b.t, t) };
  };
  const camFor = (m: number, f: number) => {
    const a = blend(CAMS, m);
    const b = blend(FOCUS, m);
    const k = ease(f);
    return { p: a.p.lerp(b.p, k), t: a.t.lerp(b.t, k) };
  };
  let followCam = true;
  ctl.addEventListener("start", () => {
    if (modeTarget === null) followCam = false;
  });
  {
    const c = camFor(0, 0);
    cam.position.copy(c.p);
    ctl.target.copy(c.t);
  }

  const size = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    R.setSize(w, h);
    cam.aspect = w / h;
    cam.setViewOffset(w, h, insetNow / 2, 0, w, h);
  };
  const ro = new ResizeObserver(size);
  ro.observe(host);
  size();

  const tmp = new THREE.Vector3();
  const up0 = new THREE.Vector3(0, 1, 0);
  const center = new THREE.Vector3(0, 11, 0);
  let last = performance.now();
  let clock = 0;
  let raf = 0;
  function frame(now: number) {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    if (modeTarget !== null) {
      const d = modeTarget - mode;
      mode += Math.sign(d) * Math.min(Math.abs(d), dt * 0.9);
      if (Math.abs(d) < 0.001) {
        mode = modeTarget;
        modeTarget = null;
      }
    }
    focus += ((selected !== null ? 1 : 0) - focus) * Math.min(1, dt * 3.2);
    if (dragging !== null) relax(2, dragging);
    const g2s = ease(Math.min(1, mode));
    const s2c = ease(Math.max(0, mode - 1));
    const wGal = 1 - g2s;
    const wSky = g2s * (1 - s2c);
    const fz = ease(focus);
    const F = selected;
    const near = F === null ? [] : partners(F);
    const nearIds = new Set(near.map((n) => n.id));
    const hovNear = hovered === null ? null : new Set([hovered, ...partners(hovered).map((n) => n.id)]);
    items.forEach((it, id) => {
      const p = it.p;
      const r = rank.indexOf(id);
      const ok = matches[id];
      const isF = id === F;
      const isN = nearIds.has(id);
      const g = gal[id].clone();
      if (F !== null) {
        let ft: T.Vector3;
        if (isF) ft = center.clone();
        else if (isN) {
          const k = near.findIndex((n) => n.id === id);
          const a = -Math.PI / 2 + 0.55 + ((k + 0.5) / near.length) * (Math.PI * 2 - 1.1);   // leave the bottom free for the focused name
          ft = center.clone().add(V(Math.cos(a) * 17, Math.sin(a) * 11, Math.sin(a * 2) * 3));   // a ring facing the camera: labels never stack
        } else ft = gal[id].clone().sub(center).multiplyScalar(2.1).add(center);
        g.lerp(ft, fz);
      }
      it.z += ((isF ? 0 : skyRowZ(r)) - it.z) * 0.14;
      it.hmul += ((F === null ? 1 : isF ? 1.9 : 0.06) - it.hmul) * 0.12;
      const sky = V(X0 - 0.4, 0.9, it.z);
      const cp = cardPos(r);
      const cardDot = cp.clone().add(V(-10.6, 0, 0.2));
      const target = mode <= 1 ? g.lerp(sky, g2s) : sky.clone().lerp(cardDot, s2c);
      it.pos.lerp(target, dragging === id ? 1 : 0.14);
      const sz = (0.7 + Math.min(2.4, p.sold14 / 90)) * (1 - 0.72 * g2s) * (1 - 0.6 * s2c) * (isF ? 1 + 0.3 * fz * wGal : 1);
      it.node.position.copy(it.pos);
      it.node.scale.setScalar(sz * (id === hovered && !isF ? 1.18 : 1));
      const faded = !ok || (F !== null && !isF && !isN) || (F === null && hovNear !== null && !hovNear.has(id) && mode < 0.5);
      it.node.material.opacity = (faded ? (F !== null ? 0.1 : 0.2) : 1) * (1 - s2c) * (F !== null && mode > 0.5 ? (isF ? 1 - fz : 0.15 * (1 - fz)) : 1);
      it.node.visible = it.node.material.opacity > 0.01;
      it.node.material.color.set(isF ? 0xffffff : p.color);
      it.node.material.emissiveIntensity = isF ? 1.2 : isN ? 0.9 : 0.55;
      it.halo.position.copy(it.pos);
      it.halo.scale.setScalar(sz * (1.7 + Math.sin(clock * 2.4) * 0.12));
      it.halo.material.opacity = isF ? 0.16 * fz * wGal : 0;
      const n = it.towers.length;
      it.towers.forEach((m, i) => {
        const grow = Math.min(1, Math.max(0, mode * 1.5 - (i / n) * 0.5)) * (1 - s2c);
        const y = (m.userData.h as number) * it.hmul * Math.max(0.001, grow);
        m.scale.set(isF ? 1 + 0.25 * fz : 1, y, isF ? 1 + 0.4 * fz : 1);
        m.position.set(X0 + 2 + i * SX, y / 2, it.z);
        m.visible = grow > 0.002 && y > 0.02;
        const kind = m.userData.kind as string;
        const gone = m.userData.gone as boolean;
        m.material.opacity =
          (!ok ? 0.1 : F !== null && !isF ? 0.12 * (1 - fz) : hovered !== null && hovered !== id && F === null ? 0.25 : kind === "past" ? 1 : gone ? 0.35 : 0.58) * Math.min(1, grow * 2);
        const picked = isF && i === day && wSky > 0.5;
        m.material.emissive.setHex(picked ? 0x6a74ff : hoverTower === m ? 0x4a4e80 : kind === "past" ? 0x000000 : gone ? 0x2a0b0b : 0x1c2266);
        if (picked) {
          m.material.opacity = 1;
          m.scale.x *= 1.25;
          m.scale.z *= 1.25;
        }
      });
      const cTarget = isF ? cp.clone().lerp(V(-2, 17, 6), fz) : cp;
      it.cpos.lerp(V(0, 0, it.z).lerp(cTarget, s2c), 0.14);
      it.card.position.copy(it.cpos);
      it.card.rotation.x = (-Math.PI / 2) * (1 - s2c);
      it.card.visible = s2c > 0.01;
      it.card.material.opacity = s2c * (!ok ? 0.2 : F !== null && !isF ? 0.12 : hovered !== null && hovered !== id ? 0.5 : 1);
      it.card.scale.setScalar(isF ? 1 + 0.2 * fz : id === hovered ? 1.03 : 1);
      const on = isF || id === hovered;
      if (on !== it.cardOn) {
        it.cardOn = on;
        const cg = it.cardCanvas.getContext("2d");
        if (cg) drawRowCard(cg, 1024, 168, p, on);
        it.cardTex.needsUpdate = true;
      }
      const L = it.label;
      const showGal = isF || isN || id === hovered ? 1 : 0;
      const mat = L.material as T.SpriteMaterial;
      if (mode < 0.5) {
        // the focused product's name sits under it, partners' names above them
        L.center.set(0.5, isF ? 1.3 : -0.4);
        L.position.copy(it.pos).add(tmp.set(0, isF ? -sz * 1.2 : sz * 1.15, 0));
        sizeSprite(L, isF ? 2.3 : 1.7);
        mat.opacity = showGal * Math.max(0, 1 - g2s * 2) * (ok ? 1 : 0.3);
      } else if (isF) {
        L.center.set(0, 0);
        L.position.set(X0 + 1.6, 7 * it.hmul + 1.4, it.z);
        sizeSprite(L, 2.2);
        mat.opacity = Math.max(0, (g2s - 0.5) * 2) * (1 - s2c);
      } else {
        L.center.set(1, 0.5);
        L.position.set(X0 - 1.5, 0.9, it.z);
        sizeSprite(L, Math.min(1.25, ROW * 0.42));
        mat.opacity = Math.max(0, (g2s - 0.5) * 2) * (1 - s2c) * (!ok ? 0.3 : 1) * (F !== null ? 1 - fz : 1);
      }
      L.visible = mat.opacity > 0.01;
    });
    pairs.forEach(({ a, b, o }, i) => {
      const A = items[a].pos;
      const B = items[b].pos;
      const pos = links[i].geometry.attributes.position;
      pos.setXYZ(0, A.x, A.y, A.z);
      pos.setXYZ(1, B.x, B.y, B.z);
      pos.needsUpdate = true;
      const mine = F !== null && (a === F || b === F);
      const hov = F === null && hovered !== null && (a === hovered || b === hovered);
      linkMats[i].opacity = wGal * (mine ? 0 : F !== null ? 0.04 : hov ? 0.9 : hovered !== null ? 0.08 : 0.35) * (matches[a] && matches[b] ? 1 : 0.15);
      links[i].visible = linkMats[i].opacity > 0.005;
      const t = tubes[i];
      const vis = mine ? fz * wGal : 0;
      t.material.opacity = 0.75 * vis;
      t.visible = vis > 0.01;
      if (t.visible) {
        const d = B.clone().sub(A);
        t.position.copy(A).add(B).multiplyScalar(0.5);
        t.quaternion.setFromUnitVectors(up0, d.clone().normalize());
        t.scale.set(t.userData.r as number, d.length(), t.userData.r as number);
      }
      // more shared orders = faster and more dots
      const rate = 0.08 + 0.45 * (o / maxOrders);
      const shown = Math.max(1, Math.round(1 + (4 * o) / maxOrders));
      flows[i].forEach((m, k) => {
        m.visible = vis > 0.01 && k < shown;
        if (!m.visible) return;
        const from = a === F ? A : B;
        const to = a === F ? B : A;
        const s = (clock * rate + k / shown) % 1;
        m.position.copy(from).lerp(to, s);
        m.material.opacity = vis * Math.sin(s * Math.PI);
      });
      const tag = orderTags[i];
      const strong = F !== null && partners(F).slice(0, 5).some((n) => n.id === (a === F ? b : a));
      (tag.material as T.SpriteMaterial).opacity = strong ? vis : 0;
      tag.visible = strong && vis > 0.01;
      if (tag.visible) {
        tag.position.copy(A).add(B).multiplyScalar(0.5).add(tmp.set(0, 1.2, 0));
        sizeSprite(tag, 1.25);
      }
    });
    const tickVis = F !== null ? fz * wSky : 0;
    ticks.forEach(({ d, s }) => {
      s.visible = tickVis > 0.01;
      (s.material as T.SpriteMaterial).opacity = tickVis;
      s.center.set(0.5, 0.5);
      s.position.set(X0 + 2 + (d + 27) * SX, 0.05, 2.8);
      sizeSprite(s, 0.95);
    });
    if (F !== null && shownId !== F) {
      shownId = F;
      skyCard = mode > 0.5 && mode < 1.5;
      drawnDay = day;
      drawDetail(prods[F], F);
      pop = 0;
    }
    const sk = mode > 0.5 && mode < 1.5;
    if (shownId !== null && (sk !== skyCard || day !== drawnDay)) {
      skyCard = sk;
      drawnDay = day;
      drawDetail(prods[shownId], shownId);
    }
    pop += ((F !== null ? 1 : 0) - pop) * Math.min(1, dt * 5);
    const showCard = pop > 0.02 && shownId !== null;
    tether.visible = showCard;
    card.style.display = showCard ? "block" : "none";
    if (showCard && shownId !== null) {
      const it = items[shownId];
      const tw = it.towers[day ?? it.towers.length - 1];
      const a = mode > 1.5 ? it.cpos.clone().add(tmp.set(9.5 * it.card.scale.x, 0, 0)) : mode > 0.5 ? V(tw ? tw.position.x : X0, tw ? tw.scale.y + 0.2 : 1, it.z) : it.pos.clone();
      const upv = V(0, 1, 0).applyQuaternion(cam.quaternion);
      const cw = Math.max(1, R.domElement.clientWidth);
      const ch = Math.max(1, R.domElement.clientHeight);
      const px = Math.min(300, Math.max(260, cw * 0.2));   // fixed small card
      const left = cw - inset - px - 20;   // clear of the product list
      const cy = ch * 0.3;
      const k = 1 - Math.pow(1 - Math.min(1, pop), 3);
      const over = 1 + Math.sin(Math.min(1, pop) * Math.PI) * 0.04;
      card.style.width = `${px}px`;
      card.style.transform = `translate(${left}px, ${cy}px) translateY(-50%) scale(${(0.86 + 0.14 * k) * over})`;
      card.style.opacity = String(Math.min(1, pop * 1.4));
      card.style.pointerEvents = pop > 0.6 ? "auto" : "none";
      // the line: from the product (or picked day) to the card's left edge, a point on the camera ray through that pixel
      const ex = left + 1;
      const toNdc = new THREE.Vector2((ex / cw) * 2 - 1, -((cy / ch) * 2 - 1));
      ray.setFromCamera(toNdc, cam);
      const edge = ray.ray.at(Math.max(8, cam.position.distanceTo(a) * 0.9), new THREE.Vector3());
      const bend = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(edge, 0.5).addScaledVector(upv, a.distanceTo(edge) * 0.08), edge);
      const tp = tether.geometry.attributes.position;
      bend.getPoints(TETHER_N - 1).forEach((v, j) => tp.setXYZ(j, v.x, v.y, v.z));
      tp.needsUpdate = true;
      tether.geometry.computeBoundingSphere();
      const pa = a.clone().project(cam);
      const pe = edge.clone().project(cam);
      (tether.material as T.LineBasicMaterial).opacity = 0.6 * Math.max(0, (pop - 0.6) / 0.4) * (pa.x < pe.x - 0.02 && pa.z < 1 ? 1 : 0);
    }
    if (F === null && pop < 0.02) shownId = null;
    if (followCam || modeTarget !== null || (focus > 0.02 && focus < 0.98)) {
      const c = camFor(mode, focus);
      cam.position.lerp(c.p, 0.08);
      ctl.target.lerp(c.t, 0.08);
    }
    if (mode > 1.5) {
      // cards: look around a little, never round the back (mirrored)
      ctl.minAzimuthAngle = -0.45;
      ctl.maxAzimuthAngle = 0.45;
      ctl.minPolarAngle = 1.2;
      ctl.maxPolarAngle = 1.75;
    } else {
      ctl.minAzimuthAngle = -Infinity;
      ctl.maxAzimuthAngle = Infinity;
      ctl.minPolarAngle = 0.1;
      ctl.maxPolarAngle = 1.42;
    }
    ctl.autoRotate = mode < 0.05 && F === null && dragging === null && hovered === null;
    // keep the world centred in the space the product list leaves free
    const nextInset = insetNow + (inset - insetNow) * Math.min(1, dt * 6);
    if (Math.abs(nextInset - insetNow) > 0.05 || !cam.view) {
      insetNow = Math.abs(inset - nextInset) < 0.5 ? inset : nextInset;
      const w = Math.max(1, R.domElement.clientWidth);
      const h = Math.max(1, R.domElement.clientHeight);
      cam.setViewOffset(w, h, insetNow / 2, 0, w, h);
    }
    ctl.update();
    R.render(scene, cam);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // picking, clicking, dragging
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const aim = (e: PointerEvent) => {
    const b = R.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ptr, cam);
  };
  const pickAt = (e: PointerEvent): T.Object3D | null => {
    aim(e);
    const objs: T.Object3D[] =
      mode < 0.5 ? items.map((i) => i.node) : mode < 1.5 ? [...items.flatMap((i) => i.towers.filter((t) => t.visible)), ...items.map((i) => i.node)] : items.map((i) => i.card);
    const h = ray.intersectObjects(objs)[0];
    return h ? h.object : null;
  };
  let down: [number, number] | null = null;
  let grab: number | null = null;
  const dragPlane = new THREE.Plane();
  const hitP = new THREE.Vector3();
  const onDown = (e: PointerEvent) => {
    down = [e.clientX, e.clientY];
    const o = pickAt(e);
    grab = o && mode < 0.15 && selected === null ? (o.userData.idx as number) : null;
    if (grab !== null) {
      ctl.enabled = false;
      dragPlane.setFromNormalAndCoplanarPoint(cam.getWorldDirection(new THREE.Vector3()).negate(), gal[grab]);
      R.domElement.setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e: PointerEvent) => {
    if (grab !== null && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) {
      dragging = grab;
      pinned.add(grab);
    }
    if (dragging !== null) {
      aim(e);
      if (ray.ray.intersectPlane(dragPlane, hitP)) {
        hitP.y = Math.max(1.5, hitP.y);
        gal[dragging].copy(hitP);
      }
      return;
    }
    const o = pickAt(e);
    hovered = o ? (o.userData.idx as number) : null;
    hoverTower = o && o.userData.kind ? (o as T.Mesh<T.BoxGeometry, T.MeshStandardMaterial>) : null;
    R.domElement.style.cursor = o ? (mode < 0.15 && selected === null ? "grab" : "pointer") : "default";
    if (hoverTower) {
      const u = hoverTower.userData;
      const p = prods[u.idx as number];
      const b = host.getBoundingClientRect();
      tip.style.display = "block";
      tip.style.left = `${Math.min(b.width - 210, e.clientX - b.left + 14)}px`;
      tip.style.top = `${Math.max(8, e.clientY - b.top - 54)}px`;
      const head = document.createElement("b");
      tip.replaceChildren();
      if (u.kind === "past") {
        head.textContent = `${p.title} · ${dayLabel((u.i as number) - (p.past.length - 1))}`;
        tip.append(head, Object.assign(document.createElement("div"), { className: "m", textContent: `${u.u as number} sold · Shopify` }));
      } else if (p.f) {
        head.textContent = `${p.title} · ${dayLabel(u.k as number)}`;
        tip.append(head, Object.assign(document.createElement("div"), { className: "m", textContent: `likely ${Math.floor(p.f.lo / 14)}–${Math.ceil(p.f.hi / 14)} · Kumo` }));
        if (u.gone) tip.append(Object.assign(document.createElement("div"), { className: "m gone", textContent: "stock likely gone by then · untested" }));
      }
    } else tip.style.display = "none";
  };
  const onUp = (e: PointerEvent) => {
    ctl.enabled = true;
    if (dragging !== null) {
      dragging = null;
      grab = null;
      return;
    }
    grab = null;
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const o = pickAt(e);
    if (o && o.userData.kind && mode > 0.5 && mode < 1.5) {
      // a tower: that product, that day
      const i = o.userData.idx as number;
      const ti = items[i].towers.indexOf(o as Item["towers"][number]);
      if (i === selected) day = ti;
      else {
        pending = { idx: i, day: ti };
        cb.onSelect(i);
      }
      return;
    }
    cb.onSelect(o ? (o.userData.idx as number) : null);
  };
  const step = (d: number) => {
    if (selected === null || day === null) return;
    day = Math.max(0, Math.min(items[selected].towers.length - 1, day + d));
  };
  // ← → step through the days while a skyline row is focused (before the page's view keys)
  const onKey = (e: KeyboardEvent) => {
    if (selected === null || !(mode > 0.5 && mode < 1.5) || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    step(e.key === "ArrowLeft" ? -1 : 1);
  };
  window.addEventListener("keydown", onKey, true);
  const onLeave = () => {
    hovered = null;
    hoverTower = null;
    tip.style.display = "none";
  };
  R.domElement.addEventListener("pointerdown", onDown);
  R.domElement.addEventListener("pointermove", onMove);
  R.domElement.addEventListener("pointerup", onUp);
  R.domElement.addEventListener("pointerleave", onLeave);

  return {
    setView: (v) => {
      if (Math.round(modeTarget ?? mode) === v && modeTarget === null && mode === v) return;
      modeTarget = v;
      followCam = true;
      cb.onView(v);
    },
    select: (i) => {
      if (i === selected) return;
      if (i !== null && selected !== null) {
        pop = 0;
        shownId = null;
      }
      selected = i;
      day = i === null ? null : pending && pending.idx === i ? pending.day : todayOf(i);
      pending = null;
      followCam = true;
      hovered = null;
    },
    setInset: (px) => {
      inset = px;
    },
    setFilter: (m, o) => {
      matches = m;
      rank = o;
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      R.domElement.removeEventListener("pointerdown", onDown);
      R.domElement.removeEventListener("pointermove", onMove);
      R.domElement.removeEventListener("pointerup", onUp);
      R.domElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKey, true);
      card.remove();
      ctl.dispose();
      disposables.forEach((d) => d.dispose());
      R.dispose();
      R.forceContextLoss();
      R.domElement.remove();
    },
  };
}
