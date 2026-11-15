"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CropStage, PlantHealthResult, StressKind } from "@/types/plantHealth";
import { shortDate } from "@/lib/format";

/* ------------------------------- colour helpers ------------------------------ */
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b), k = Math.max(0, Math.min(1, t));
  return toHex(x.map((v, i) => v + (y[i] - v) * k));
};
// Greenness colour scale. Colour only — NOT a health verdict.
const STOPS: [number, string][] = [[0.1, "#c2a645"], [0.35, "#9bbf45"], [0.6, "#3f9d3a"], [0.85, "#1d6b2b"]];
function ndviColor(v: number) {
  if (v <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) return mix(STOPS[i - 1][1], STOPS[i][1], (v - STOPS[i - 1][0]) / (STOPS[i][0] - STOPS[i - 1][0]));
  }
  return STOPS[STOPS.length - 1][1];
}

const DAY = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
const dayWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const fmt = (v: number | null | undefined, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");
const rnd = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const CHIP: Record<StressKind, { text: string; cls: string }> = {
  heat: { text: "Very hot", cls: "bg-red-50 text-red-700 ring-red-200" },
  warm_night: { text: "Warm night", cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  flood: { text: "Flood risk", cls: "bg-blue-50 text-blue-800 ring-blue-200" },
  heavy_rain: { text: "Heavy rain", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  harvest_rain: { text: "Rain at harvest", cls: "bg-teal-50 text-teal-700 ring-teal-200" },
  dry_soil: { text: "Soil too dry", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
};

/* growth 0..1 inside each stage */
const GROWTH: Record<string, [number, number]> = {
  plant: [0.1, 0.3], grow: [0.3, 0.8], flower: [0.85, 1], fill: [1, 1], harvest: [1, 1], prep: [0, 0], sow: [0.15, 0.55],
};

const greenWord = (v: number | null) => (v === null ? "No reading" : v >= 0.6 ? "Very green" : v >= 0.4 ? "Green" : v >= 0.25 ? "Light green" : "Pale / bare");

/** The farmer's own plant: drives the 3D picture from the planting date (and harvest date) instead of the fixed rice calendar. */
export type OwnPlant = { plant: string; plantedOn: string; totalDays?: number | null; harvestedOn?: string | null };
const isCereal = (p: string) => /rice|paddy|maize|corn|wheat|millet|sorghum|barley|sugarcane/i.test(p);
const OWN_LABEL: Record<string, string> = { plant: "Seedling", grow: "Growing", flower: "Flowering", fill: "Filling / ripening", harvest: "Ready to harvest" };

/* ------------------------------ values for one day ----------------------------- */
type Viz = {
  sky: string; heat: boolean; heavy: boolean; rainLevel: number; waterH: number;
  soil: string; root: string; dry: boolean;
  crop: "rice" | "bg" | null; g: number; leaf: string; grain: string;
  stubble: boolean; flowering: boolean; ripe: boolean; seeds: boolean;
};

type OwnInfo = { since: number; total: number; harvested: boolean };

function derive(a: PlantHealthResult, idx: number, own?: OwnPlant) {
  const series = a.water.series;
  const n = series.length;
  if (!n) return null;
  const i = Math.min(Math.max(0, idx), n - 1);
  const day = series[i];
  const date = day.date;

  let stage: CropStage | null = a.stages.find((s) => s.start <= date && s.end >= date) ?? null;
  const obs = a.ndvi.observations;
  let oi = -1;
  obs.forEach((o, k) => { if (o.date <= date) oi = k; });
  const ndvi = oi >= 0 ? obs[oi] : null;
  const prev = oi > 0 ? obs[oi - 1] : null;
  const age = ndvi ? daysBetween(ndvi.date, date) : null;
  const delta = ndvi && prev ? ndvi.value - prev.value : null;

  const last3 = [series[i - 2], series[i - 1], series[i]];
  const rain3 = i >= 2 && last3.every((s) => s && s.rain !== null) ? last3.reduce((t, s) => t + (s.rain as number), 0) : null;
  const rainToday = day.rain;
  // What the farmer reads: if today's rain is not in yet (data lags a few days), use the latest day we do have
  let ri = i;
  while (ri > 0 && series[ri].rain === null) ri--;
  const rainRead = series[ri].rain;
  const rainReadDate = rainRead !== null && ri !== i ? series[ri].date : null;
  const rl = [series[ri - 2], series[ri - 1], series[ri]];
  const rain3Read = ri >= 2 && rl.every((x) => x && x.rain !== null) ? rl.reduce((t, x) => t + (x.rain as number), 0) : null;
  const snap = a.water.soil.mode === "snapshot" ? a.water.soil : null;
  const m = day.surface ?? snap?.latestSurface ?? null;
  const mRoot = day.root ?? snap?.latestRoot ?? null;
  const active = a.markers.filter((k) => k.start <= date && k.end >= date);
  const has = (k: StressKind) => active.some((x) => x.kind === k);

  let g = 0;
  if (stage) {
    const [g0, g1] = GROWTH[stage.id] ?? [0, 0];
    const span = Math.max(1, daysBetween(stage.start, stage.end));
    g = g0 + (g1 - g0) * Math.min(1, daysBetween(stage.start, date) / span);
  }
  let crop: "rice" | "bg" | null = stage?.crop === "rice" ? "rice" : stage?.crop === "black_gram" ? "bg" : null;
  let ownFlag: { flowering: boolean; ripe: boolean } | null = null;
  let ownInfo: OwnInfo | null = null;
  let ownPlanted: string | null = null;
  let seeds = false;
  if (own) {
    // Count from the REAL planting date to the harvest date (or today). NASA data lags a few days,
    // so the last satellite day must not be used as the planting day.
    const today = new Date().toISOString().slice(0, 10);
    const planted = own.plantedOn.slice(0, 10);
    const ended = own.harvestedOn ? own.harvestedOn.slice(0, 10) : null;
    ownPlanted = planted;
    const viewDate = ended ?? today;
    const since = daysBetween(planted, viewDate);
    const total = own.totalDays && own.totalDays > 0 ? own.totalDays : 110;
    const harvested = !!ended;
    if (since < 0) {
      g = 0; crop = null; ownFlag = { flowering: false, ripe: false };
      stage = { id: "none", label: "Not planted yet", crop: "prep", start: date, end: date, reliability: "Assumption" };
    } else {
      g = Math.min(1, since / total);
      const germ = isCereal(own.plant) ? 4 : 5; // days before the first sprout shows
      if (since < germ) {
        // Real status: seeds are in the soil, nothing is green yet
        crop = null; seeds = true; ownFlag = { flowering: false, ripe: false };
        stage = { id: "seed", label: harvested ? "Harvested" : "Just planted · seeds in the soil", crop: "prep", start: date, end: date, reliability: "Assumption" };
      } else {
        crop = isCereal(own.plant) ? "rice" : "bg";
        const id = g < 0.15 ? "plant" : g < 0.55 ? "grow" : g < 0.75 ? "flower" : g < 1 ? "fill" : "harvest";
        ownFlag = { flowering: id === "flower", ripe: id === "fill" || id === "harvest" };
        stage = { id, label: harvested ? "Harvested" : OWN_LABEL[id], crop: "rice", start: date, end: date, reliability: "Assumption" };
      }
      ownInfo = { since, total, harvested };
    }
  }
  const flood = has("flood");
  const heat = has("heat");
  const heavy = has("heavy_rain") || flood || (rainToday ?? 0) >= 50;
  const rainLevel = heavy ? 1 : (rainToday ?? 0) >= 10 ? 0.55 : (rainToday ?? 0) > 0.5 ? 0.25 : 0;
  const waterH = rain3 === null ? (flood ? 0.5 : 0) : Math.max(flood ? 0.5 : 0, Math.min(0.8, (rain3 / 200) * 0.5));
  const dry = m !== null && m < 0.11;
  const wet = m === null ? 0.35 : Math.max(0, Math.min(1, m / 0.4));
  const rootWet = mRoot === null ? 0.35 : Math.max(0, Math.min(1, mRoot / 0.4));

  // For the farmer's own plant, ignore satellite readings from before planting (they show bare soil)
  const useNdvi = !!ndvi && (!ownPlanted || ndvi.date >= ownPlanted);

  const viz: Viz = {
    sky: heat ? "#fff0d0" : heavy ? "#cfdad2" : "#eef8ee",
    heat, heavy, rainLevel, waterH,
    soil: m === null ? "#a8927a" : mix("#b99572", "#5a4332", wet),
    root: mRoot === null ? "#a8927a" : mix("#b99572", "#4a3628", rootWet),
    dry,
    crop, g,
    leaf: own
      ? (g < 0.2 ? mix("#a6d95a", "#5aa83c", g / 0.2) : useNdvi && ndvi ? ndviColor(ndvi.value) : ndviColor(0.25 + 0.5 * g))
      : ndvi ? ndviColor(ndvi.value) : "#c9c4b0",
    grain: stage?.id === "flower" ? "#dfe9a6" : stage?.id === "fill" ? "#cdc34a" : "#d9a521",
    stubble: !own && stage?.id === "prep",
    flowering: ownFlag ? ownFlag.flowering : stage?.id === "flower",
    ripe: ownFlag ? ownFlag.ripe : stage?.id === "fill" || stage?.id === "harvest",
    seeds,
  };
  return { date, stage, ndvi, age, delta, rain3, rainToday, rainRead, rainReadDate, rain3Read, m, mRoot, active, heat, viz, ownInfo };
}

/* ------------------------------- three.js helpers ----------------------------- */
function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

const POS_RICE: [number, number][] = [];
for (const z of [-1.3, 0, 1.6]) for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) POS_RICE.push([x, z]);
const POS_BG: [number, number][] = [];
for (const z of [-1.2, 0.4, 1.7]) for (const x of [-2.2, -0.75, 0.75, 2.2]) POS_BG.push([x, z]);

function buildPlants(v: Viz): THREE.Group {
  const grp = new THREE.Group();
  if (v.crop === "rice") {
    const H = 0.06 + v.g * 1.9;
    const blades = 2 + Math.round(v.g * 5);
    const bladeGeo = new THREE.ConeGeometry(0.015 + v.g * 0.03, 1, 4);
    bladeGeo.translate(0, 0.5, 0);
    const leafMat = new THREE.MeshStandardMaterial({ color: v.leaf, roughness: 0.7, flatShading: true });
    const grainMat = new THREE.MeshStandardMaterial({ color: v.grain, roughness: 0.6 });
    const grainGeo = new THREE.SphereGeometry(1, 8, 6);
    POS_RICE.forEach(([x, z], hi) => {
      const hill = new THREE.Group();
      hill.position.set(x, 0, z);
      hill.userData.sway = hi;
      for (let b = 0; b < blades; b++) {
        const pivot = new THREE.Group();
        pivot.rotation.y = (b / blades) * Math.PI * 2 + hi * 0.7;
        const inner = new THREE.Group();
        inner.rotation.z = 0.05 + v.g * 0.4 + ((b * 13) % 3) * 0.04;
        const h = H * (0.8 + 0.2 * (((b * 37) % 5) / 4));
        const blade = new THREE.Mesh(bladeGeo, leafMat);
        blade.scale.set(1, h, 1);
        inner.add(blade);
        if ((v.flowering || v.ripe) && b < 3) {
          const p = new THREE.Mesh(grainGeo, grainMat);
          p.scale.set(0.06, 0.22, 0.06);
          p.position.set(0.05, h - 0.1, 0);
          p.rotation.z = -0.5;
          inner.add(p);
        }
        pivot.add(inner);
        hill.add(pivot);
      }
      grp.add(hill);
    });
  } else if (v.crop === "bg") {
    const H = 0.05 + v.g * 1.1;
    const nodes = 1 + Math.round(v.g * 3);
    const stemGeo = new THREE.CylinderGeometry(0.03, 0.04, 1, 6);
    stemGeo.translate(0, 0.5, 0);
    const leafGeo = new THREE.SphereGeometry(1, 10, 8);
    const stemMat = new THREE.MeshStandardMaterial({ color: mix(v.leaf, "#3f6212", 0.35), roughness: 0.8 });
    const leafMat = new THREE.MeshStandardMaterial({ color: v.leaf, roughness: 0.6, side: THREE.DoubleSide });
    const s = 0.25 + v.g * 1.25;
    POS_BG.forEach(([x, z], pi) => {
      const plant = new THREE.Group();
      plant.position.set(x, 0, z);
      plant.userData.sway = pi;
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.scale.set(1, H, 1);
      plant.add(stem);
      for (let k = 0; k < nodes; k++) {
        const node = new THREE.Group();
        node.position.y = (H * (k + 1)) / (nodes + 1);
        node.rotation.y = k * 2.1 + pi;
        const spots: [number, number, number][] = [[0.18, 0, 0.12], [0.18, 0, -0.12], [0.38, 0.05, 0]];
        for (const [lx, ly, lz] of spots) {
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          leaf.scale.set(0.2 * s, 0.03, 0.13 * s);
          leaf.position.set(lx * s, ly, lz * s);
          leaf.rotation.z = 0.25;
          node.add(leaf);
        }
        plant.add(node);
      }
      const top = new THREE.Mesh(leafGeo, leafMat);
      top.scale.set(0.14 * s, 0.03, 0.1 * s);
      top.position.y = H;
      plant.add(top);
      grp.add(plant);
    });
  } else if (v.seeds) {
    const geo = new THREE.SphereGeometry(0.035, 6, 4);
    const mat = new THREE.MeshStandardMaterial({ color: "#5b4636", roughness: 1 });
    const sg = new THREE.Group();
    sg.userData.noSway = true;
    for (const z of [-1.3, 0, 1.6]) for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x + (rnd(x * 7 + z * 3 + k) - 0.5) * 0.3, 0.015, z + (rnd(x * 5 + z * 11 + k + 40) - 0.5) * 0.3);
      m.scale.y = 0.6;
      sg.add(m);
    }
    grp.add(sg);
  } else if (v.stubble) {
    const geo = new THREE.CylinderGeometry(0.02, 0.03, 1, 5);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: "#a16207", roughness: 0.9 });
    const sg = new THREE.Group();
    sg.userData.noSway = true;
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set((rnd(i) - 0.5) * 5.8, 0, (rnd(i + 99) - 0.5) * 3.8);
      m.scale.y = 0.15 + rnd(i + 7) * 0.15;
      m.rotation.z = (rnd(i + 3) - 0.5) * 0.3;
      sg.add(m);
    }
    grp.add(sg);
  }
  return grp;
}

/* --------------------------------- component -------------------------------- */
function Tile({ label, value, sub, valueCls = "text-[#2d2218]", dot }: { label: string; value: string; sub?: string; valueCls?: string; dot?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e8dcc8]">
      <dt className="text-xs font-bold uppercase tracking-wide text-[#8a6a4c]">{label}</dt>
      <dd className={`mt-1.5 flex items-center gap-2 text-xl font-extrabold leading-tight ${valueCls}`}>
        {dot && <span className="inline-block h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: dot }} />}
        {value}
      </dd>
      {sub && <dd className="mt-0.5 text-sm text-[#8a6a4c]">{sub}</dd>}
    </div>
  );
}

export default function PlantScene({ a, onDate, own }: { a: PlantHealthResult; onDate?: (d: string) => void; own?: OwnPlant }) {
  const n = a.water.series.length;
  // Own plant: the weather of the harvest day (harvested) or the latest day (growing).
  const idx = (() => {
    if (own) {
      const e = own.harvestedOn ? own.harvestedOn.slice(0, 10) : null;
      if (e) {
        let k = -1;
        a.water.series.forEach((s, j) => { if (s.date <= e) k = j; });
        if (k >= 0) return k;
      }
      return Math.max(0, n - 1);
    }
    const p = a.ndvi.peak?.date;
    const i = p ? a.water.series.findIndex((s) => s.date === p) : 0;
    return Math.max(0, i);
  })();
  const [noGL, setNoGL] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ update: (v: Viz) => void } | null>(null);

  const d = derive(a, idx, own);
  const vizKey = d ? JSON.stringify(d.viz) : "";

  const date = d?.date;
  useEffect(() => { if (date && onDate) onDate(date); }, [date, onDate]);

  /* build the 3D scene once */
  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setNoGL(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d9eefc");
    scene.fog = new THREE.Fog("#d9eefc", 18, 42);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const narrow = host.clientWidth / Math.max(1, host.clientHeight) < 1.3;
    camera.position.set(5.5, 2.6, 8.2).multiplyScalar(narrow ? 1.3 : 1);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.7, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 16;
    controls.minPolarAngle = 0.6;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.15));
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
    sunLight.position.set(4, 8, 5);
    scene.add(sunLight);

    /* open land: grass all around, flat ploughed field in the middle (no soil block) */
    const grass = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: "#7fb069", roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    scene.add(grass);

    const surfMat = new THREE.MeshStandardMaterial({ color: "#b99572", roughness: 1 });
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 5), surfMat);
    surf.rotation.x = -Math.PI / 2;
    surf.position.y = 0;
    scene.add(surf);

    /* furrow lines so it reads as a ploughed field */
    const furrowMat = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.12 });
    for (let k = -5; k <= 5; k++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.06), furrowMat);
      f.rotation.x = -Math.PI / 2;
      f.position.set(0, 0.004, k * 0.45);
      scene.add(f);
    }

    /* low hills and a few trees in the distance */
    const hillMat = new THREE.MeshStandardMaterial({ color: "#6a994e", roughness: 1, flatShading: true });
    const hills: [number, number, number, number][] = [[-14, -22, 7, 3.2], [-4, -26, 9, 4], [10, -24, 8, 3.4], [20, -18, 6, 2.6]];
    for (const [x, z, r, h] of hills) {
      const hm = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), hillMat);
      hm.scale.y = h / r;
      hm.position.set(x, -0.1, z);
      scene.add(hm);
    }
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#7c5a3a", roughness: 1 });
    const crownMat = new THREE.MeshStandardMaterial({ color: "#3f7d3a", roughness: 1, flatShading: true });
    const trees: [number, number][] = [[-6.5, -4.5], [6.8, -4.2], [-7.5, 3.5], [7.6, 4], [-5, -7], [4.5, -7.5]];
    for (const [x, z] of trees) {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1, 6), trunkMat);
      tr.position.set(x, 0.5, z);
      const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), crownMat);
      cr.position.set(x, 1.4, z);
      scene.add(tr, cr);
    }

    /* dry cracks */
    const cracks = new THREE.Group();
    const crackMat = new THREE.MeshBasicMaterial({ color: "#3f2d20" });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.5 + rnd(i) * 0.5, 0.01, 0.035), crackMat);
      c.position.set((rnd(i + 11) - 0.5) * 5.6, 0.012, (rnd(i + 31) - 0.5) * 3.6);
      c.rotation.y = rnd(i + 51) * Math.PI;
      cracks.add(c);
    }
    cracks.visible = false;
    scene.add(cracks);

    /* standing water */
    const waterMat = new THREE.MeshStandardMaterial({ color: "#38bdf8", transparent: true, opacity: 0.5, roughness: 0.2 });
    const water = new THREE.Mesh(new THREE.BoxGeometry(7.0, 1, 4.8), waterMat);
    water.visible = false;
    scene.add(water);

    /* sun + glow */
    const sunMat = new THREE.MeshBasicMaterial({ color: "#fbbf24", transparent: true });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), sunMat);
    sun.position.set(4.4, 4.3, -2.6);
    const glowMat = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.25 });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 16), glowMat);
    glow.position.copy(sun.position);
    glow.visible = false;
    scene.add(sun, glow);

    /* cloud */
    const cloud = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 1 });
    const blobs: [number, number, number, number][] = [[0, 0, 0, 0.7], [0.8, -0.1, 0.1, 0.55], [-0.8, -0.1, 0, 0.55], [0.3, 0.3, -0.1, 0.5], [-0.35, 0.25, 0.1, 0.45]];
    for (const [x, y, z, r] of blobs) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), cloudMat);
      s.position.set(x, y, z);
      cloud.add(s);
    }
    cloud.position.set(-0.5, 4.5, 0);
    cloud.visible = false;
    scene.add(cloud);

    /* rain streaks */
    const DROPS = 160;
    const rx = new Float32Array(DROPS), rz = new Float32Array(DROPS), ry = new Float32Array(DROPS), rv = new Float32Array(DROPS);
    for (let i = 0; i < DROPS; i++) { rx[i] = (rnd(i) - 0.5) * 6.2; rz[i] = (rnd(i + 70) - 0.5) * 4.2; ry[i] = rnd(i + 140) * 4.4; rv[i] = 5 + rnd(i + 210) * 3; }
    const rainPos = new Float32Array(DROPS * 6);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: "#38bdf8", transparent: true, opacity: 0.8 }));
    rain.frustumCulled = false;
    rain.visible = false;
    scene.add(rain);

    /* plants + roots (rebuilt when the growth picture changes) */
    const plantHolder = new THREE.Group();
    scene.add(plantHolder);
    let plantKey = "";

    const update = (v: Viz) => {
      (scene.background as THREE.Color).set(v.sky);
      if (scene.fog) (scene.fog as THREE.Fog).color.set(v.sky);
      surfMat.color.set(v.soil);
      cracks.visible = v.dry;

      water.visible = v.waterH > 0.02;
      const wh = Math.max(0.001, v.waterH * 0.25); // a thin sheet of water, not a block
      water.scale.y = wh;
      water.position.y = wh / 2;

      sunMat.color.set(v.heat ? "#ef4444" : "#fbbf24");
      sunMat.opacity = v.heavy && !v.heat ? 0.35 : 1;
      glow.visible = v.heat;

      cloud.visible = v.rainLevel > 0;
      cloudMat.color.set(v.heavy ? "#64748b" : "#94a3b8");
      rain.visible = v.rainLevel > 0;
      rainGeo.setDrawRange(0, Math.round(v.rainLevel * DROPS) * 2);

      const key = JSON.stringify([v.crop, v.g.toFixed(3), v.leaf, v.stubble, v.seeds, v.flowering, v.ripe, v.grain]);
      if (key !== plantKey) {
        plantKey = key;
        for (const c of [...plantHolder.children]) { plantHolder.remove(c); disposeTree(c); }
        plantHolder.add(buildPlants(v));
      }
    };
    apiRef.current = { update };

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0, last = performance.now(), t = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      controls.update();
      if (rain.visible) {
        for (let i = 0; i < DROPS; i++) {
          ry[i] -= rv[i] * dt;
          if (ry[i] < 0.05) ry[i] = 4.4;
          const o = i * 6;
          rainPos[o] = rx[i]; rainPos[o + 1] = ry[i]; rainPos[o + 2] = rz[i];
          rainPos[o + 3] = rx[i] - 0.03; rainPos[o + 4] = ry[i] + 0.22; rainPos[o + 5] = rz[i];
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      const field = plantHolder.children[0];
      if (field) for (const c of field.children) {
        if (typeof c.userData.sway === "number") {
          c.rotation.z = Math.sin(t * 1.3 + c.userData.sway) * 0.015;
          c.rotation.x = Math.cos(t * 1.1 + c.userData.sway) * 0.012;
        }
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    // push the first picture right away (the values effect may have run before the scene existed)
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposeTree(scene);
      renderer.dispose();
      renderer.domElement.remove();
      apiRef.current = null;
    };
  }, []);

  /* push the day's values into the scene */
  useEffect(() => {
    if (d) apiRef.current?.update(d.viz);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vizKey]);

  if (!d) return null;
  const { stage, ndvi, age, delta, rain3, rainToday, rainRead, rainReadDate, rain3Read, m, mRoot, active, heat, viz, ownInfo } = d;
  const soilWord = m === null ? "Unknown" : m >= 0.15 ? "Enough water" : m >= 0.11 ? "Getting dry" : "Too dry";
  const soilTone = m === null ? "text-[#6b5240]" : m >= 0.15 ? "text-[#1f7a3d]" : m >= 0.11 ? "text-amber-700" : "text-red-700";
  const trend = delta === null ? "" : Math.abs(delta) < 0.02 ? "about the same as before" : delta > 0 ? "greener than the last reading" : "less green than the last reading";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-lg font-extrabold text-[#2d2218]">
            {own ? (ownInfo?.harvested ? "Your field on harvest day" : "Your field now") : `Your field on ${shortDate(d.date)}`}
          </h4>
          <p className="text-sm text-[#8a6a4c]">
            {stage ? stage.label : "Outside the crop calendar"}{ownInfo ? ` · day ${ownInfo.since}` : ""}{own ? ` · ${own.plant}` : viz.crop === "rice" ? " · rice" : viz.crop === "bg" ? " · black gram" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {active.length === 0 && <span className="rounded-full bg-[#e7f3ea] px-3 py-1 text-sm font-semibold text-[#1f7a3d] ring-1 ring-[#1f7a3d]/25">All good</span>}
          {[...new Set(active.map((x) => x.kind))].map((k) => (
            <span key={k} className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${CHIP[k].cls}`}>{CHIP[k].text}</span>
          ))}
        </div>
      </div>

      {/* harvest verdict */}
      {own && ownInfo?.harvested && (() => {
        const r = ownInfo.since / ownInfo.total;
        const bad = r < 0.6, mid = r >= 0.6 && r < 0.9;
        const cls = bad ? "bg-red-50 text-red-800 ring-red-200" : mid ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-[#e7f3ea] text-[#1f7a3d] ring-[#1f7a3d]/25";
        const msg = bad ? "Harvested too early, so the harvest was not good."
          : mid ? "Harvested a little early, so you may get less than usual."
          : "Harvested at a good time.";
        return (
          <p className={`mb-3 rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ${cls}`}>
            Your plant grew only {dayWord(ownInfo.since)}. {own.plant} usually needs about {ownInfo.total} days. {msg}
          </p>
        );
      })()}

      {/* 3D field */}
      <div className="relative overflow-hidden rounded-3xl ring-1 ring-[#e8dcc8]">
        <div ref={mountRef} className="h-[320px] w-full touch-none sm:h-[420px]" aria-label={`3D picture of your field on ${d.date}`} role="img" />
        {noGL && (
          <div className="absolute inset-0 grid place-items-center bg-[#f3ece0] px-6 text-center text-sm text-[#8a6a4c]">
            The 3D view doesn’t work on this device. The numbers below still show how your field is doing.
          </div>
        )}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
          {(own ? rain3Read : rain3) !== null && <span className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold text-[#2d2218] shadow-sm ring-1 ring-[#e8dcc8]">Rain, last 3 days: {((own ? rain3Read : rain3) as number).toFixed(0)} mm</span>}
          <span className={`rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold shadow-sm ring-1 ring-[#e8dcc8] ${soilTone}`}>Soil: {soilWord}</span>
        </div>
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#6b5240]">Drag to turn the picture</span>
      </div>

      {/* plain-language readout */}
      {own ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile
            label="Your plant"
            value={stage ? stage.label.replace(" · seeds in the soil", "") : "—"}
            dot={viz.crop ? viz.leaf : undefined}
            sub={ownInfo ? `${dayWord(ownInfo.since)} old (usual about ${ownInfo.total})` : "Not planted yet"}
          />
          <Tile
            label="Water in the soil"
            value={soilWord}
            valueCls={soilTone}
            sub={m === null ? "No information" : m >= 0.15 ? "Good for your plant" : m >= 0.11 ? "Water soon" : "Your field needs water"}
          />
          <Tile
            label="Rain"
            value={rainRead === null || rainRead < 0.5 ? "No rain" : `${rainRead.toFixed(0)} mm`}
            sub={rainRead === null ? "No rain recently" : rainReadDate ? `Latest reading ${shortDate(rainReadDate)}` : rain3Read === null ? "" : rain3Read < 1 ? "No rain in the last 3 days" : `${rain3Read.toFixed(0)} mm in the last 3 days`}
          />
          <Tile label="Heat" value={heat ? "Very hot" : "Not too hot"} sub={heat ? "Hot days can hurt flowers" : ""} />
        </dl>
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile
            label="Plant colour"
            value={greenWord(ndvi ? ndvi.value : null)}
            dot={viz.leaf}
            sub={ndvi ? `Satellite reading ${age === 0 ? "today" : `${age} day(s) ago`}${trend ? ` · ${trend}` : ""}` : "No satellite reading yet"}
          />
          <Tile label="Water in the soil" value={soilWord} valueCls={soilTone} sub={`top ${fmt(m)} · roots ${fmt(mRoot)}`} />
          <Tile
            label="Rain"
            value={rainToday === null ? "—" : `${rainToday.toFixed(0)} mm today`}
            sub={rain3 === null ? "3-day total not known" : `${rain3.toFixed(0)} mm in the last 3 days`}
          />
          <Tile
            label="Heat"
            value={heat ? "Very hot today" : a.layers.temperature ? "No heat problem" : "Unknown"}
            sub={a.layers.temperature ? "Heat only matters during flowering" : "No temperature data"}
          />
        </dl>
      )}
    </div>
  );
}