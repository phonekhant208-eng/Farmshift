"use client";
import { useEffect, useState } from "react";
import type { PlantHealthResult, StressKind } from "@/types/plantHealth";
import { shortDate } from "@/lib/format";

/* ------------------------------- colour helpers ------------------------------ */
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b), k = Math.max(0, Math.min(1, t));
  return toHex(x.map((v, i) => v + (y[i] - v) * k));
};
// Continuous greenness scale. Colour only — it is NOT a health verdict.
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

const CHIP: Record<StressKind, { text: string; cls: string }> = {
  heat: { text: "Heat ≥ 35°C", cls: "bg-red-50 text-red-700 ring-red-200" },
  warm_night: { text: "Warm night ≥ 27°C", cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  flood: { text: "Flood risk", cls: "bg-blue-50 text-blue-800 ring-blue-200" },
  heavy_rain: { text: "Heavy rain", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  harvest_rain: { text: "Rain at harvest", cls: "bg-teal-50 text-teal-700 ring-teal-200" },
  dry_soil: { text: "Soil too dry", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
};

/* growth 0..1 inside each stage [start, end] */
const GROWTH: Record<string, [number, number]> = {
  plant: [0.1, 0.3], grow: [0.3, 0.8], flower: [0.85, 1], fill: [1, 1], harvest: [1, 1], prep: [0, 0], sow: [0.15, 0.55],
};

const GROUND = 170;

/* --------------------------------- component -------------------------------- */
export default function PlantScene({ a, onDate }: { a: PlantHealthResult; onDate?: (d: string) => void }) {
  const series = a.water.series;
  const n = series.length;
  const [idx, setIdx] = useState(() => {
    const p = a.ndvi.peak?.date;
    const i = p ? series.findIndex((s) => s.date === p) : 0;
    return Math.max(0, i);
  });
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIdx((i) => { if (i >= n - 1) { setPlaying(false); return i; } return Math.min(n - 1, i + 2); }), 90);
    return () => clearInterval(t);
  }, [playing, n]);

  const date = series[Math.min(idx, n - 1)]?.date;
  useEffect(() => { if (date && onDate) onDate(date); }, [date, onDate]);

  if (!n || !date) return null;
  const day = series[idx];

  /* ------------------------------ values for this day ----------------------------- */
  const stage = a.stages.find((s) => s.start <= date && s.end >= date) ?? null;
  const obs = a.ndvi.observations;
  let oi = -1;
  obs.forEach((o, i) => { if (o.date <= date) oi = i; });
  const ndvi = oi >= 0 ? obs[oi] : null;
  const prev = oi > 0 ? obs[oi - 1] : null;
  const age = ndvi ? daysBetween(ndvi.date, date) : null;

  const last3 = [series[idx - 2], series[idx - 1], series[idx]];
  const rain3 = idx >= 2 && last3.every((s) => s && s.rain !== null) ? last3.reduce((t, s) => t + (s.rain as number), 0) : null;
  const rainToday = day.rain;
  const m = day.surface;
  const mRoot = day.root;
  const active = a.markers.filter((k) => k.start <= date && k.end >= date);
  const has = (k: StressKind) => active.some((x) => x.kind === k);

  let g = 0;
  if (stage) {
    const [g0, g1] = GROWTH[stage.id] ?? [0, 0];
    const span = Math.max(1, daysBetween(stage.start, stage.end));
    g = g0 + (g1 - g0) * Math.min(1, daysBetween(stage.start, date) / span);
  }
  const isRice = stage?.crop === "rice";
  const isBG = stage?.crop === "black_gram";
  const leaf = ndvi ? ndviColor(ndvi.value) : "#d6d3d1";

  const flood = has("flood");
  const waterH = rain3 === null ? 0 : Math.max(flood ? 40 : 0, Math.min(55, (rain3 / 200) * 40));
  const heat = has("heat");
  const heavy = has("heavy_rain") || has("flood") || (rainToday ?? 0) >= 50;
  const showRain = (rainToday ?? 0) > 0.5;
  const dry = m !== null && m < 0.11;
  const wet = m === null ? 0.35 : Math.max(0, Math.min(1, m / 0.4));
  const soilColor = m === null ? "#a8927a" : mix("#b99572", "#5a4332", wet);
  const sky = heat ? "#fef3c7" : heavy ? "#cbd5e1" : "#e0f2fe";

  const rootWet = mRoot === null ? 0.35 : Math.max(0, Math.min(1, mRoot / 0.4));
  const rootColor = mRoot === null ? "#a8927a" : mix("#b99572", "#4a3628", rootWet);
  const rootDepth = 18 + g * 62; // how deep the roots are drawn (picture only)
  const soilWord = m === null ? "Unknown" : m >= 0.15 ? "Enough water" : m >= 0.11 ? "Getting dry" : "Too dry";
  const delta = ndvi && prev ? ndvi.value - prev.value : null;

  /* ---------------------------------- drawing ---------------------------------- */
  const H = isBG ? 25 + g * 80 : 30 + g * 115;
  const blades = 5 + Math.round(g * 5);
  const riceBlades = Array.from({ length: blades }, (_, i) => {
    const t = (i / (blades - 1)) * 2 - 1;
    const bx = 180 + t * 10, tx = 180 + t * (22 + g * 34);
    const ty = GROUND - H * (0.72 + 0.28 * (1 - Math.abs(t)));
    return `M${bx},${GROUND} Q${bx + t * 8},${GROUND - H * 0.6} ${tx},${ty}`;
  });
  const grain = stage?.id === "flower" ? "#dfe9a6" : stage?.id === "fill" ? "#cdc34a" : "#d9a521";
  const panicles = (["flower", "fill", "harvest"].includes(stage?.id ?? "") ? [-1, 0.5, 1] : []).map((dir) => {
    const x0 = 180 + dir * 12, y0 = GROUND - H * 0.9 - (dir === 0.5 ? 8 : 0);
    const c = { x: x0 + dir * 16, y: y0 - 12 }, e = { x: x0 + dir * 24, y: y0 + 16 };
    const pt = (t: number) => ({ x: (1 - t) ** 2 * x0 + 2 * (1 - t) * t * c.x + t * t * e.x, y: (1 - t) ** 2 * y0 + 2 * (1 - t) * t * c.y + t * t * e.y });
    return { d: `M${x0},${y0} Q${c.x},${c.y} ${e.x},${e.y}`, grains: [0.35, 0.5, 0.62, 0.74, 0.86, 1].map(pt) };
  });
  const nodes = isBG ? 2 + Math.round(g * 3) : 0;
  const drops = Array.from({ length: heavy ? 16 : (rainToday ?? 0) >= 10 ? 9 : 4 }, (_, i) => ({ x: 70 + ((i * 53) % 210), y: 56 + ((i * 37) % 70) }));
  const stubble = stage?.id === "prep";

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-900">Your field on {shortDate(date)}</h3>
          <p className="text-xs text-stone-500">{stage ? stage.label : "Outside crop calendar"}{isRice ? " · rice" : isBG ? " · black gram" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {active.length === 0 && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">No stress marker today</span>}
          {[...new Set(active.map((x) => x.kind))].map((k) => (
            <span key={k} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${CHIP[k].cls}`}>{CHIP[k].text}</span>
          ))}
        </div>
      </div>

      <svg viewBox="0 0 360 262" className="h-auto w-full rounded-xl" role="img" aria-label={`Field scene for ${date}`}>
        <rect width="360" height={GROUND} fill={sky} />

        {/* sun */}
        <g>
          {heat && Array.from({ length: 10 }, (_, i) => {
            const ang = (i / 10) * Math.PI * 2;
            return <line key={i} x1={310 + Math.cos(ang) * 22} y1={40 + Math.sin(ang) * 22} x2={310 + Math.cos(ang) * 32} y2={40 + Math.sin(ang) * 32} stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" />;
          })}
          <circle cx={310} cy={40} r={16} fill={heat ? "#ef4444" : "#fbbf24"} opacity={heavy && !heat ? 0.35 : 1} />
          {heat && <text x={310} y={78} textAnchor="middle" fontSize={10} fontWeight={600} fill="#b91c1c">≥ 35°C</text>}
        </g>

        {/* cloud + rain */}
        {(showRain || heavy) && (
          <g>
            <g fill={heavy ? "#64748b" : "#94a3b8"}>
              <ellipse cx={110} cy={42} rx={34} ry={14} /><ellipse cx={138} cy={36} rx={26} ry={13} /><ellipse cx={86} cy={38} rx={22} ry={11} />
            </g>
            {drops.map((d, i) => <line key={i} x1={d.x} y1={d.y} x2={d.x - 3} y2={d.y + 9} stroke="#0ea5e9" strokeWidth={1.6} strokeLinecap="round" />)}
          </g>
        )}

        {/* soil */}
        <rect y={GROUND} width="360" height={22} fill={soilColor} />
        <rect y={GROUND + 22} width="360" height={262 - GROUND - 22} fill={rootColor} />
        <line x1={0} x2={360} y1={GROUND + 22} y2={GROUND + 22} stroke="#f5f5f4" strokeDasharray="4 3" opacity={0.6} />
        <text x={62} y={GROUND + 15} fontSize={9.5} fill="#fafaf9" fontWeight={600}>Surface soil {m === null ? "unknown" : m.toFixed(2)}</text>
        <text x={62} y={GROUND + 37} fontSize={9.5} fill="#fafaf9" fontWeight={600}>Root zone {mRoot === null ? "unknown" : mRoot.toFixed(2)}</text>
        <path d={`M0,${GROUND} Q90,${GROUND - 4} 180,${GROUND} T360,${GROUND}`} fill="none" stroke="#6b4f3a" strokeWidth={1.5} opacity={0.5} />
        {dry && (
          <g stroke="#3f2d20" strokeWidth={1.3} fill="none" opacity={0.65}>
            <path d="M40,172 l6,12 l-4,10 l7,12" /><path d="M110,172 l-5,14 l6,9" /><path d="M250,172 l7,11 l-5,12 l8,10" /><path d="M300,174 l-6,12 l5,10" /><path d="M215,176 l-4,10" />
          </g>
        )}
        {m === null && mRoot === null && <text x={180} y={240} textAnchor="middle" fontSize={11} fill="#57534e">Soil moisture unknown</text>}

        {/* roots: reach down into the root-zone layer */}
        {g > 0 && (
          <g stroke="#e8d3ad" fill="none" strokeLinecap="round" opacity={0.95}>
            <path d={`M180,${GROUND} q-4,${rootDepth * 0.5} -8,${rootDepth}`} strokeWidth={2.4} />
            <path d={`M180,${GROUND} q6,${rootDepth * 0.5} 4,${rootDepth * 0.95}`} strokeWidth={2.4} />
            <path d={`M180,${GROUND} q-14,${rootDepth * 0.35} -30,${rootDepth * 0.8}`} strokeWidth={2} />
            <path d={`M180,${GROUND} q14,${rootDepth * 0.35} 30,${rootDepth * 0.8}`} strokeWidth={2} />
            <path d={`M176,${GROUND + rootDepth * 0.4} q-14,4 -24,${rootDepth * 0.25}`} strokeWidth={1.2} />
            <path d={`M184,${GROUND + rootDepth * 0.45} q14,4 24,${rootDepth * 0.25}`} strokeWidth={1.2} />
            <path d={`M174,${GROUND + rootDepth * 0.8} q-8,3 -14,${rootDepth * 0.12}`} strokeWidth={1} />
            <path d={`M186,${GROUND + rootDepth * 0.8} q8,3 14,${rootDepth * 0.12}`} strokeWidth={1} />
          </g>
        )}

        {/* plant */}
        {isRice && (
          <g>
            {riceBlades.map((d, i) => <path key={i} d={d} fill="none" stroke={leaf} strokeWidth={3 + g * 0.8} strokeLinecap="round" />)}
            {panicles.map((p, i) => (
              <g key={i}>
                <path d={p.d} fill="none" stroke={mix(grain, "#65a30d", 0.5)} strokeWidth={1.6} strokeLinecap="round" />
                {p.grains.map((q, k) => <ellipse key={k} cx={q.x} cy={q.y} rx={2.2} ry={3.2} fill={grain} stroke="#a16207" strokeWidth={0.3} />)}
              </g>
            ))}
          </g>
        )}
        {isBG && (
          <g>
            <line x1={180} y1={GROUND} x2={180} y2={GROUND - H} stroke={mix(leaf, "#3f6212", 0.3)} strokeWidth={3} strokeLinecap="round" />
            {Array.from({ length: nodes }, (_, k) => {
              const y = GROUND - (H * (k + 1)) / (nodes + 1) - 4;
              const sz = 7 + g * 6;
              return (
                <g key={k} fill={leaf} stroke={mix(leaf, "#14532d", 0.35)} strokeWidth={0.8}>
                  <ellipse cx={180 - 14 - sz / 2} cy={y} rx={sz} ry={sz * 0.6} transform={`rotate(-20 ${180 - 14} ${y})`} />
                  <ellipse cx={180 + 14 + sz / 2} cy={y} rx={sz} ry={sz * 0.6} transform={`rotate(20 ${180 + 14} ${y})`} />
                  <ellipse cx={180} cy={y - sz * 0.9} rx={sz * 0.6} ry={sz} />
                </g>
              );
            })}
          </g>
        )}
        {stubble && (
          <g stroke="#a16207" strokeWidth={2.2} strokeLinecap="round">
            {[-40, -28, -16, -6, 6, 16, 28, 40, 52, -52].map((dx, i) => <line key={i} x1={180 + dx} y1={GROUND} x2={180 + dx + (i % 2 ? 2 : -2)} y2={GROUND - 12 - (i % 3) * 3} />)}
          </g>
        )}

        {/* standing rain water (drawn over the plant base) */}
        {waterH > 0 && (
          <g>
            <path d={`M0,${GROUND - waterH} q22,-5 45,0 t45,0 t45,0 t45,0 t45,0 t45,0 t45,0 t45,0 V${GROUND} H0 Z`} fill="#38bdf8" opacity={0.42} />
            <path d={`M0,${GROUND - waterH} q22,-5 45,0 t45,0 t45,0 t45,0 t45,0 t45,0 t45,0 t45,0`} fill="none" stroke="#0284c7" strokeWidth={1.4} opacity={0.7} />
          </g>
        )}

        {/* left gauge: rain in the last 3 days */}
        <g>
          <rect x={14} y={52} width={14} height={118} rx={3} fill="white" stroke="#a8a29e" />
          {rain3 !== null && <rect x={14} y={170 - Math.min(250, rain3) / 250 * 118} width={14} height={Math.min(250, rain3) / 250 * 118} rx={3} fill={rain3 >= 200 ? "#1d4ed8" : "#38bdf8"} />}
          <line x1={10} x2={32} y1={170 - (200 / 250) * 118} y2={170 - (200 / 250) * 118} stroke="#dc2626" strokeDasharray="3 2" />
          <text x={36} y={170 - (200 / 250) * 118 + 3} fontSize={8.5} fill="#dc2626">200 mm</text>
          <text x={14} y={46} fontSize={9} fill="#44403c" fontWeight={600}>Rain 3 days</text>
          <text x={14} y={GROUND + 15} fontSize={9.5} fill="#fafaf9" fontWeight={600}>{rain3 === null ? "—" : `${rain3.toFixed(0)} mm`}</text>
        </g>

        {/* right gauge: soil moisture */}
        <g>
          <rect x={330} y={186} width={14} height={68} rx={3} fill="#fafaf9" stroke="#78716c" />
          {m !== null && <rect x={330} y={254 - Math.min(0.45, m) / 0.45 * 68} width={14} height={Math.min(0.45, m) / 0.45 * 68} rx={3} fill={m >= 0.15 ? "#0ea5e9" : m >= 0.11 ? "#f59e0b" : "#dc2626"} />}
          <line x1={326} x2={348} y1={254 - (0.15 / 0.45) * 68} y2={254 - (0.15 / 0.45) * 68} stroke="#065f46" strokeDasharray="3 2" />
          <line x1={326} x2={348} y1={254 - (0.11 / 0.45) * 68} y2={254 - (0.11 / 0.45) * 68} stroke="#dc2626" strokeDasharray="3 2" />
          <text x={344} y={181} textAnchor="end" fontSize={9} fill="#fafaf9" fontWeight={600}>Soil water</text>
          <text x={316} y={250} textAnchor="end" fontSize={9.5} fill="#fafaf9" fontWeight={600}>{m === null ? "—" : m.toFixed(2)}</text>
        </g>

        {!ndvi && <text x={180} y={96} textAnchor="middle" fontSize={11} fill="#78716c">No NDVI reading yet — plant colour unknown</text>}
      </svg>

      {/* slider */}
      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => { if (idx >= n - 1) setIdx(0); setPlaying((p) => !p); }} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700" aria-label={playing ? "Pause" : "Play season"}>
          {playing ? "❚❚ Pause" : "▶ Play season"}
        </button>
        <input type="range" min={0} max={n - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(parseInt(e.target.value, 10)); }} className="w-full accent-emerald-600" aria-label="Pick a date in the season" />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-stone-400"><span>{shortDate(series[0].date)}</span><span>{shortDate(series[n - 1].date)}</span></div>

      {/* jump to stage */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {a.stages.filter((s) => s.id !== "grow" && s.id !== "fill" && series.some((p) => p.date === s.start)).map((s) => (
          <button key={s.id} onClick={() => { setPlaying(false); setIdx(series.findIndex((p) => p.date === s.start)); }} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${stage?.id === s.id ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* plain-language readout */}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="rounded-xl bg-stone-50 p-3">
          <dt className="text-[11px] uppercase tracking-wide text-stone-500">Greenness (NDVI)</dt>
          <dd className="mt-1 flex items-center gap-2 text-lg font-semibold text-stone-900">
            <span className="inline-block h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: leaf }} />{ndvi ? ndvi.value.toFixed(2) : "—"}
          </dd>
          <dd className="text-[11px] text-stone-400">
            {ndvi ? `reading ${age === 0 ? "today" : `${age} day(s) ago`}${delta !== null ? ` · ${delta >= 0 ? "up" : "down"} ${Math.abs(delta).toFixed(2)} from the one before` : ""}` : "no data yet"}
          </dd>
        </div>
        <div className="rounded-xl bg-stone-50 p-3">
          <dt className="text-[11px] uppercase tracking-wide text-stone-500">Soil water</dt>
          <dd className="mt-1 text-lg font-semibold text-stone-900">{soilWord}</dd>
          <dd className="text-[11px] text-stone-400">surface {fmt(m)} · root zone {fmt(mRoot)} <span className="text-amber-600">(assumed limits)</span></dd>
        </div>
        <div className="rounded-xl bg-stone-50 p-3">
          <dt className="text-[11px] uppercase tracking-wide text-stone-500">Rain</dt>
          <dd className="mt-1 text-lg font-semibold text-stone-900">{rainToday === null ? "—" : `${rainToday.toFixed(0)} mm today`}</dd>
          <dd className="text-[11px] text-stone-400">{rain3 === null ? "3-day total unknown" : `${rain3.toFixed(0)} mm in last 3 days`}</dd>
        </div>
        <div className="rounded-xl bg-stone-50 p-3">
          <dt className="text-[11px] uppercase tracking-wide text-stone-500">Temperature</dt>
          <dd className="mt-1 text-lg font-semibold text-stone-900">{heat ? "Very hot" : a.layers.temperature ? "No heat flag" : "Unknown"}</dd>
          <dd className="text-[11px] text-stone-400">{a.layers.temperature ? "heat flag only counts during flowering" : "daily max temperature missing"}</dd>
        </div>
      </dl>

      <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
        Leaf colour follows NDVI greenness (a trend picture, not a “healthy / stressed” verdict). The water stick shows rain over the last 3 days, not measured water depth in your field.
      </p>
    </div>
  );
}
