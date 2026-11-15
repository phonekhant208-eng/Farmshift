"use client";
/**
 * MyanmarGlobe v5
 *
 * - World globe (Three.js); only Myanmar is active.
 * - Myanmar's 14 states/regions are real vector meshes + fat lines, so they stay SHARP at any zoom.
 * - Click a region (or pick it in the list) -> FOCUS MODE: the camera zooms until the region fills the
 *   whole container and everything else (world, other regions) is hidden. Click inside the focused region to drop the pin.
 * - DISTRICTS: every state/region has a district list with crop notes. When a region is focused its district
 *   list + crop-fit panel show up. If the region also has a boundary file, the districts are drawn on top
 *   of the map (names, hover, tap-to-select). Regions without a boundary file show the list only.
 * - Pin / labels keep a constant on-screen size (they scale with zoom).
 * - MANY FIELDS: when there are lots of farmer fields they are grouped into numbered circles that split
 *   apart as you zoom in (tap a circle to zoom into it). Your own fields are never grouped.
 *
 * npm i three topojson-client
 * npm i -D @types/three @types/topojson-client
 * Needs in /public/data:
 *   myanmar-regions.geojson
 *   <region-id>_district_crop_fits.json     (crop notes per district, one file per region, e.g. bago_district_crop_fits.json)
 *   <region-id>-districts.geojson           (district shapes, OPTIONAL, e.g. ayeyarwady-districts.geojson.
 *                                            Drop one in for any region and its districts get drawn on the map.)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { feature } from "topojson-client";

type Coords = { lat: number; lon: number };
type Ring = number[][];
type Poly = Ring[];
type BBox = [number, number, number, number];
type Shape = { bbox: BBox; polys: Poly[] };
/** A farmer's field shown as a dot on the globe (lat/lon = centre of the zone). */
export type GlobeZone = { id: string; lat: number; lon: number; mine: boolean; title: string; detail: string };
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
  bbox: BBox;
  center: Coords;
  span: number;
};
export type District = {
  id: string;
  name: string;
  name_my: string;
  pcode: string;
  lat: number;
  lon: number;
  polys: Poly[];
  bbox: BBox;
  center: Coords;
};
export type DistrictPick = { id: string; name: string };

type Fit = {
  name_en: string;
  name_my?: string;
  primary_crop_fit: string | null;
  conditional_alternatives: string[];
  conditions_and_caveats: string;
};
type Fits = { limitations?: string[]; districts: Fit[]; self_administered_areas?: Fit[] };

const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json";
const REGIONS_URL = "/data/myanmar-regions.geojson";
const districtsUrl = (regionId: string) => `/data/${regionId}-districts.geojson`; // optional boundary file
const fitsUrl = (regionId: string) => `/data/${regionId}_district_crop_fits.json`;
const MYANMAR_CENTER = { lat: 20.3, lon: 96.5 };
const START_DIST = 2.5;
const OVERVIEW_DIST = 1.75;
const NO_CLUSTER_BELOW = 30; // with this many fields or fewer, every field is its own dot

const COLORS = {
  ocean: "#eef7ee",
  grid: "rgba(37,138,57,0.10)",
  land: "#cdb594",
  landLine: "#a98c68",
  fills: ["#258a39", "#2e9a45", "#1f7a33"],
  distFills: ["#2a8f3f", "#1f7a33", "#34a247", "#278a3a"],
  distSel: "#c28a3e",
  hover: "#57bd62",
  sel: "#34a247",
  line: "#ffffff",
  lineSel: "#ffffff",
  pin: "#d9480f",
  city: "#6b5440",
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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

/** Which shape (region or district) contains this point. */
function regionAt<T extends Shape>(regions: T[], lat: number, lon: number): T | null {
  for (const r of regions) {
    const [x0, y0, x1, y1] = r.bbox;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    if (r.polys.some((p) => inPoly(lon, lat, p))) return r;
  }
  return null;
}

function boundsOf(polys: Poly[]): { bbox: BBox; center: Coords } {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const p of polys) for (const [lon, lat] of p[0]) {
    if (lon < x0) x0 = lon;
    if (lon > x1) x1 = lon;
    if (lat < y0) y0 = lat;
    if (lat > y1) y1 = lat;
  }
  return { bbox: [x0, y0, x1, y1], center: { lat: (y0 + y1) / 2, lon: (x0 + x1) / 2 } };
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

/** Filled region mesh: triangulate in lon/lat, subdivide, project onto the sphere. */
function fillGeometry(polys: Poly[], radius: number, maxEdge = 1.5) {
  const pos: number[] = [];
  const emit = (a: number[], b: number[], c: number[], depth = 0) => {
    const d = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (depth < 6 && Math.max(d(a, b), d(b, c), d(c, a)) > maxEdge) {
      const m = (p: number[], q: number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const ab = m(a, b), bc = m(b, c), ca = m(c, a);
      emit(a, ab, ca, depth + 1);
      emit(ab, b, bc, depth + 1);
      emit(ca, bc, c, depth + 1);
      emit(ab, bc, ca, depth + 1);
    } else {
      for (const p of [a, b, c]) {
        const v = toVec3(p[1], p[0], radius);
        pos.push(v.x, v.y, v.z);
      }
    }
  };
  for (const poly of polys) {
    const outer = poly[0].map(([x, y]) => new THREE.Vector2(x, y));
    const holes = poly.slice(1).map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
    const tris = THREE.ShapeUtils.triangulateShape(outer, holes);
    const all = outer.concat(...holes); // same order the triangulator used
    for (const [i, j, k] of tris) emit([all[i].x, all[i].y], [all[j].x, all[j].y], [all[k].x, all[k].y]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function makeLabel(text: string, color: string, width: number, centered = false, outline = "rgba(255,255,255,0.95)") {
  const CW = 320, CH = 64;
  const c = document.createElement("canvas");
  c.width = CW;
  c.height = CH;
  const g = c.getContext("2d")!;
  g.font = "600 30px ui-sans-serif, system-ui, sans-serif";
  g.textBaseline = "middle";
  g.textAlign = centered ? "center" : "left";
  const x = centered ? CW / 2 : 6;
  g.lineWidth = 7;
  g.lineJoin = "round";
  g.strokeStyle = outline;
  g.strokeText(text, x, CH / 2);
  g.fillStyle = color;
  g.fillText(text, x, CH / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.center.set(centered ? 0.5 : -0.04, 0.5);
  s.userData.base = new THREE.Vector3(width, (width * CH) / CW, 1);
  s.scale.copy(s.userData.base);
  return s;
}

/** Round numbered badge that stands for a group of fields. */
function makeBadgeTexture(n: number) {
  const S = 96;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.arc(S / 2, S / 2, 40, 0, Math.PI * 2);
  g.fillStyle = "#92400e";
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = "#ffffff";
  g.stroke();
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const text = n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  g.font = `700 ${text.length >= 4 ? 28 : text.length === 3 ? 32 : 40}px ui-sans-serif, system-ui, sans-serif`;
  g.fillText(text, S / 2, S / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Size of one grouping cell in degrees for the current zoom. 0 = no grouping. */
function cellDeg(count: number, dist: number) {
  if (count <= NO_CLUSTER_BELOW || dist < 1.1) return 0;
  return Math.min(2, Math.round((dist - 1) * 1.6 * 20) / 20);
}

/* -------------------------------- component ------------------------------- */

type Api = {
  setPin: (c: Coords | null) => void;
  setZones: (z: GlobeZone[]) => void;
  flyTo: (lat: number, lon: number, d: number) => void;
  select: (id: string | null, fly?: boolean) => void;
  selectDistrict: (id: string | null, fly?: boolean) => void;
  regionIdAt: (lat: number, lon: number) => string | null;
  districtIdAt: (lat: number, lon: number) => string | null;
  loadDistricts: (regionId: string) => void;
  fitDist: (id: string) => number;
};

type ZEntry = { obj: THREE.Object3D; zone?: GlobeZone; cluster?: { zs: GlobeZone[]; lat: number; lon: number } };

export default function MyanmarGlobe({
  value,
  onPick,
  cities = [],
  onRegionChange,
  onDistrictChange,
  zones = [],
}: {
  value: Coords | null;
  onPick: (lat: number, lon: number) => void;
  cities?: City[];
  onRegionChange?: (region: Region | null) => void;
  /** Called when a district of the focused region is selected (null = none). */
  onDistrictChange?: (d: DistrictPick | null) => void;
  zones?: GlobeZone[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  const regionCb = useRef(onRegionChange);
  const districtCb = useRef(onDistrictChange);
  const citiesRef = useRef(cities);
  const fromMap = useRef(false);
  const api = useRef<Api | null>(null);
  const selRef = useRef<string | null>(null);
  const distSelRef = useRef<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fitsTried = useRef<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [fitsMap, setFitsMap] = useState<Record<string, Fits | "err">>({});
  const [sel, setSel] = useState<string | null>(null);
  const [distSel, setDistSel] = useState<string | null>(null);

  useEffect(() => {
    pickRef.current = onPick;
    regionCb.current = onRegionChange;
    districtCb.current = onDistrictChange;
  }, [onPick, onRegionChange, onDistrictChange]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let raf = 0;
    let list: Region[] = [];
    let hoverId: string | null = null;

    const showHint = (msg: string) => {
      setHint(msg);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(null), 2400);
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
    controls.minDistance = 1.04;
    controls.maxDistance = 4.5;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.7;

    // stars
    const starPos = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(14 + Math.random() * 6);
      starPos.set([v.x, v.y, v.z], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x8fa9b8, size: 0.03 }));
    scene.add(stars);

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.04, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x57bd62, transparent: true, opacity: 0.12, side: THREE.BackSide })
    );
    scene.add(atmo);

    const globeMat = new THREE.MeshBasicMaterial({ color: COLORS.ocean });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), globeMat);
    scene.add(globe);

    // objects whose on-screen size should stay constant while zooming
    const scalables: THREE.Object3D[] = [];

    /* ---- pin (built in a local frame: +Y = surface normal) ---- */
    const pin = new THREE.Group();
    const pinMat = new THREE.MeshBasicMaterial({ color: COLORS.pin });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.03, 8), pinMat);
    stick.position.y = 0.015;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 20, 20), pinMat);
    ball.position.y = 0.034;
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.0085, 0.0125, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: COLORS.pin, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    halo.position.y = 0.0004;
    pin.add(stick, ball, halo);
    pin.visible = false;
    pin.userData.base = new THREE.Vector3(1, 1, 1);
    scene.add(pin);
    scalables.push(pin);

    const setPin = (c: Coords | null) => {
      if (!c) {
        pin.visible = false;
        return;
      }
      const p = toVec3(c.lat, c.lon, 1.0012);
      pin.position.copy(p);
      pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
      pin.visible = true;
    };

    /* ---- city markers ---- */
    const cityObjs = citiesRef.current.map((c) => {
      const g = new THREE.Group();
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 16), new THREE.MeshBasicMaterial({ color: COLORS.city }));
      dot.position.copy(toVec3(c.lat, c.lon, 1.003));
      dot.userData.base = new THREE.Vector3(1, 1, 1);
      const label = makeLabel(c.name, "#503e2f", 0.2);
      label.position.copy(toVec3(c.lat, c.lon, 1.006));
      g.add(dot, label);
      scene.add(g);
      scalables.push(dot, label);
      return { g, lat: c.lat, lon: c.lon, region: null as string | null };
    });

    /* ---- farmers' fields: green = mine, brown = other farmers; many fields are grouped ---- */
    let zoneEntries: ZEntry[] = [];
    let allZones: GlobeZone[] = [];
    let visZones: GlobeZone[] = []; // fields in the focused region (or all of them)
    let curDeg = -1; // grouping size currently drawn (-1 = redraw on the next frame)
    const regionOfZone = new Map<string, string | null>();
    const ringGeo = new THREE.SphereGeometry(0.0125, 12, 12);
    const coreGeo = new THREE.SphereGeometry(0.0095, 12, 12);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const mineMat = new THREE.MeshBasicMaterial({ color: "#16a34a" });
    const otherMat = new THREE.MeshBasicMaterial({ color: "#92400e" });
    const badgeCache = new Map<string, THREE.CanvasTexture>();
    const badgeTex = (n: number) => {
      const key = n >= 1000 ? `k${Math.round(n / 100)}` : String(n);
      let t = badgeCache.get(key);
      if (!t) {
        t = makeBadgeTexture(n);
        badgeCache.set(key, t);
      }
      return t;
    };

    const clearZones = () => {
      for (const e of zoneEntries) {
        scene.remove(e.obj);
        const k = scalables.indexOf(e.obj);
        if (k >= 0) scalables.splice(k, 1);
        if (e.cluster) (e.obj as THREE.Sprite).material.dispose(); // the texture is cached and reused
      }
      zoneEntries = [];
    };

    const addDot = (z: GlobeZone) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(ringGeo, ringMat), new THREE.Mesh(coreGeo, z.mine ? mineMat : otherMat));
      g.position.copy(toVec3(z.lat, z.lon, 1.005));
      g.userData.base = new THREE.Vector3(1, 1, 1);
      scene.add(g);
      scalables.push(g);
      zoneEntries.push({ obj: g, zone: z });
    };

    const buildZones = (deg: number) => {
      clearZones();
      if (deg === 0) {
        visZones.forEach(addDot);
        return;
      }
      const cells = new Map<string, GlobeZone[]>();
      for (const z of visZones) {
        if (z.mine) { addDot(z); continue; } // my own fields are never grouped
        const k = `${Math.floor(z.lat / deg)}_${Math.floor(z.lon / deg)}`;
        const a = cells.get(k);
        if (a) a.push(z); else cells.set(k, [z]);
      }
      cells.forEach((zs) => {
        if (zs.length === 1) { addDot(zs[0]); return; }
        const lat = zs.reduce((s, z) => s + z.lat, 0) / zs.length;
        const lon = zs.reduce((s, z) => s + z.lon, 0) / zs.length;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTex(zs.length), transparent: true }));
        sp.position.copy(toVec3(lat, lon, 1.007));
        const sc = 0.05 + 0.012 * Math.log10(zs.length);
        sp.userData.base = new THREE.Vector3(sc, sc, 1);
        sp.scale.copy(sp.userData.base);
        scene.add(sp);
        scalables.push(sp);
        zoneEntries.push({ obj: sp, cluster: { zs, lat, lon } });
      });
    };

    const regionOfZ = (z: GlobeZone) => {
      let v = regionOfZone.get(z.id);
      if (v === undefined) {
        v = regionAt(list, z.lat, z.lon)?.id ?? null;
        regionOfZone.set(z.id, v);
      }
      return v;
    };
    const refreshVis = () => {
      const s = selRef.current;
      visZones = !s || !list.length ? allZones : allZones.filter((z) => regionOfZ(z) === s);
      curDeg = -1;
    };
    const setZones = (zs: GlobeZone[]) => {
      allZones = zs;
      regionOfZone.clear();
      refreshVis();
    };

    const zoneAt = (cx: number, cy: number): ZEntry | null => {
      if (!zoneEntries.length) return null;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(zoneEntries.map((e) => e.obj), true)[0];
      if (!hit) return null;
      const earth = ray.intersectObject(globe, false)[0]; // ignore dots on the far side
      if (earth && hit.distance > earth.distance + 0.02) return null;
      let n: THREE.Object3D | null = hit.object;
      while (n && !zoneEntries.some((e) => e.obj === n)) n = n.parent;
      return zoneEntries.find((e) => e.obj === n) ?? null;
    };

    /* ---- region objects (filled after data loads) ---- */
    type RObj = { fill: THREE.Mesh; fillMat: THREE.MeshBasicMaterial; lines: THREE.Group; lineMat: LineMaterial; label: THREE.Sprite };
    const robjs = new Map<string, RObj>();
    const lineMats: LineMaterial[] = [];
    let worldTex: THREE.CanvasTexture | null = null;

    /* ---- district objects (one boundary set per region, loaded the first time that region is opened) ---- */
    type DObj = { fillMat: THREE.MeshBasicMaterial; lineMat: LineMaterial; label: THREE.Sprite };
    type DSet = { list: District[]; group: THREE.Group; objs: Map<string, DObj> };
    const dsets = new Map<string, DSet>(); // regionId -> its drawn districts (list may be empty = no boundary file)
    const dloading = new Set<string>();
    let dlist: District[] = []; // districts of the focused region
    let dobjs: Map<string, DObj> = new Map();
    let dHover: string | null = null;

    const districtsOn = () => dlist.length > 0;

    const applyDistrict = () => {
      const on = districtsOn();
      dsets.forEach((ds, rid) => (ds.group.visible = on && selRef.current === rid));
      const picked = distSelRef.current;
      dlist.forEach((d, i) => {
        const o = dobjs.get(d.id);
        if (!o) return;
        const isPicked = picked === d.id;
        const isHover = dHover === d.id && !isPicked;
        o.fillMat.color.set(isPicked ? COLORS.distSel : isHover ? COLORS.hover : COLORS.distFills[i % COLORS.distFills.length]);
        o.lineMat.linewidth = isPicked ? 3.2 : 1.5;
      });
      const rObj = selRef.current ? robjs.get(selRef.current) : null;
      if (rObj) rObj.label.visible = !on; // district names replace the region name
    };

    const applyStyle = () => {
      const s = selRef.current;
      list.forEach((r, i) => {
        const o = robjs.get(r.id);
        if (!o) return;
        const focused = s === r.id;
        const vis = !s || focused;
        o.fill.visible = vis;
        o.lines.visible = vis;
        o.label.visible = focused;
        o.fillMat.color.set(focused ? COLORS.sel : hoverId === r.id && !s ? COLORS.hover : COLORS.fills[i % 3]);
        o.lineMat.color.set(focused ? COLORS.lineSel : COLORS.line);
        o.lineMat.linewidth = focused ? 2.6 : 1.3;
      });
      cityObjs.forEach((c) => (c.g.visible = !s || c.region === s));
      globeMat.map = s ? null : worldTex;
      globeMat.color.set(s ? COLORS.ocean : 0xffffff);
      globeMat.needsUpdate = true;
      stars.visible = false;
      applyDistrict();
    };

    /* ---- fly-to ---- */
    let fly: null | { from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; t: number } = null;
    const flyTo = (lat: number, lon: number, dist: number) => {
      fly = { from: camera.position.clone().normalize(), to: toVec3(lat, lon).normalize(), d0: camera.position.length(), d1: dist, t: 0 };
    };
    controls.addEventListener("start", () => (fly = null));

    // camera distance at which a shape's bounding box fills the whole container
    const fitDist = (r: { bbox: BBox; center: Coords }) => {
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const [x0, y0, x1, y1] = r.bbox;
      const hArc = THREE.MathUtils.degToRad(y1 - y0);
      const wArc = THREE.MathUtils.degToRad((x1 - x0) * Math.cos(THREE.MathUtils.degToRad(r.center.lat)));
      const need = Math.max(hArc / (2 * t), wArc / (2 * t * camera.aspect)) / 0.94;
      return Math.max(1.045, 1 + need);
    };

    const setDistrictId = (id: string | null) => {
      distSelRef.current = id;
      setDistSel(id);
      applyDistrict();
    };

    /** Build the drawn districts of one region from its (optional) boundary file. Safe to call many times. */
    const buildDistricts = (regionId: string, dgeo: any) => {
      const group = new THREE.Group();
      group.visible = false;
      scene.add(group);
      const objs = new Map<string, DObj>();
      const list2: District[] = (dgeo?.features ?? []).map((f: any): District => {
        const polys = polysOf(f.geometry);
        const p = f.properties ?? {};
        const b = boundsOf(polys);
        return {
          id: p.id ?? slug(p.name_en ?? ""),
          name: p.name_en,
          name_my: p.name_my ?? "",
          pcode: p.pcode ?? "",
          lat: p.lat ?? b.center.lat,
          lon: p.lon ?? b.center.lon,
          polys,
          ...b,
        };
      });
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      list2.forEach((d, i) => {
        const fillMat = new THREE.MeshBasicMaterial({
          color: COLORS.distFills[i % COLORS.distFills.length],
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
        const fill = new THREE.Mesh(fillGeometry(d.polys, 1.0013), fillMat);
        const lineMat = new LineMaterial({ color: 0xffffff, linewidth: 1.5 });
        lineMat.resolution.set(w, h);
        lineMats.push(lineMat);
        const lines = new THREE.Group();
        for (const poly of d.polys)
          for (const ring of poly) {
            const arr: number[] = [];
            for (const [lon, lat] of ring) {
              const v = toVec3(lat, lon, 1.0019);
              arr.push(v.x, v.y, v.z);
            }
            const lg = new LineGeometry();
            lg.setPositions(arr);
            lines.add(new Line2(lg, lineMat));
          }
        const label = makeLabel(d.name, "#ffffff", 0.2, true, "rgba(19,72,34,0.92)");
        label.position.copy(toVec3(d.lat, d.lon, 1.0045));
        group.add(fill, lines, label);
        scalables.push(label);
        objs.set(d.id, { fillMat, lineMat, label });
      });
      dsets.set(regionId, { list: list2, group, objs });
    };

    const loadDistricts = (regionId: string) => {
      if (dsets.has(regionId) || dloading.has(regionId)) return;
      dloading.add(regionId);
      fetch(districtsUrl(regionId))
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((dgeo) => {
          dloading.delete(regionId);
          if (disposed) return;
          buildDistricts(regionId, dgeo); // no file = empty set, the region just has the list
          if (selRef.current === regionId) {
            const ds = dsets.get(regionId)!;
            dlist = ds.list;
            dobjs = ds.objs;
            setDistricts(dlist);
            applyStyle();
          }
        });
    };

    const select = (id: string | null, doFly = true) => {
      const changed = selRef.current !== id;
      selRef.current = id;
      setSel(id);
      if (changed && distSelRef.current) setDistrictId(null); // districts belong to one region
      const ds = id ? dsets.get(id) : null;
      dlist = ds?.list ?? [];
      dobjs = ds?.objs ?? new Map();
      setDistricts(dlist);
      if (id) loadDistricts(id); // fetch this region's district boundaries the first time (optional file)
      dHover = null;
      applyStyle();
      refreshVis();
      const r = list.find((x) => x.id === id) ?? null;
      regionCb.current?.(r);
      if (doFly) {
        if (r) flyTo(r.center.lat, r.center.lon, fitDist(r));
        else flyTo(MYANMAR_CENTER.lat, MYANMAR_CENTER.lon, OVERVIEW_DIST);
      }
    };

    const selectDistrict = (id: string | null, doFly = true) => {
      if (id && !selRef.current) return; // districts only exist inside a focused region
      setDistrictId(id);
      if (!doFly) return;
      const d = id ? dlist.find((x) => x.id === id) : null;
      if (d) flyTo(d.center.lat, d.center.lon, fitDist(d));
      else if (!id) {
        const r = list.find((x) => x.id === selRef.current);
        if (r) flyTo(r.center.lat, r.center.lon, fitDist(r));
      }
    };

    api.current = {
      setPin,
      setZones,
      flyTo,
      select,
      selectDistrict,
      regionIdAt: (lat, lon) => regionAt(list, lat, lon)?.id ?? null,
      districtIdAt: (lat, lon) => regionAt(dlist, lat, lon)?.id ?? null,
      loadDistricts,
      fitDist: (id) => {
        const r = list.find((x) => x.id === id);
        return r ? fitDist(r) : 1.4;
      },
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
      lineMats.forEach((m) => m.resolution.set(w, h));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    camera.position.copy(toVec3(MYANMAR_CENTER.lat, MYANMAR_CENTER.lon, START_DIST));
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
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      down = null;
      const zh = zoneAt(e.clientX, e.clientY);
      if (zh) {
        if (zh.cluster) {
          // a group of fields: zoom into it so it splits apart
          const d = camera.position.length();
          showHint(`${zh.cluster.zs.length} fields here. Zooming in…`);
          flyTo(zh.cluster.lat, zh.cluster.lon, Math.max(1.04, 1 + (d - 1) * 0.45));
        } else if (zh.zone) {
          showHint(`${zh.zone.title} · ${zh.zone.detail}`);
        }
        return;
      }
      const p = groundPoint(e.clientX, e.clientY);
      if (!p || !list.length) return;
      const r = regionAt(list, p.lat, p.lon);
      const s = selRef.current;
      if (s) {
        if (r?.id === s) {
          fromMap.current = true;
          pickRef.current(Number(p.lat.toFixed(5)), Number(p.lon.toFixed(5)));
        } else showHint("Click inside the highlighted region, or choose another one below");
      } else if (r) select(r.id);
      else showHint("Only Myanmar is active");
    };
    let moveQueued = false;
    const onMove = (e: PointerEvent) => {
      if (moveQueued) return;
      const { clientX, clientY, buttons } = e;
      moveQueued = true;
      requestAnimationFrame(() => {
        moveQueued = false;
        const tip = tipRef.current;
        if (buttons) {
          if (tip) tip.style.opacity = "0";
          return;
        }
        const p = groundPoint(clientX, clientY);
        const r = p ? regionAt(list, p.lat, p.lon) : null;
        const s = selRef.current;
        const zh = zoneAt(clientX, clientY);
        dom.style.cursor = s ? (r?.id === s ? "crosshair" : "grab") : r ? "pointer" : "grab";
        const nextHover = !s && r ? r.id : null;
        if (nextHover !== hoverId) {
          hoverId = nextHover;
          applyStyle();
        }
        // district under the cursor (only when this region has boundaries)
        const dd = p && districtsOn() && r?.id === s ? regionAt(dlist, p.lat, p.lon) : null;
        const nextD = dd?.id ?? null;
        if (nextD !== dHover) {
          dHover = nextD;
          applyDistrict();
        }
        if (tip) {
          if (zh) {
            const box = el.getBoundingClientRect();
            tip.textContent = zh.cluster ? `${zh.cluster.zs.length} fields · tap to zoom in` : `${zh.zone!.title} · ${zh.zone!.detail}`;
            tip.style.transform = `translate(${clientX - box.left + 14}px, ${clientY - box.top + 14}px)`;
            tip.style.opacity = "1";
            dom.style.cursor = "pointer";
          } else if (dd) {
            const box = el.getBoundingClientRect();
            tip.textContent = `${dd.name} District`;
            tip.style.transform = `translate(${clientX - box.left + 14}px, ${clientY - box.top + 14}px)`;
            tip.style.opacity = "1";
          } else if (nextHover && r) {
            const box = el.getBoundingClientRect();
            tip.textContent = r.label;
            tip.style.transform = `translate(${clientX - box.left + 14}px, ${clientY - box.top + 14}px)`;
            tip.style.opacity = "1";
          } else tip.style.opacity = "0";
        }
      });
    };
    const onLeave = () => {
      if (tipRef.current) tipRef.current.style.opacity = "0";
      let changed = false;
      if (hoverId) { hoverId = null; changed = true; }
      if (dHover) { dHover = null; changed = true; }
      if (changed) applyStyle();
    };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerleave", onLeave);

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
      const dist = camera.position.length();
      // regroup the fields when the zoom level (or the list) changed
      const deg = cellDeg(visZones.length, dist);
      if (deg !== curDeg) {
        curDeg = deg;
        buildZones(deg);
      }
      // keep pin / labels the same size on screen at every zoom level
      const s = THREE.MathUtils.clamp(dist - 1, 0.04, 1.6);
      for (const o of scalables) o.scale.copy(o.userData.base).multiplyScalar(s);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    /* ---- load world + regions (districts load per region, later) ---- */
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

        // world basemap texture (only visible in the overview)
        const W = 4096, H = 2048;
        const cv = document.createElement("canvas");
        cv.width = W;
        cv.height = H;
        const g = cv.getContext("2d")!;
        const X = (lon: number) => ((lon + 180) / 360) * W;
        const Y = (lat: number) => ((90 - lat) / 180) * H;
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
          g.beginPath();
          for (const poly of polysOf(f.geometry))
            for (const ring of poly) {
              ring.forEach(([lon, lat], i) => (i ? g.lineTo(X(lon), Y(lat)) : g.moveTo(X(lon), Y(lat))));
              g.closePath();
            }
          g.fillStyle = COLORS.land;
          g.fill("evenodd");
          g.strokeStyle = COLORS.landLine;
          g.lineWidth = 1.2;
          g.stroke();
        }
        worldTex = new THREE.CanvasTexture(cv);
        worldTex.colorSpace = THREE.SRGBColorSpace;
        worldTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

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

        const w = el.clientWidth || 1;
        const h = el.clientHeight || 1;
        for (const r of list) {
          const fillMat = new THREE.MeshBasicMaterial({ color: COLORS.fills[0], side: THREE.DoubleSide });
          const fill = new THREE.Mesh(fillGeometry(r.polys, 1.001), fillMat);
          const lineMat = new LineMaterial({ color: 0xa6f0c4, linewidth: 1.3 });
          lineMat.resolution.set(w, h);
          lineMats.push(lineMat);
          const lines = new THREE.Group();
          for (const poly of r.polys)
            for (const ring of poly) {
              const arr: number[] = [];
              for (const [lon, lat] of ring) {
                const v = toVec3(lat, lon, 1.0015);
                arr.push(v.x, v.y, v.z);
              }
              const lg = new LineGeometry();
              lg.setPositions(arr);
              lines.add(new Line2(lg, lineMat));
            }
          const label = makeLabel(r.name, "#ffffff", 0.3, true, "rgba(19,72,34,0.92)");
          label.position.copy(toVec3(r.lat, r.lon, 1.004));
          label.visible = false;
          scene.add(fill, lines, label);
          scalables.push(label);
          robjs.set(r.id, { fill, fillMat, lines, lineMat, label });
        }
        cityObjs.forEach((c) => (c.region = regionAt(list, c.lat, c.lon)?.id ?? null));

        applyStyle();
        refreshVis();
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
      dom.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      scene.traverse((o: any) => {
        o.geometry?.dispose?.();
        const m = o.material;
        (Array.isArray(m) ? m : m ? [m] : []).forEach((x: any) => {
          x.map?.dispose?.();
          x.dispose?.();
        });
      });
      badgeCache.forEach((t) => t.dispose());
      worldTex?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  // show every farmer's field on the globe
  useEffect(() => {
    if (ready) api.current?.setZones(zones);
  }, [ready, zones]);

  // keep pin + focused region + district in sync with `value`
  useEffect(() => {
    const a = api.current;
    if (!ready || !a) return;
    a.setPin(value);
    if (!value) return;
    const rid = a.regionIdAt(value.lat, value.lon);
    if (rid && rid !== selRef.current) a.select(rid, false);
    // pick the district under the pin (works once that region's boundaries are loaded)
    a.selectDistrict(a.districtIdAt(value.lat, value.lon), false);
    if (fromMap.current) fromMap.current = false;
    else {
      a.flyTo(value.lat, value.lon, rid ? a.fitDist(rid) : 1.4);
    }
  }, [ready, value]);

  // boundaries finished loading after the pin was dropped: pick the district under it
  useEffect(() => {
    const a = api.current;
    if (!ready || !a || !value || !districts.length) return;
    a.selectDistrict(a.districtIdAt(value.lat, value.lon), false);
  }, [districts]); // eslint-disable-line react-hooks/exhaustive-deps

  // crop notes: loaded the first time each region is opened
  useEffect(() => {
    if (!sel || fitsTried.current.has(sel)) return;
    fitsTried.current.add(sel);
    const id = sel;
    fetch(fitsUrl(id))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Fits) => setFitsMap((m) => ({ ...m, [id]: j })))
      .catch(() => setFitsMap((m) => ({ ...m, [id]: "err" })));
  }, [sel]);

  const rawFits = sel ? fitsMap[sel] : undefined;
  const fits = rawFits && rawFits !== "err" ? rawFits : null;
  const fitsErr = rawFits === "err";
  const selRegion = regions.find((r) => r.id === sel) ?? null;

  const pinRegion = value ? regions.find((r) => regionAt([r], value.lat, value.lon)) : null;

  // how many fields are in each region (shown as a small number on the region buttons)
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    if (!regions.length) return m;
    for (const z of zones) {
      const r = regionAt(regions, z.lat, z.lon);
      if (r) m.set(r.id, (m.get(r.id) ?? 0) + 1);
    }
    return m;
  }, [zones, regions]);

  // district list = every district in the crop notes + every district that has a shape on the map
  const districtItems = useMemo(() => {
    const items = new Map<string, { id: string; name: string; name_my: string; hasShape: boolean; fit?: Fit }>();
    for (const f of fits?.districts ?? []) {
      const id = slug(f.name_en);
      items.set(id, { id, name: f.name_en, name_my: f.name_my ?? "", hasShape: false, fit: f });
    }
    for (const d of districts) {
      const prev = items.get(d.id);
      items.set(d.id, { id: d.id, name: d.name, name_my: d.name_my || prev?.name_my || "", hasShape: true, fit: prev?.fit });
    }
    return [...items.values()].sort((x, y) => x.name.localeCompare(y.name));
  }, [fits, districts]);

  const saItems = (fits?.self_administered_areas ?? []).map((f) => ({ id: slug(f.name_en), name: f.name_en, name_my: f.name_my ?? "", hasShape: false, fit: f }));
  const pickedDistrict = districtItems.find((d) => d.id === distSel) ?? saItems.find((d) => d.id === distSel) ?? null;
  const pickedIsSA = !!pickedDistrict && saItems.some((d) => d.id === pickedDistrict.id);

  useEffect(() => {
    districtCb.current?.(pickedDistrict ? { id: pickedDistrict.id, name: pickedDistrict.name } : null);
  }, [pickedDistrict?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mineCount = zones.filter((z) => z.mine).length;
  const otherCount = zones.length - mineCount;
  const showDistricts = ready && !!sel && (districtItems.length > 0 || fitsErr);
  const anyShape = districts.length > 0;

  return (
    <div>
      <div className="relative isolate h-80 w-full overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_50%_40%,#ffffff_0%,#f0faf0_60%,#dcf3dc_100%)] ring-1 ring-emerald-900/10 md:h-[28rem]">
        <div
          ref={host}
          className="absolute inset-0 cursor-grab"
          aria-label="3D globe of Myanmar. Choose a region to zoom in, then click inside it to place your pin."
        />
        <div
          ref={tipRef}
          className="pointer-events-none absolute left-0 top-0 z-10 rounded-lg bg-emerald-950/90 px-2.5 py-1 text-xs font-medium text-white opacity-0 transition-opacity"
        />

        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-sm text-emerald-900/60">Loading map…</div>
        )}
        {error && <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-red-600">{error}</div>}

        {hint && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
            <div className="rounded-full bg-white/95 px-4 py-2 text-center text-sm font-medium text-emerald-900 shadow-lg ring-1 ring-emerald-900/10 backdrop-blur">{hint}</div>
          </div>
        )}
      </div>

      {zones.length > 0 && (
        <div className="mt-2 text-xs text-stone-600">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-600 ring-2 ring-white" /> My plants ({mineCount})</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-800 ring-2 ring-white" /> Other farmers ({otherCount})</span>
          </p>
          {otherCount > NO_CLUSTER_BELOW ? (
            <p className="mt-1 text-stone-500">A brown circle with a number is a group of fields. Tap it to zoom in and see each field.</p>
          ) : (
            <p className="mt-1 text-stone-500">Tap a dot to see the plant.</p>
          )}
        </div>
      )}

      {/* districts + crop notes for the focused region */}
      {showDistricts && (
        <div className="mt-4 rounded-3xl bg-white p-4 ring-1 ring-[#e8dcc8]">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-extrabold text-[#2d2218]">{selRegion?.name ?? "Region"} districts ({districtItems.length})</h3>
            <span className="text-xs text-[#8a6a4c]">{anyShape ? "Tap a district on the map or pick one" : "Pick a district to see crop notes"}</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => api.current?.selectDistrict(null)}
              className={`rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition ${
                distSel === null ? "bg-[#1f7a3d] text-white ring-[#1f7a3d]" : "bg-white text-[#1f7a3d] ring-[#e8dcc8] hover:bg-[#f1f8f2]"
              }`}
            >
              All districts
            </button>
            {districtItems.map((d) => {
              const active = d.id === distSel;
              return (
                <button
                  key={d.id}
                  type="button"
                  title={d.hasShape ? d.name_my || d.name : "Not drawn on the map (boundary not in the map file yet)"}
                  onClick={() => api.current?.selectDistrict(d.id)}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium ring-1 transition ${
                    active
                      ? "bg-[#c28a3e] text-white ring-[#c28a3e]"
                      : d.hasShape
                      ? "bg-white text-[#5a3e28] ring-[#e8dcc8] hover:bg-[#faf6ef] hover:ring-[#c28a3e]/50"
                      : "border border-dashed border-[#d9c9b0] bg-white text-[#8a6a4c] ring-0 hover:bg-[#faf6ef]"
                  }`}
                >
                  {d.name}
                </button>
              );
            })}
          </div>

          {saItems.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#8a6a4c]">Self-administered areas (not districts)</p>
              <div className="flex flex-wrap gap-1.5">
                {saItems.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => api.current?.selectDistrict(d.id)}
                    className={`rounded-full px-3.5 py-2 text-sm font-medium ring-1 transition ${
                      d.id === distSel ? "bg-[#c28a3e] text-white ring-[#c28a3e]" : "border border-dashed border-[#d9c9b0] bg-white text-[#8a6a4c] ring-0 hover:bg-[#faf6ef]"
                    }`}
                  >
                    {d.name.replace(" Self-Administered Zone", "").replace(" Self-Administered Division", "")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!anyShape && districtItems.length > 0 && (
            <p className="mt-3 text-xs text-[#8a6a4c]">District boundaries for this region are not on the map yet, so these are crop notes only.</p>
          )}

          {pickedDistrict ? (
            <div className="mt-4 rounded-2xl bg-[#faf6ef] p-4 ring-1 ring-[#e8dcc8]">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h4 className="text-xl font-extrabold text-[#1f7a3d]">{pickedDistrict.name}{pickedIsSA ? "" : " District"}</h4>
                {pickedDistrict.name_my && <span className="text-base text-[#8a6a4c]">{pickedDistrict.name_my}</span>}
              </div>
              {!pickedDistrict.hasShape && anyShape && !pickedIsSA && (
                <p className="mt-2 text-sm text-[#8a6a4c]">This district is not drawn on the map yet because its boundary is not in the map file.</p>
              )}
              {pickedDistrict.fit ? (
                <dl className="mt-3 space-y-3 text-base text-[#2d2218]">
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-[#8a6a4c]">Best fit</dt>
                    <dd className="mt-0.5 font-semibold">{pickedDistrict.fit.primary_crop_fit ?? "No broad-acre crop suggested (mostly urban or built-up)"}</dd>
                  </div>
                  {pickedDistrict.fit.conditional_alternatives.length > 0 && (
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-wide text-[#8a6a4c]">Could also work</dt>
                      <dd className="mt-1 flex flex-wrap gap-1.5">
                        {pickedDistrict.fit.conditional_alternatives.map((c) => (
                          <span key={c} className="rounded-full bg-[#e7f3ea] px-3 py-1 text-sm font-semibold text-[#1f7a3d] ring-1 ring-[#1f7a3d]/20">{c}</span>
                        ))}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs font-bold uppercase tracking-wide text-[#8a6a4c]">Check first</dt>
                    <dd className="mt-0.5 text-[#6b5240]">{pickedDistrict.fit.conditions_and_caveats}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-[#8a6a4c]">{fitsErr ? "Crop notes are not available." : "No crop notes for this district yet."}</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#8a6a4c]">{fitsErr && !districtItems.length ? "Crop notes are not available for this region." : "Pick a district to see which crops usually fit there."}</p>
          )}

          {fits?.limitations && fits.limitations.length > 0 && (
            <details className="mt-3 rounded-2xl bg-[#faf6ef] px-4 py-3 ring-1 ring-[#e8dcc8]">
              <summary className="cursor-pointer text-sm font-bold text-[#5a3e28]">Notes and limits</summary>
              <ul className="mt-2 space-y-1.5">
                {fits.limitations.map((l, i) => (
                  <li key={i} className="text-sm text-[#6b5240]">ⓘ {l}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {ready && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-emerald-900">
              {regions.length} states &amp; regions
            </h3>
            <span className="text-xs text-stone-500">Pick one to zoom in</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => api.current?.select(null)}
              className={`rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition ${
                sel === null
                  ? "bg-emerald-700 text-white shadow-sm ring-emerald-700"
                  : "bg-white text-emerald-800 ring-emerald-200 hover:bg-emerald-50"
              }`}
            >
              All Myanmar
            </button>
            {regions.map((r) => {
              const active = r.id === sel;
              const n = counts.get(r.id) ?? 0;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => api.current?.select(r.id)}
                  title={`${r.label} · capital ${r.capital}${n ? ` · ${n} field(s)` : ""}`}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium ring-1 transition ${
                    active
                      ? "bg-emerald-700 text-white shadow-sm ring-emerald-700"
                      : "bg-white text-stone-700 ring-stone-300 hover:bg-emerald-50 hover:ring-emerald-300"
                  }`}
                >
                  {r.name}
                  {n > 0 && (
                    <span className={`rounded-full px-1.5 text-xs font-semibold ${active ? "bg-white/25 text-white" : "bg-amber-100 text-amber-900"}`}>
                      {n > 999 ? `${(n / 1000).toFixed(1)}k` : n}
                    </span>
                  )}
                  {pinRegion?.id === r.id && <span className="h-1.5 w-1.5 rounded-full bg-orange-600" aria-label="pin is here" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}