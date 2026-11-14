"use client";
/**
 * MyanmarGlobe v2
 *
 * - World globe (Three.js). Only Myanmar is active.
 * - Myanmar is split into its 14 states/regions (public/data/myanmar-regions.geojson).
 * - Click a region  -> it is selected and the globe zooms to it.
 * - Click inside the SELECTED region -> pin is placed (onPick).
 * - A list of all 14 regions under the globe does the same as clicking on the map.
 * - If `value` is set from outside (GPS, quick-jump, typed lat/lon) the matching region is auto-selected.
 *
 * npm i three topojson-client
 * npm i -D @types/three @types/topojson-client
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { feature } from "topojson-client";

type Coords = { lat: number; lon: number };
type Ring = number[][];
type Poly = Ring[];
export type City = { name: string; role: string; lat: number; lon: number };
export type Region = {
  id: string;
  name: string;
  type: "State" | "Region";
  label: string;
  capital: string;
  lat: number;
  lon: number;
  polys: Poly[];
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
  center: Coords;
  span: number; // degrees
};

const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json";
const REGIONS_URL = "/data/myanmar-regions.geojson"; // served from /public
const MYANMAR_ID = 104;
const MYANMAR_CENTER = { lat: 20.5, lon: 96.5 };

const COLORS = {
  ocean: "#07151f",
  grid: "rgba(120,170,190,0.10)",
  land: "#1f2c34",
  landLine: "#33444f",
  mm: "#2e8f5f",
  mmDim: "#1f6a47",
  mmSel: "#4fd89c",
  mmLine: "#a6f0c4",
  pin: "#ff5a36",
  city: "#f2b84b",
};

/* ------------------------------ geo helpers ------------------------------ */

const polysOf = (geom: any): Poly[] =>
  geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];

function inRing(lon: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPoly = (lon: number, lat: number, p: Poly) =>
  inRing(lon, lat, p[0]) && !p.slice(1).some((h) => inRing(lon, lat, h));

function regionAt(regions: Region[], lat: number, lon: number): Region | null {
  for (const r of regions) {
    const [x0, y0, x1, y1] = r.bbox;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    if (r.polys.some((p) => inPoly(lon, lat, p))) return r;
  }
  return null;
}

function toVec3(lat: number, lon: number, r = 1) {
  const phi = THREE.MathUtils.degToRad(lon + 180);
  const theta = THREE.MathUtils.degToRad(90 - lat);
  return new THREE.Vector3(
    -r * Math.cos(phi) * Math.sin(theta),
    r * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta)
  );
}
function toLatLon(p: THREE.Vector3) {
  const n = p.clone().normalize();
  const lat = THREE.MathUtils.radToDeg(Math.asin(n.y));
  let lon = THREE.MathUtils.radToDeg(Math.atan2(n.z, -n.x)) - 180;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

// camera distance that frames a region of `span` degrees
const distFor = (spanDeg: number) =>
  THREE.MathUtils.clamp(1 + 2.4 * THREE.MathUtils.degToRad(spanDeg), 1.15, 2.2);

function makeLabel(text: string, opts: { color: string; centered?: boolean; size?: number }) {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "600 28px ui-sans-serif, system-ui, sans-serif";
  g.textBaseline = "middle";
  g.textAlign = opts.centered ? "center" : "left";
  const x = opts.centered ? 192 : 8;
  g.lineWidth = 6;
  g.strokeStyle = "rgba(7,21,31,0.9)";
  g.strokeText(text, x, 32);
  g.fillStyle = opts.color;
  g.fillText(text, x, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const w = opts.size ?? 0.16;
  s.scale.set(w, w / 6, 1);
  s.center.set(opts.centered ? 0.5 : -0.03, 0.5);
  return s;
}

/* -------------------------------- component ------------------------------- */

type Api = {
  setPin: (c: Coords | null) => void;
  flyTo: (lat: number, lon: number, d: number) => void;
  select: (id: string | null, fly?: boolean) => void;
  regionIdAt: (lat: number, lon: number) => string | null;
};

export default function MyanmarGlobe({
  value,
  onPick,
  cities = [],
  onRegionChange,
}: {
  value: Coords | null;
  onPick: (lat: number, lon: number) => void;
  cities?: City[]; // e.g. capital + agriculture city read from the main JSON
  onRegionChange?: (region: Region | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  const regionCb = useRef(onRegionChange);
  const citiesRef = useRef(cities);
  const fromMap = useRef(false);
  const api = useRef<Api | null>(null);
  const selRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pickRef.current = onPick;
    regionCb.current = onRegionChange;
  }, [onPick, onRegionChange]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let raf = 0;
    let list: Region[] = [];

    const showHint = (msg: string) => {
      setHint(msg);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(null), 2600);
    };

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.1;
    controls.maxDistance = 4.5;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.7;

    // stars
    const starPos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(14 + Math.random() * 6);
      starPos.set([v.x, v.y, v.z], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x8fa9b8, size: 0.035, sizeAttenuation: true })));

    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1.045, 64, 64),
        new THREE.MeshBasicMaterial({ color: 0x3aa0c9, transparent: true, opacity: 0.1, side: THREE.BackSide })
      )
    );

    const globeMat = new THREE.MeshBasicMaterial({ color: COLORS.ocean });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), globeMat);
    scene.add(globe);

    const pinGroup = new THREE.Group();
    const cityGroup = new THREE.Group();
    const regionLabels = new THREE.Group();
    const outlines = new Map<string, THREE.LineBasicMaterial>();
    scene.add(pinGroup, cityGroup, regionLabels);
    regionLabels.visible = false;

    for (const c of citiesRef.current) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 16, 16), new THREE.MeshBasicMaterial({ color: COLORS.city }));
      dot.position.copy(toVec3(c.lat, c.lon, 1.006));
      const label = makeLabel(c.name, { color: "#f6e7c1", size: 0.13 });
      label.position.copy(toVec3(c.lat, c.lon, 1.02));
      cityGroup.add(dot, label);
    }

    /* ---- fly-to ---- */
    let fly: null | { from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; t: number } = null;
    const flyTo = (lat: number, lon: number, dist: number) => {
      fly = { from: camera.position.clone().normalize(), to: toVec3(lat, lon).normalize(), d0: camera.position.length(), d1: dist, t: 0 };
    };
    controls.addEventListener("start", () => (fly = null));

    const setPin = (c: Coords | null) => {
      pinGroup.clear();
      if (!c) return;
      const base = toVec3(c.lat, c.lon, 1);
      const head = toVec3(c.lat, c.lon, 1.035);
      const stick = new THREE.Line(new THREE.BufferGeometry().setFromPoints([base, head]), new THREE.LineBasicMaterial({ color: COLORS.pin }));
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.014, 20, 20), new THREE.MeshBasicMaterial({ color: COLORS.pin }));
      ball.position.copy(head);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.016, 0.022, 40),
        new THREE.MeshBasicMaterial({ color: COLORS.pin, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      );
      ring.position.copy(toVec3(c.lat, c.lon, 1.003));
      ring.lookAt(ring.position.clone().multiplyScalar(2));
      pinGroup.add(stick, ball, ring);
    };

    /* ---- painting (base world once, regions repainted on selection) ---- */
    const W = 4096;
    const H = 2048;
    const X = (lon: number) => ((lon + 180) / 360) * W;
    const Y = (lat: number) => ((90 - lat) / 180) * H;
    const baseCv = document.createElement("canvas");
    baseCv.width = W;
    baseCv.height = H;
    const outCv = document.createElement("canvas");
    outCv.width = W;
    outCv.height = H;
    let tex: THREE.CanvasTexture | null = null;

    const trace = (g: CanvasRenderingContext2D, polys: Poly[]) => {
      g.beginPath();
      for (const poly of polys)
        for (const ring of poly) {
          ring.forEach(([lon, lat], i) => (i ? g.lineTo(X(lon), Y(lat)) : g.moveTo(X(lon), Y(lat))));
          g.closePath();
        }
    };

    const repaint = () => {
      const g = outCv.getContext("2d")!;
      g.drawImage(baseCv, 0, 0);
      g.lineJoin = "round";
      const selected = selRef.current;
      for (const r of list) {
        trace(g, r.polys);
        g.fillStyle = !selected ? COLORS.mm : r.id === selected ? COLORS.mmSel : COLORS.mmDim;
        g.fill("evenodd");
        g.strokeStyle = COLORS.mmLine;
        g.lineWidth = r.id === selected ? 3.5 : 1.4;
        g.stroke();
      }
      outlines.forEach((m, id) => m.color.set(id === selected ? "#ffffff" : COLORS.mmLine));
      if (tex) tex.needsUpdate = true;
    };

    const select = (id: string | null, doFly = true) => {
      selRef.current = id;
      setSel(id);
      repaint();
      const r = list.find((x) => x.id === id) ?? null;
      regionCb.current?.(r);
      if (doFly) {
        if (r) flyTo(r.center.lat, r.center.lon, distFor(r.span));
        else flyTo(MYANMAR_CENTER.lat, MYANMAR_CENTER.lon, 2.0);
      }
    };

    api.current = {
      setPin,
      flyTo,
      select,
      regionIdAt: (lat, lon) => regionAt(list, lat, lon)?.id ?? null,
    };

    /* ---- sizing ---- */
    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    camera.position.copy(toVec3(MYANMAR_CENTER.lat, MYANMAR_CENTER.lon, 2.9));
    controls.update();

    /* ---- picking ---- */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const groundPoint = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(globe, false)[0];
      return hit ? toLatLon(hit.point) : null;
    };

    const dom = renderer.domElement;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; // drag, not click
      down = null;
      const p = groundPoint(e.clientX, e.clientY);
      if (!p || !list.length) return;
      const r = regionAt(list, p.lat, p.lon);
      if (!r) {
        showHint("Only Myanmar is active — click inside its borders");
        return;
      }
      if (selRef.current === r.id) {
        fromMap.current = true;
        pickRef.current(Number(p.lat.toFixed(5)), Number(p.lon.toFixed(5)));
      } else {
        select(r.id);
        showHint(`${r.label} selected — click inside it to place your pin`);
      }
    };
    let moveQueued = false;
    const onMove = (e: PointerEvent) => {
      if (moveQueued || e.buttons) return;
      moveQueued = true;
      requestAnimationFrame(() => {
        moveQueued = false;
        const p = groundPoint(e.clientX, e.clientY);
        const r = p ? regionAt(list, p.lat, p.lon) : null;
        dom.style.cursor = !r ? "grab" : r.id === selRef.current ? "crosshair" : "pointer";
      });
    };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointermove", onMove);

    /* ---- loop ---- */
    const clock = new THREE.Clock();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = clock.getDelta();
      if (fly) {
        fly.t = Math.min(1, fly.t + dt / 1.1);
        const e = 1 - Math.pow(1 - fly.t, 3);
        const dir = fly.from.clone().lerp(fly.to, e).normalize();
        camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(fly.d0, fly.d1, e)));
        if (fly.t >= 1) fly = null;
      }
      regionLabels.visible = camera.position.length() < 1.9;
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    /* ---- load world + 14 regions ---- */
    (async () => {
      try {
        const [topo, geo]: any[] = await Promise.all([
          fetch(WORLD_URL).then((r) => r.json()),
          fetch(REGIONS_URL).then((r) => {
            if (!r.ok) throw new Error(`Missing ${REGIONS_URL} — put myanmar-regions.geojson in /public/data`);
            return r.json();
          }),
        ]);
        if (disposed) return;
        const fc: any = feature(topo, topo.objects.countries);

        // base: ocean, graticule, every country except Myanmar
        const g = baseCv.getContext("2d")!;
        g.fillStyle = COLORS.ocean;
        g.fillRect(0, 0, W, H);
        g.strokeStyle = COLORS.grid;
        g.lineWidth = 1;
        for (let lon = -180; lon <= 180; lon += 15) {
          g.beginPath();
          g.moveTo(X(lon), 0);
          g.lineTo(X(lon), H);
          g.stroke();
        }
        for (let lat = -75; lat <= 75; lat += 15) {
          g.beginPath();
          g.moveTo(0, Y(lat));
          g.lineTo(W, Y(lat));
          g.stroke();
        }
        g.lineJoin = "round";
        for (const f of fc.features) {
          if (Number(f.id) === MYANMAR_ID) continue;
          trace(g, polysOf(f.geometry));
          g.fillStyle = COLORS.land;
          g.fill("evenodd");
          g.strokeStyle = COLORS.landLine;
          g.lineWidth = 1.2;
          g.stroke();
        }

        // regions
        list = geo.features.map((f: any): Region => {
          const polys = polysOf(f.geometry);
          let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
          for (const p of polys) for (const [lon, lat] of p[0]) {
            if (lon < x0) x0 = lon;
            if (lon > x1) x1 = lon;
            if (lat < y0) y0 = lat;
            if (lat > y1) y1 = lat;
          }
          const cLat = (y0 + y1) / 2;
          return {
            ...f.properties,
            polys,
            bbox: [x0, y0, x1, y1],
            center: { lat: cLat, lon: (x0 + x1) / 2 },
            span: Math.max((x1 - x0) * Math.cos(THREE.MathUtils.degToRad(cLat)), y1 - y0),
          };
        });

        for (const r of list) {
          const mat = new THREE.LineBasicMaterial({ color: COLORS.mmLine });
          outlines.set(r.id, mat);
          for (const poly of r.polys)
            for (const ring of poly) {
              const pts = ring.map(([lon, lat]) => toVec3(lat, lon, 1.0015));
              scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat));
            }
          const lab = makeLabel(r.name, { color: "#ffffff", centered: true, size: 0.15 });
          lab.position.copy(toVec3(r.lat, r.lon, 1.012));
          regionLabels.add(lab);
        }

        tex = new THREE.CanvasTexture(outCv);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        globeMat.map = tex;
        globeMat.color.set(0xffffff);
        globeMat.needsUpdate = true;
        repaint();
        setRegions(list);
        setReady(true);
      } catch (err: any) {
        if (!disposed) setError(err?.message ?? "Could not load the map data");
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      ro.disconnect();
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointermove", onMove);
      controls.dispose();
      scene.traverse((o: any) => {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : m ? [m] : []).forEach((x: any) => {
          x.map?.dispose?.();
          x.dispose?.();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  // keep pin + selected region in sync with `value`
  useEffect(() => {
    const a = api.current;
    if (!ready || !a) return;
    a.setPin(value);
    if (!value) return;
    const rid = a.regionIdAt(value.lat, value.lon);
    if (rid && rid !== selRef.current) a.select(rid, false);
    if (fromMap.current) fromMap.current = false;
    else {
      const r = regions.find((x) => x.id === rid);
      a.flyTo(value.lat, value.lon, r ? Math.max(distFor(r.span), 1.2) : 1.4);
    }
  }, [ready, value, regions]);

  const current = regions.find((r) => r.id === sel) ?? null;
  const pinRegion = value ? regions.find((r) => regionAt([r], value.lat, value.lon)) : null;

  return (
    <div>
      <div className="relative isolate h-80 w-full overflow-hidden rounded-xl border border-stone-800 bg-[#050d14] md:h-[26rem]">
        <div
          ref={host}
          className="absolute inset-0 cursor-grab"
          aria-label="3D globe: Myanmar only. Click a region to zoom in, then click inside it to place your pin."
        />

        {!ready && !error && <div className="absolute inset-0 grid place-items-center text-sm text-emerald-200/70">Loading globe…</div>}
        {error && <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-red-300">{error}</div>}

        {ready && (
          <>
            <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/45 px-2.5 py-1.5 text-xs leading-tight text-emerald-100 backdrop-blur">
              <div className="font-semibold tracking-wide">{current ? current.label.toUpperCase() : "MYANMAR · ACTIVE"}</div>
              <div className="text-[10px] text-stone-400">
                {current ? `Capital: ${current.capital} · click inside to pin` : "Click a region to zoom in"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => api.current?.select(null)}
              className="absolute right-3 top-3 rounded-md bg-emerald-600/90 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
            >
              All Myanmar
            </button>

            {value && (
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/50 px-2.5 py-1 font-mono text-xs text-amber-200 backdrop-blur">
                {value.lat.toFixed(4)}°N {value.lon.toFixed(4)}°E
              </div>
            )}

            {hint && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
                <div className="rounded-full bg-black/75 px-3 py-1.5 text-center text-xs text-amber-100">{hint}</div>
              </div>
            )}
          </>
        )}
      </div>

      {ready && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{regions.length} states &amp; regions</h3>
            <span className="text-[11px] text-stone-400">Tap one to zoom in</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-5">
            {regions.map((r) => {
              const active = r.id === sel;
              const hasPin = pinRegion?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => api.current?.select(r.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-left text-xs ring-1 transition ${
                    active ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
                  }`}
                >
                  <span className="flex items-center justify-between gap-1 font-medium">
                    <span className="truncate">{r.name}</span>
                    {hasPin && <span aria-label="pinned here">📍</span>}
                  </span>
                  <span className={`block text-[10px] ${active ? "text-emerald-100" : "text-stone-400"}`}>
                    {r.type} · {r.capital}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}