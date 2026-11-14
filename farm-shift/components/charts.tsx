"use client";
import { useState } from "react";

export type ChartPoint = { label: string; value: number | null };
export type ChartSeries = { name: string; color: string; points: ChartPoint[] };

const W = 640;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

function niceRange(values: number[], zeroBase: boolean) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (zeroBase) min = Math.min(0, min);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.08;
  return { min: zeroBase ? min : min - pad, max: max + pad };
}

type Props = {
  series: ChartSeries[];
  kind?: "line" | "bar";
  threshold?: { value: number; label: string };
  unit?: string;
  decimals?: number;
};

export function Chart({ series, kind = "line", threshold, unit = "", decimals = 1 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const all = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v !== null);
  if (!labels.length || !all.length) {
    return <div className="h-40 grid place-items-center text-sm text-stone-400">No data to chart</div>;
  }
  const { min, max } = niceRange(threshold ? [...all, threshold.value] : all, kind === "bar");
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const n = labels.length;
  const x = (i: number) => PAD.left + (kind === "bar" ? (i + 0.5) * (iw / n) : n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PAD.top + ih - ((v - min) / (max - min)) * ih;
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(x(i) - px); if (d < bestD) { bestD = d; best = i; } }
    setHover(best);
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-stone-200" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-stone-400" fontSize={11}>{t.toFixed(decimals > 1 ? 2 : 0)}</text>
          </g>
        ))}
        {labels.map((l, i) => i % labelEvery === 0 && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-stone-400" fontSize={11}>{l}</text>
        ))}

        {threshold && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(threshold.value)} y2={y(threshold.value)} stroke="#dc2626" strokeDasharray="5 4" strokeWidth={1.5} />
            <text x={W - PAD.right} y={y(threshold.value) - 5} textAnchor="end" fill="#dc2626" fontSize={11}>{threshold.label}</text>
          </g>
        )}

        {kind === "bar"
          ? series.map((s) =>
              s.points.map((p, i) => p.value !== null && (
                <rect key={`${s.name}${i}`} x={x(i) - (iw / n) * 0.35} width={(iw / n) * 0.7} y={y(p.value)} height={Math.max(0, y(0) - y(p.value))} rx={2} fill={s.color} opacity={hover === i ? 1 : 0.8} />
              ))
            )
          : series.map((s) => {
              let d = "";
              let pen = false;
              s.points.forEach((p, i) => {
                if (p.value === null) { pen = false; return; }
                d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)} `;
                pen = true;
              });
              return (
                <g key={s.name}>
                  <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
                  {n <= 12 && s.points.map((p, i) => p.value !== null && <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill={s.color} />)}
                </g>
              );
            })}

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} className="stroke-stone-300" strokeWidth={1} />
        )}
        {hover !== null && kind === "line" && series.map((s) => {
          const v = s.points[hover]?.value;
          return v != null ? <circle key={s.name} cx={x(hover)} cy={y(v)} r={5} fill="white" stroke={s.color} strokeWidth={2} /> : null;
        })}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 rounded-lg bg-stone-900/95 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${x(hover) > W * 0.7 ? "-105%" : "8px"})` }}
        >
          <div className="mb-1 font-semibold">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.name}: {s.points[hover]?.value != null ? `${s.points[hover].value!.toFixed(decimals)}${unit}` : "—"}
            </div>
          ))}
        </div>
      )}

      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-stone-500">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}
