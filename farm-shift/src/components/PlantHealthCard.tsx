"use client";
import type { ReactNode } from "react";
import type { PlantHealthResult, Reliability, StressKind } from "@/types/plantHealth";
import { Card } from "@/components/ui";
import PlantScene from "@/components/PlantScene";
import { shortDate } from "@/lib/format";

const MARKER: Record<StressKind, { dot: string; name: string }> = {
  heat: { dot: "bg-red-500", name: "Very hot days (35°C or more)" },
  warm_night: { dot: "bg-orange-500", name: "Warm nights (27°C or more)" },
  flood: { dot: "bg-blue-600", name: "Flood risk" },
  heavy_rain: { dot: "bg-sky-500", name: "Heavy rain" },
  harvest_rain: { dot: "bg-teal-600", name: "Rain at harvest" },
  dry_soil: { dot: "bg-amber-600", name: "Soil too dry" },
};

const range = (a: string, b: string) => (a === b ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`);

export function Tag({ r }: { r: Reliability }) {
  return (
    <span className={`ml-1.5 inline-block rounded px-1.5 py-0.5 align-middle text-xs font-medium ring-1 ${r === "Sourced" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>
      {r === "Sourced" ? "From data" : "Estimate"}
    </span>
  );
}

export default function PlantHealthCard({ analysis, badge }: { analysis: PlantHealthResult | null | undefined; badge?: ReactNode }) {
  if (!analysis) {
    return (
      <Card title="Your plants" subtitle="How your crop and field water are doing" icon={2} badge={badge}>
        <div className="grid h-32 place-items-center rounded-2xl border-2 border-dashed border-stone-200 px-4 text-center text-base text-stone-500">
          Plant data is not available.
        </div>
      </Card>
    );
  }
  const a = analysis;

  // Group stress markers by type: "Flood risk · 12 Aug – 20 Aug"
  const groups = Object.entries(
    a.markers.reduce<Record<string, { start: string; end: string }[]>>((acc, m) => {
      (acc[m.kind] ??= []).push({ start: m.start, end: m.end });
      return acc;
    }, {})
  ).map(([kind, list]) => ({
    kind: kind as StressKind,
    start: list.map((x) => x.start).sort()[0],
    end: list.map((x) => x.end).sort().reverse()[0],
    count: list.length,
  }));
  const dips = a.dips.filter((d) => d.phase === "in_season").slice(0, 3);

  return (
    <Card title="Your plants" subtitle="Slide through the season to see how your crop grows" icon={2} badge={badge}>
      <p className="rounded-2xl bg-emerald-50 px-5 py-4 text-lg leading-relaxed text-emerald-950 ring-1 ring-emerald-200">{a.summary.text}</p>

      {a.water.series.length > 0 && (
        <div className="mt-5">
          <PlantScene key={`${a.period?.start}-${a.period?.end}-${a.ndvi.count}-${a.ndvi.peak?.value ?? "x"}-${a.water.rain.seasonTotalMm ?? "x"}`} a={a} />
        </div>
      )}

      {groups.length > 0 || dips.length > 0 ? (
        <>
          <h3 className="mt-7 text-lg font-bold text-stone-900">What to watch</h3>
          <ul className="mt-3 space-y-2">
            {groups.map((g) => (
              <li key={g.kind} className="flex items-start gap-3 rounded-2xl bg-stone-50 px-4 py-3 text-base text-stone-800 ring-1 ring-stone-100">
                <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${MARKER[g.kind].dot}`} aria-hidden />
                <span><span className="font-semibold">{MARKER[g.kind].name}</span> · {range(g.start, g.end)}</span>
              </li>
            ))}
            {dips.map((d) => (
              <li key={d.from} className="flex items-start gap-3 rounded-2xl bg-red-50 px-4 py-3 text-base text-red-900 ring-1 ring-red-100">
                <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" aria-hidden />
                <span><span className="font-semibold">Plants lost some greenness</span> · {range(d.from, d.to)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-7 rounded-2xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-800 ring-1 ring-emerald-200">
          No heat, flood or dry-soil problems found in this period.
        </p>
      )}

      {a.notes.length > 0 && (
        <details className="mt-6 rounded-2xl border border-stone-200 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-stone-700">Notes and limits</summary>
          <ul className="mt-3 space-y-1.5">
            {a.notes.map((n, i) => (
              <li key={i} className="text-sm text-stone-600">ⓘ {n.text}<Tag r={n.reliability} /></li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}