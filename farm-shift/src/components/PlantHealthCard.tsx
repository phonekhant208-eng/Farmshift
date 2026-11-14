"use client";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import type { CropStage, NdviObs, PlantHealthResult, Reliability, Status, StressKind } from "@/types/plantHealth";
import { Card, Pill, Stat } from "@/components/ui";
import PlantScene from "@/components/PlantScene";
import { shortDate } from "@/lib/format";

/* ------------------------------ shared helpers ----------------------------- */
const DAY = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const W = 720;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function makeScale(start: string, end: string, left: number, right: number) {
  const a = ms(start);
  const span = Math.max(DAY, ms(end) + DAY - a); // include the whole last day
  const clamp = (d: string) => Math.min(Math.max(ms(d), a), a + span);
  return (d: string) => left + ((clamp(d) - a) / span) * (right - left);
}

function monthTicks(start: string, end: string) {
  const out: { date: string; label: string }[] = [];
  const s = new Date(`${start}T00:00:00Z`);
  const d = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
  if (d < s) d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.getTime() <= ms(end)) {
    out.push({ date: d.toISOString().slice(0, 10), label: MONTHS[d.getUTCMonth()] });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

const MARKER_STYLE: Record<StressKind, { color: string; lane: number; name: string }> = {
  heat: { color: "#dc2626", lane: 0, name: "Heat ≥ 35°C" },
  warm_night: { color: "#ea580c", lane: 0, name: "Warm night ≥ 27°C" },
  flood: { color: "#1d4ed8", lane: 1, name: "Flood risk" },
  heavy_rain: { color: "#0ea5e9", lane: 1, name: "Heavy rain" },
  harvest_rain: { color: "#0d9488", lane: 2, name: "Harvest rain" },
  dry_soil: { color: "#d97706", lane: 2, name: "Dry soil" },
};
const LANES = ["Heat / night", "Flood / rain", "Harvest / dry"];

const STAGE_FILL: Record<CropStage["crop"], string[]> = {
  rice: ["#fde68a", "#fcd34d"],
  prep: ["#d6d3d1"],
  black_gram: ["#6ee7b7"],
};

export function Tag({ r }: { r: Reliability }) {
  return (
    <span className={`ml-1.5 inline-block rounded px-1.5 py-0.5 align-middle text-[10px] font-medium ring-1 ${r === "Sourced" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>
      {r}
    </span>
  );
}

const fmt = (v: number | null | undefined, d = 2, s = "") => (typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(d)}${s}` : "—");
const statusLabel = (s: Status) => (s === "unknown" ? "Unknown" : s[0].toUpperCase() + s.slice(1));

/* -------------------------------- main card -------------------------------- */
export default function PlantHealthCard({
  analysis, badge, baseline, baselineLabel,
}: {
  analysis: PlantHealthResult | null | undefined;
  badge?: ReactNode;
  baseline?: NdviObs[] | null;
  baselineLabel?: string;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const onDate = useCallback((d: string) => setCursor(d), []);
  if (!analysis) {
    return (
      <Card title="Plant health & water level" subtitle="NDVI trend with crop calendar, stress and water context" badge={badge} className="lg:col-span-2">
        <Empty text="Plant health data is unavailable." />
      </Card>
    );
  }
  const a = analysis;
  const layerList: { key: keyof PlantHealthResult["layers"]; name: string }[] = [
    { key: "ndvi", name: "NDVI" }, { key: "temperature", name: "Temperature" },
    { key: "rainfall", name: "Rainfall" }, { key: "soil", name: "Soil moisture" },
  ];

  return (
    <Card
      title="Plant health & water level"
      subtitle="NDVI trend read against the crop calendar, with heat, flood and soil-water context"
      badge={badge}
      className="lg:col-span-2"
    >
      {/* status + coverage */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <p className="max-w-2xl text-sm text-stone-700">{a.summary.text}</p>
        <div className="shrink-0 rounded-xl bg-stone-50 p-3">
          <div className="text-[11px] uppercase tracking-wide text-stone-500">Data coverage · {Math.round(a.coverage * 100)}%</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
            {layerList.map((l) => (
              <span key={l.key} className="flex items-center gap-1.5 text-xs text-stone-600">
                <span className={`h-2 w-2 rounded-full ${a.layers[l.key] ? "bg-emerald-500" : "bg-stone-300"}`} />
                {l.name}{!a.layers[l.key] && <span className="text-stone-400"> · unknown</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 2D field picture */}
      {a.water.series.length > 0 && (
        <div className="mt-5">
          <PlantScene key={`${a.period?.start}-${a.period?.end}-${a.ndvi.count}-${a.ndvi.peak?.value ?? "x"}-${a.water.rain.seasonTotalMm ?? "x"}`} a={a} onDate={onDate} />
        </div>
      )}

      {/* NDVI */}
      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">NDVI trend · crop stages · stress markers</h3>
          <span className="text-[11px] text-stone-400">Trend only — no healthy / stressed verdict</span>
        </div>

        {a.ndvi.count === 0 ? (
          <Empty text="No NDVI data — nothing to chart (coverage for this layer is 0)." />
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="First" value={fmt(a.ndvi.first?.value)} hint={a.ndvi.first ? shortDate(a.ndvi.first.date) : undefined} />
              <Stat label="Peak" value={fmt(a.ndvi.peak?.value)} hint={a.ndvi.peak ? shortDate(a.ndvi.peak.date) : undefined} />
              <Stat label="Latest" value={fmt(a.ndvi.last?.value)} hint={a.ndvi.last ? shortDate(a.ndvi.last.date) : undefined} />
              <Stat label="Dips ≥ 0.08" value={a.dips.filter((d) => d.phase === "in_season").length} hint={`${a.ndvi.count} observations`} />
            </div>
            <NdviChart a={a} baseline={baseline} baselineLabel={baselineLabel} cursor={cursor} />
            <Legend a={a} />
            <DipList a={a} />
          </>
        )}
      </div>

      {/* Water level */}
      <WaterLevel a={a} />

      {/* reasons / limitations */}
      <details className="mt-5 rounded-xl border border-stone-200 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-stone-700">Reasons & limitations ({a.notes.length})</summary>
        <ul className="mt-3 space-y-1.5">
          {a.notes.map((n, i) => (
            <li key={i} className="text-xs text-stone-600">ⓘ {n.text}<Tag r={n.reliability} /></li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

/* ------------------------------- NDVI chart -------------------------------- */
function NdviChart({ a, baseline, baselineLabel, cursor }: { a: PlantHealthResult; baseline?: NdviObs[] | null; baselineLabel?: string; cursor?: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const period = a.period!;
  const L = 84, R = W - 12, top = 20, plotH = 190;
  const axisY = top + plotH + 14;
  const laneTop = top + plotH + 24, laneH = 14, laneGap = 4;
  const H = laneTop + 3 * (laneH + laneGap) + 4;
  const x = makeScale(period.start, period.end, L, R);
  const y = (v: number) => top + plotH - Math.max(0, Math.min(1, v)) * plotH;
  const obs = a.ndvi.observations;
  const dayEnd = (d: string) => new Date(ms(d) + DAY).toISOString().slice(0, 10);

  const path = (pts: NdviObs[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    obs.forEach((o, i) => { const d = Math.abs(x(o.date) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };
  const hov = hover !== null ? obs[hover] : null;
  const active = hov ? a.markers.filter((m) => m.start <= hov.date && m.end >= hov.date) : [];
  const stage = hov ? a.stages.find((s) => s.start <= hov.date && s.end >= hov.date) : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="NDVI time series with crop stages and stress markers">
        {/* stage bands */}
        {a.stages.filter((s) => s.end >= period.start && s.start <= period.end).map((s, i) => {
          const x0 = x(s.start), x1 = x(dayEnd(s.end));
          const fills = STAGE_FILL[s.crop];
          return (
            <g key={s.id}>
              <rect x={x0} y={top} width={Math.max(0, x1 - x0)} height={plotH} fill={fills[i % fills.length]} opacity={0.35} />
              {x1 - x0 > 44 && <text x={(x0 + x1) / 2} y={top + 11} textAnchor="middle" fontSize={9.5} className="fill-stone-600">{s.label}</text>}
            </g>
          );
        })}

        {/* y grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={L} x2={R} y1={y(t)} y2={y(t)} className="stroke-stone-200" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={11} className="fill-stone-400">{t.toFixed(2)}</text>
          </g>
        ))}
        {/* x axis */}
        {monthTicks(period.start, period.end).map((m) => (
          <g key={m.date}>
            <line x1={x(m.date)} x2={x(m.date)} y1={top} y2={top + plotH} className="stroke-stone-200" strokeWidth={1} strokeDasharray="2 3" />
            <text x={x(m.date) + 2} y={axisY} fontSize={11} className="fill-stone-400">{m.label}</text>
          </g>
        ))}

        {/* in-season dips */}
        {a.dips.map((d) => (
          <rect key={d.from} x={x(d.from)} y={top} width={Math.max(2, x(d.to) - x(d.from))} height={plotH} fill="#dc2626" opacity={d.phase === "in_season" ? 0.12 : 0.05}>
            <title>{`NDVI drop ${d.drop.toFixed(3)} (${shortDate(d.from)} → ${shortDate(d.to)})`}</title>
          </rect>
        ))}

        {/* baseline season (optional) */}
        {baseline && baseline.length > 1 && <path d={path(baseline)} fill="none" stroke="#a8a29e" strokeWidth={1.5} strokeDasharray="5 4" />}

        {/* NDVI line, dips drawn thicker in red */}
        <path d={path(obs)} fill="none" stroke="#059669" strokeWidth={2.25} strokeLinejoin="round" />
        {a.dips.map((d) => (
          <line key={`s${d.from}`} x1={x(d.from)} y1={y(d.fromValue)} x2={x(d.to)} y2={y(d.toValue)} stroke="#dc2626" strokeWidth={3.5} strokeLinecap="round" opacity={d.phase === "in_season" ? 1 : 0.45} />
        ))}
        {obs.map((o) => <circle key={o.date} cx={x(o.date)} cy={y(o.value)} r={2.6} fill="#059669" />)}

        {/* marker lanes (same time axis) */}
        {LANES.map((name, i) => (
          <g key={name}>
            <text x={0} y={laneTop + i * (laneH + laneGap) + 10} fontSize={9.5} className="fill-stone-400">{name}</text>
            <rect x={L} y={laneTop + i * (laneH + laneGap)} width={R - L} height={laneH} rx={3} className="fill-stone-100" />
          </g>
        ))}
        {a.markers.map((m, i) => {
          const st = MARKER_STYLE[m.kind];
          const x0 = x(m.start), x1 = x(dayEnd(m.end));
          return (
            <rect key={i} x={x0} y={laneTop + st.lane * (laneH + laneGap)} width={Math.max(3, x1 - x0)} height={laneH} rx={3} fill={st.color} opacity={0.9}>
              <title>{`${m.label}: ${shortDate(m.start)}${m.start !== m.end ? ` – ${shortDate(m.end)}` : ""} · ${m.detail} (${m.reliability})`}</title>
            </rect>
          );
        })}

        {cursor && cursor >= period.start && cursor <= period.end && (
          <line x1={x(cursor)} x2={x(cursor)} y1={top} y2={laneTop + 3 * (laneH + laneGap)} stroke="#059669" strokeWidth={1.5} />
        )}

        {hov && (
          <g>
            <line x1={x(hov.date)} x2={x(hov.date)} y1={top} y2={laneTop + 3 * (laneH + laneGap)} className="stroke-stone-500" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hov.date)} cy={y(hov.value)} r={5} fill="white" stroke="#059669" strokeWidth={2} />
          </g>
        )}
      </svg>

      {hov && (
        <div
          className="pointer-events-none absolute top-1 rounded-lg bg-stone-900/95 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: `${(x(hov.date) / W) * 100}%`, transform: `translateX(${x(hov.date) > W * 0.65 ? "-105%" : "8px"})` }}
        >
          <div className="font-semibold">{shortDate(hov.date)} · NDVI {hov.value.toFixed(3)}</div>
          {stage && <div className="text-stone-300">Stage: {stage.label}</div>}
          {active.length ? active.map((m, i) => <div key={i} style={{ color: MARKER_STYLE[m.kind].color === "#1d4ed8" ? "#93c5fd" : MARKER_STYLE[m.kind].color }}>● {m.label}</div>) : <div className="text-stone-400">No stress marker</div>}
        </div>
      )}
      {baseline && baseline.length > 1 && (
        <div className="mt-1 text-[11px] text-stone-400"><span className="mr-1 inline-block h-0 w-5 border-t-2 border-dashed border-stone-400 align-middle" />{baselineLabel ?? "Comparison season"}</div>
      )}
    </div>
  );
}

function Legend({ a }: { a: PlantHealthResult }) {
  const kinds = Array.from(new Set(a.markers.map((m) => m.kind)));
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-500">
      <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-emerald-600" />NDVI</span>
      <span className="flex items-center gap-1.5"><span className="h-1 w-4 rounded bg-red-600" />Drop ≥ 0.08</span>
      {kinds.length === 0 && <span className="text-stone-400">No stress markers in this period</span>}
      {kinds.map((k) => <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: MARKER_STYLE[k].color }} />{MARKER_STYLE[k].name}</span>)}
    </div>
  );
}

function DipList({ a }: { a: PlantHealthResult }) {
  if (!a.dips.length) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {a.dips.map((d) => (
        <li key={d.from} className={`rounded-lg px-3 py-2 text-xs ${d.phase === "in_season" ? "bg-red-50 text-red-900" : "bg-stone-50 text-stone-600"}`}>
          <span className="font-semibold">−{d.drop.toFixed(3)}</span> · {shortDate(d.from)} → {shortDate(d.to)} ({d.fromValue.toFixed(2)} → {d.toValue.toFixed(2)})
          {d.phase === "post_harvest" ? (
            <span> · after the harvest window opens, so a drop is expected<Tag r="Assumption" /></span>
          ) : d.linked.length ? (
            <span> · overlaps: {d.linked.map((k) => MARKER_STYLE[k].name).join(", ")} <span className="text-red-700/70">(timing match, not proof of cause)</span></span>
          ) : (
            <span> · no stress marker overlaps this dip</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------- water level ------------------------------- */
function WaterLevel({ a }: { a: PlantHealthResult }) {
  const { soil, rain } = a.water;
  const flood = rain.floodFlag === null ? "unknown" : rain.floodFlag ? "unsuitable" : "suitable";
  const harvest = rain.harvestRainFlag === null ? "unknown" : rain.harvestRainFlag ? "unsuitable" : "suitable";
  const gate = soil.gate === "unknown" ? "unknown" : soil.gate === "flag" ? "unsuitable" : "suitable";

  return (
    <div className="mt-6 border-t border-stone-100 pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Water level · rainfall and soil moisture</h3>
        <span className="text-[11px] text-stone-400">Sowing window {shortDate(soil.sowingWindow.start)} – {shortDate(soil.sowingWindow.end)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Rainy-season rain" value={fmt(rain.seasonTotalMm, 0, " mm")} hint={rain.seasonTotalMm === null ? "period doesn’t cover 15 May – 15 Oct" : "15 May – 15 Oct · 2,000–3,000 mm normal"} />
        <Stat label="Soil moisture (sowing)" value={fmt(soil.meanSurface, 3)} hint={soil.mode === "snapshot" ? `single reading ${fmt(soil.latestSurface, 2)} · no series` : "surface mean, m³/m³"} />
        <Stat label="Moisture lost / day" value={fmt(soil.lossPerDay, 4)} hint={soil.moistureLost === null ? "needs harvest & sowing-day values" : `${fmt(soil.atHarvest, 3)} → ${fmt(soil.atSowing, 3)} over ${soil.delayDays} d`} />
        <Stat label="Heavy-rain days" value={a.layers.rainfall ? rain.heavyRainDays : "—"} hint="≥ 50 mm/day" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-stone-600">
        <span>Rainfall: <Pill status={rain.seasonStatus}>{statusLabel(rain.seasonStatus)}</Pill><Tag r="Sourced" /></span>
        <span>Flood risk: <Pill status={flood}>{rain.floodFlag === null ? "Unknown" : rain.floodFlag ? `Flag${rain.floodFirstStart ? ` from ${shortDate(rain.floodFirstStart)}` : ""}` : "None"}</Pill><Tag r="Assumption" /></span>
        <span>Harvest rain: <Pill status={harvest}>{rain.harvestRainDays === null ? "Unknown" : `${rain.harvestRainDays} day(s)${rain.harvestRainFlag ? " · flag" : ""}`}</Pill><Tag r="Assumption" /></span>
        <span>Soil: <Pill status={soil.status}>{statusLabel(soil.status)}</Pill><Tag r="Assumption" /></span>
        <span>Black gram gate: <Pill status={gate}>{soil.gate === "pass" ? "Pass" : soil.gate === "flag" ? "Flag" : "Unknown"}</Pill></span>
      </div>

      <WaterChart a={a} />
    </div>
  );
}

function WaterChart({ a }: { a: PlantHealthResult }) {
  const period = a.period;
  const { series, soil } = a.water;
  if (!period || !series.length) return <div className="mt-4"><Empty text="No water data for this period." /></div>;

  const L = 52, R = W - 12;
  const rainTop = 14, rainH = 70;
  const soilTop = rainTop + rainH + 26, soilH = 100;
  const axisY = soilTop + soilH + 16;
  const H = axisY + 6;
  const x = makeScale(period.start, period.end, L, R);
  const dayEnd = (d: string) => new Date(ms(d) + DAY).toISOString().slice(0, 10);
  const plotW = R - L;
  const nDays = Math.max(1, Math.round((ms(period.end) - ms(period.start)) / DAY) + 1);
  const barW = Math.max(1, (plotW / nDays) * 0.85);

  const rains = series.map((p) => p.rain).filter((v): v is number => v !== null);
  const rainMax = Math.max(60, ...rains) * 1.05;
  const yr = (v: number) => rainTop + rainH - (v / rainMax) * rainH;

  const soils = series.flatMap((p) => [p.surface, p.root]).filter((v): v is number => v !== null);
  const soilMax = Math.max(0.4, ...soils) + 0.03;
  const ys = (v: number) => soilTop + soilH - (v / soilMax) * soilH;
  const line = (key: "surface" | "root") => {
    let d = "", pen = false;
    for (const p of series) {
      const v = p[key];
      if (v === null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(p.date).toFixed(1)},${ys(v).toFixed(1)} `; pen = true;
    }
    return d;
  };
  const floods = a.markers.filter((m) => m.kind === "flood");
  const inPeriod = (d: string) => d >= period.start && d <= period.end;

  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily rainfall and soil moisture">
        {/* month grid */}
        {monthTicks(period.start, period.end).map((m) => (
          <g key={m.date}>
            <line x1={x(m.date)} x2={x(m.date)} y1={rainTop} y2={soilTop + soilH} className="stroke-stone-200" strokeWidth={1} strokeDasharray="2 3" />
            <text x={x(m.date) + 2} y={axisY} fontSize={11} className="fill-stone-400">{m.label}</text>
          </g>
        ))}

        {/* rain panel */}
        <text x={L - 6} y={rainTop + 9} textAnchor="end" fontSize={10} className="fill-stone-400">{rainMax.toFixed(0)}</text>
        <text x={L - 6} y={rainTop + rainH} textAnchor="end" fontSize={10} className="fill-stone-400">0</text>
        <text x={4} y={rainTop + rainH / 2} fontSize={9.5} className="fill-stone-400">mm/day</text>
        <rect x={L} y={rainTop} width={plotW} height={rainH} className="fill-none stroke-stone-200" />
        {floods.map((f, i) => (
          <rect key={i} x={x(f.start)} y={rainTop} width={Math.max(3, x(dayEnd(f.end)) - x(f.start))} height={rainH} fill="#1d4ed8" opacity={0.18}>
            <title>{`Flood risk ${shortDate(f.start)} – ${shortDate(f.end)}`}</title>
          </rect>
        ))}
        {series.map((p) => p.rain !== null && p.rain > 0 && (
          <rect key={p.date} x={x(p.date)} y={yr(p.rain)} width={barW} height={rainTop + rainH - yr(p.rain)} fill={p.rain >= 50 ? "#1d4ed8" : "#38bdf8"}>
            <title>{`${shortDate(p.date)}: ${p.rain.toFixed(1)} mm`}</title>
          </rect>
        ))}
        <line x1={L} x2={R} y1={yr(50)} y2={yr(50)} stroke="#dc2626" strokeDasharray="5 4" strokeWidth={1.2} />
        <text x={R} y={yr(50) - 3} textAnchor="end" fontSize={10} fill="#dc2626">50 mm heavy-rain day</text>

        {/* soil panel */}
        <rect x={L} y={soilTop} width={plotW} height={soilH} className="fill-none stroke-stone-200" />
        <text x={4} y={soilTop + soilH / 2} fontSize={9.5} className="fill-stone-400">m³/m³</text>
        {[0, 0.1, 0.2, 0.3, 0.4].filter((t) => t <= soilMax).map((t) => (
          <text key={t} x={L - 6} y={ys(t) + 3} textAnchor="end" fontSize={10} className="fill-stone-400">{t.toFixed(1)}</text>
        ))}
        <rect x={x(soil.sowingWindow.start)} y={soilTop} width={Math.max(0, x(dayEnd(soil.sowingWindow.end)) - x(soil.sowingWindow.start))} height={soilH} fill="#6ee7b7" opacity={0.25} />
        <text x={x(soil.sowingWindow.start) + 3} y={soilTop + 11} fontSize={9.5} className="fill-emerald-800">Sowing window</text>

        <line x1={L} x2={R} y1={ys(0.15)} y2={ys(0.15)} stroke="#059669" strokeDasharray="5 4" strokeWidth={1.2} />
        <text x={L + 3} y={ys(0.15) - 3} fontSize={10} fill="#059669">0.15 suitable</text>
        <line x1={L} x2={R} y1={ys(0.11)} y2={ys(0.11)} stroke="#dc2626" strokeDasharray="5 4" strokeWidth={1.2} />
        <text x={L + 3} y={ys(0.11) + 11} fontSize={10} fill="#dc2626">0.11 too dry</text>

        {inPeriod(soil.harvestDate) && <g><line x1={x(soil.harvestDate)} x2={x(soil.harvestDate)} y1={soilTop} y2={soilTop + soilH} stroke="#78716c" strokeWidth={1} /><text x={x(soil.harvestDate) - 3} y={soilTop + soilH - 4} textAnchor="end" fontSize={9.5} className="fill-stone-500">harvest</text></g>}
        {inPeriod(soil.sowingDate) && <g><line x1={x(soil.sowingDate)} x2={x(soil.sowingDate)} y1={soilTop} y2={soilTop + soilH} stroke="#78716c" strokeWidth={1} /><text x={x(soil.sowingDate) + 3} y={soilTop + soilH - 4} fontSize={9.5} className="fill-stone-500">sow +{soil.delayDays}d</text></g>}

        <path d={line("root")} fill="none" stroke="#0f766e" strokeWidth={1.75} />
        <path d={line("surface")} fill="none" stroke="#d97706" strokeWidth={2} />

        {soil.mode === "none" && <text x={(L + R) / 2} y={soilTop + soilH / 2} textAnchor="middle" fontSize={12} className="fill-stone-400">Soil moisture unknown — no SMAP data</text>}
        {soil.mode === "snapshot" && <text x={(L + R) / 2} y={soilTop + soilH / 2 + 14} textAnchor="middle" fontSize={11} className="fill-stone-400">Single reading only (surface {fmt(soil.latestSurface, 2)}, root zone {fmt(soil.latestRoot, 2)}) — no time series</text>}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-400" />Daily rain</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-700" />≥ 50 mm day</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-700/20" />Flood window</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-amber-600" />Surface moisture</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-teal-700" />Root zone</span>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="grid h-32 place-items-center rounded-xl border border-dashed border-stone-200 px-4 text-center text-sm text-stone-400">{text}</div>;
}
