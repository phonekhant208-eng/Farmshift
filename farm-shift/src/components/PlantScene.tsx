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

/** The farmer's own plant: drives the 3D picture from the planting date instead of the fixed rice calendar. */
export type OwnPlant = { plant: string; plantedOn: string; totalDays?: number | null };
const isCereal = (p: string) => /rice|paddy|maize|corn|wheat|millet|sorghum|barley|sugarcane/i.test(p);
const OWN_LABEL: Record<string, string> = { plant: "Seedling", grow: "Growing", flower: "Flowering", fill: "Filling / ripening", harvest: "Ready to harvest" };

/* ------------------------------ values for one day ----------------------------- */
type Viz = {
  sky: string; heat: boolean; heavy: boolean; rainLevel: number; waterH: number;
  soil: string; root: string; dry: boolean;
  crop: "rice" | "bg" | null; g: number; leaf: string; grain: string;
  stubble: boolean; flowering: boolean; ripe: boolean;
};

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
  if (own) {
    const lastDay = a.water.series[a.water.series.length - 1].date;
    const planted = own.plantedOn > lastDay ? lastDay : own.plantedOn; // just planted: show the seedling on the latest day
    const since = daysBetween(planted, date);
    const total = own.totalDays && own.totalDays > 0 ? own.totalDays : 110;
    if (since < 0) {
      g = 0; crop = null; ownFlag = { flowering: false, ripe: false };
      stage = { id: "none", label: "Not planted yet", crop: "prep", start: date, end: date, reliability: "Assumption" };
    } else {
      g = Math.min(1, since / total);
      crop = isCereal(own.plant) ? "rice" : "bg";
      const id = g < 0.15 ? "plant" : g < 0.55 ? "grow" : g < 0.75 ? "flower" : g < 1 ? "fill" : "harvest";
      ownFlag = { flowering: id === "flower", ripe: id === "fill" || id === "harvest" };
      stage = { id, label: OWN_LABEL[id], crop: "rice", start: date, end: date, reliability: "Assumption" };
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

  const viz: Viz = {
    sky: heat ? "#fff0d0" : heavy ? "#cfdad2" : "#eef8ee",
    heat, heavy, rainLevel, waterH,
    soil: m === null ? "#a8927a" : mix("#b99572", "#5a4332", wet),
    root: mRoot === null ? "#a8927a" : mix("#b99572", "#4a3628", rootWet),
    dry,
    crop, g,
    leaf: ndvi ? ndviColor(ndvi.value) : "#c9c4b0",
    grain: stage?.id === "flower" ? "#dfe9a6" : stage?.id === "fill" ? "#cdc34a" : "#d9a521",
    stubble: !own && stage?.id === "prep",
    flowering: ownFlag ? ownFlag.flowering : stage?.id === "flower",
    ripe: ownFlag ? ownFlag.ripe : stage?.id === "fill" || stage?.id === "harvest",
  };
  return { date, stage, ndvi, age, delta, rain3, rainToday, m, mRoot, active, heat, viz };
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
    const H = 0.35 + v.g * 1.65;
    const blades = 3 + Math.round(v.g * 4);
    const bladeGeo = new THREE.ConeGeometry(0.04, 1, 4);
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
        inner.rotation.z = 0.1 + v.g * 0.35 + ((b * 13) % 3) * 0.04;
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
    const H = 0.2 + v.g * 1.0;
    const nodes = 2 + Math.round(v.g * 3);
    const stemGeo = new THREE.CylinderGeometry(0.03, 0.04, 1, 6);
    stemGeo.translate(0, 0.5, 0);
    const leafGeo = new THREE.SphereGeometry(1, 10, 8);
    const stemMat = new THREE.MeshStandardMaterial({ color: mix(v.leaf, "#3f6212", 0.35), roughness: 0.8 });
    const leafMat = new THREE.MeshStandardMaterial({ color: v.leaf, roughness: 0.6, side: THREE.DoubleSide });
    const s = 0.6 + v.g * 0.9;
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

// Roots are drawn on the cut-away front face of the soil, so the farmer can see how deep they reach.
function buildRoots(g: number): THREE.Group {
  const grp = new THREE.Group();
  if (g <= 0) return grp;
  const mat = new THREE.MeshStandardMaterial({ color: "#f1e2bd", roughness: 0.9 });
  const depth = 0.2 + g * 1.1;
  const seg = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    const dx = x1 - x0, dy = y1 - y0;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w, Math.hypot(dx, dy), 6), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    m.rotation.z = Math.atan2(-dx, dy);
    grp.add(m);
  };
  for (let i = -3; i <= 3; i++) {
    const x1 = i * 0.3 + (rnd(i + 20) - 0.5) * 0.1;
    const y1 = -depth * (0.6 + 0.4 * rnd(i + 5));
    seg(i * 0.05, 0, x1, y1, 0.035);
    const xm = (i * 0.05 + x1) / 2, ym = y1 / 2;
    seg(xm, ym, xm + 0.3 * (i >= 0 ? 1 : -1), ym - depth * 0.18, 0.02);
  }
  grp.position.z = 2.23;
  return grp;
}

/* --------------------------------- component -------------------------------- */
export default function PlantScene({ a, onDate, own }: { a: PlantHealthResult; onDate?: (d: string) => void; own?: OwnPlant }) {
  const n = a.water.series.length;
  const [idx, setIdx] = useState(() => {
    if (own) return Math.max(0, a.water.series.length - 1); // start on the latest day
    const p = a.ndvi.peak?.date;
    const i = p ? a.water.series.findIndex((s) => s.date === p) : 0;
    return Math.max(0, i);
  });
  const [playing, setPlaying] = useState(false);
  const [noGL, setNoGL] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ update: (v: Viz) => void } | null>(null);

  const d = derive(a, idx, own);
  const vizKey = d ? JSON.stringify(d.viz) : "";

  /* play the season */
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIdx((i) => { if (i >= n - 1) { setPlaying(false); return i; } return Math.min(n - 1, i + 2); }), 90);
    return () => clearInterval(t);
  }, [playing, n]);

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
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const narrow = host.clientWidth / Math.max(1, host.clientHeight) < 1.3;
    camera.position.set(6.2, 3.8, 8.4).multiplyScalar(narrow ? 1.3 : 1);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.6, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 18;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.15));
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
    sunLight.position.set(4, 8, 5);
    scene.add(sunLight);

    /* soil block: top layer + root layer */
    const surfMat = new THREE.MeshStandardMaterial({ color: "#b99572", roughness: 1 });
    const rootMat = new THREE.MeshStandardMaterial({ color: "#b99572", roughness: 1 });
    const surf = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.35, 4.4), surfMat);
    surf.position.y = -0.175;
    const rootLayer = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.2, 4.4), rootMat);
    rootLayer.position.y = -0.95;
    scene.add(surf, rootLayer);

    /* field edges (bunds) */
    const bundMat = new THREE.MeshStandardMaterial({ color: "#8a6a48", roughness: 1 });
    const bunds: [number, number, number, number][] = [[0, 2.2, 6.8, 0.2], [0, -2.2, 6.8, 0.2], [3.2, 0, 0.2, 4.4], [-3.2, 0, 0.2, 4.4]];
    for (const [x, z, w, dp] of bunds) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, dp), bundMat);
      b.position.set(x, 0.09, z);
      scene.add(b);
    }

    /* soft shadow under the block */
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(5.6, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.6;
    scene.add(shadow);

    /* dry cracks */
    const cracks = new THREE.Group();
    const crackMat = new THREE.MeshBasicMaterial({ color: "#3f2d20" });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.5 + rnd(i) * 0.5, 0.01, 0.035), crackMat);
      c.position.set((rnd(i + 11) - 0.5) * 5.6, 0.006, (rnd(i + 31) - 0.5) * 3.6);
      c.rotation.y = rnd(i + 51) * Math.PI;
      cracks.add(c);
    }
    cracks.visible = false;
    scene.add(cracks);

    /* standing water */
    const waterMat = new THREE.MeshStandardMaterial({ color: "#38bdf8", transparent: true, opacity: 0.5, roughness: 0.2 });
    const water = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1, 4.2), waterMat);
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
      surfMat.color.set(v.soil);
      rootMat.color.set(v.root);
      cracks.visible = v.dry;

      water.visible = v.waterH > 0.02;
      water.scale.y = Math.max(0.001, v.waterH);
      water.position.y = v.waterH / 2;

      sunMat.color.set(v.heat ? "#ef4444" : "#fbbf24");
      sunMat.opacity = v.heavy && !v.heat ? 0.35 : 1;
      glow.visible = v.heat;

      cloud.visible = v.rainLevel > 0;
      cloudMat.color.set(v.heavy ? "#64748b" : "#94a3b8");
      rain.visible = v.rainLevel > 0;
      rainGeo.setDrawRange(0, Math.round(v.rainLevel * DROPS) * 2);

      const key = JSON.stringify([v.crop, v.g.toFixed(2), v.leaf, v.stubble, v.flowering, v.ripe, v.grain]);
      if (key !== plantKey) {
        plantKey = key;
        for (const c of [...plantHolder.children]) { plantHolder.remove(c); disposeTree(c); }
        plantHolder.add(buildPlants(v));
        if (v.crop) plantHolder.add(buildRoots(v.g));
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
  const { stage, ndvi, age, delta, rain3, rainToday, m, mRoot, active, heat, viz } = d;
  const series = a.water.series;
  const soilWord = m === null ? "Unknown" : m >= 0.15 ? "Enough water" : m >= 0.11 ? "Getting dry" : "Too dry";
  const soilTone = m === null ? "text-stone-600" : m >= 0.15 ? "text-emerald-700" : m >= 0.11 ? "text-amber-700" : "text-red-700";
  const trend = delta === null ? "" : Math.abs(delta) < 0.02 ? "about the same as before" : delta > 0 ? "greener than the last reading" : "less green than the last reading";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-stone-900">Your field on {shortDate(d.date)}</h3>
          <p className="text-sm text-stone-500">
            {stage ? stage.label : "Outside the crop calendar"}{own ? ` · ${own.plant}` : viz.crop === "rice" ? " · rice" : viz.crop === "bg" ? " · black gram" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {active.length === 0 && <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">No problems today</span>}
          {[...new Set(active.map((x) => x.kind))].map((k) => (
            <span key={k} className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${CHIP[k].cls}`}>{CHIP[k].text}</span>
          ))}
        </div>
      </div>

      {/* 3D field */}
      <div className="relative overflow-hidden rounded-3xl ring-1 ring-emerald-900/10">
        <div ref={mountRef} className="h-[320px] w-full touch-none sm:h-[420px]" aria-label={`3D picture of your field on ${d.date}`} role="img" />
        {noGL && (
          <div className="absolute inset-0 grid place-items-center bg-stone-100 px-6 text-center text-sm text-stone-500">
            The 3D view doesn’t work on this device. The numbers below still show how your field is doing.
          </div>
        )}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
          <span className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold text-stone-800 shadow-sm ring-1 ring-stone-200">Rain, last 3 days: {rain3 === null ? "—" : `${rain3.toFixed(0)} mm`}</span>
          <span className={`rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold shadow-sm ring-1 ring-stone-200 ${soilTone}`}>Soil: {soilWord}</span>
        </div>
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-stone-600">Drag to turn · scroll to zoom</span>
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-stone-600">Roots shown on the cut side</span>
      </div>

      {/* season slider */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => { if (idx >= n - 1) setIdx(0); setPlaying((p) => !p); }}
          className="shrink-0 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-800"
          aria-label={playing ? "Pause" : "Play season"}
        >
          {playing ? "❚❚ Pause" : "▶ Play season"}
        </button>
        <input
          type="range" min={0} max={n - 1} value={idx}
          onChange={(e) => { setPlaying(false); setIdx(parseInt(e.target.value, 10)); }}
          className="h-2 w-full accent-emerald-700" aria-label="Pick a date in the season"
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-stone-500"><span>{shortDate(series[0].date)}</span><span>{shortDate(series[n - 1].date)}</span></div>

      {!own && <div className="mt-2 flex flex-wrap gap-2">
        {a.stages.filter((s) => s.id !== "grow" && s.id !== "fill" && series.some((p) => p.date === s.start)).map((s) => (
          <button
            key={s.id}
            onClick={() => { setPlaying(false); setIdx(series.findIndex((p) => p.date === s.start)); }}
            className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ${stage?.id === s.id ? "bg-emerald-700 text-white ring-emerald-700" : "bg-white text-stone-700 ring-stone-300 hover:bg-emerald-50"}`}
          >
            {s.label}
          </button>
        ))}
      </div>}

      {/* plain-language readout */}
      <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
          <dt className="text-sm font-medium text-stone-500">Plant colour</dt>
          <dd className="mt-1 flex items-center gap-2 text-lg font-semibold text-stone-900">
            <span className="inline-block h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: viz.leaf }} />{greenWord(ndvi ? ndvi.value : null)}
          </dd>
          <dd className="text-sm text-stone-500">
            {ndvi ? `Satellite reading ${age === 0 ? "today" : `${age} day(s) ago`}${trend ? ` · ${trend}` : ""}` : "No satellite reading yet"}
          </dd>
        </div>
        <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
          <dt className="text-sm font-medium text-stone-500">Water in the soil</dt>
          <dd className={`mt-1 text-xl font-bold ${soilTone}`}>{soilWord}</dd>
          <dd className="text-sm text-stone-500">top {fmt(m)} · roots {fmt(mRoot)}</dd>
        </div>
        <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
          <dt className="text-sm font-medium text-stone-500">Rain</dt>
          <dd className="mt-1 text-xl font-bold text-stone-900">{rainToday === null ? "—" : `${rainToday.toFixed(0)} mm today`}</dd>
          <dd className="text-sm text-stone-500">{rain3 === null ? "3-day total not known" : `${rain3.toFixed(0)} mm in the last 3 days`}</dd>
        </div>
        <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
          <dt className="text-sm font-medium text-stone-500">Heat</dt>
          <dd className="mt-1 text-xl font-bold text-stone-900">{heat ? "Very hot today" : a.layers.temperature ? "No heat problem" : "Unknown"}</dd>
          <dd className="text-sm text-stone-500">{a.layers.temperature ? "Heat only matters during flowering" : "No temperature data"}</dd>
        </div>
      </dl>


    </div>
  );
}