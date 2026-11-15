"use client";
import type { ReactNode } from "react";
import type { PlantHealthResult, Reliability, StressKind } from "@/types/plantHealth";
import PlantScene, { type OwnPlant } from "@/components/PlantScene";
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
const dayWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export function Tag({ r }: { r: Reliability }) {
  return (
    <span className={`ml-1.5 inline-block rounded px-1.5 py-0.5 align-middle text-xs font-medium ring-1 ${r === "Sourced" ? "bg-[#e7f3ea] text-[#1f7a3d] ring-[#1f7a3d]/25" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>
      {r === "Sourced" ? "From data" : "Estimate"}
    </span>
  );
}

function Shell({ title, subtitle, badge, children }: { title: string; subtitle: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-[#faf6ef] p-3 ring-1 ring-[#e8dcc8] sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-extrabold leading-tight text-[#2d2218]">{title}</h3>
          <p className="break-words text-sm text-[#8a6a4c]">{subtitle}</p>
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

export default function PlantHealthCard({ analysis, badge, own, title, district }: { analysis: PlantHealthResult | null | undefined; badge?: ReactNode; own?: OwnPlant; title?: string; district?: string | null }) {
  if (!analysis) {
    return (
      <Shell title={title ?? "Your plants"} subtitle="How your crop and field water are doing" badge={badge}>
        <div className="grid h-32 place-items-center rounded-2xl border-2 border-dashed border-[#d9c9b0] px-4 text-center text-base text-[#8a6a4c]">
          Plant data is not available.
        </div>
      </Shell>
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

  // Farmer view (own plot): short plain words, real planting/harvest dates only
  let simpleText = "";
  let watch = groups;
  if (own) {
    const DAY = 86_400_000;
    const today = new Date().toISOString().slice(0, 10);
    const planted = own.plantedOn.slice(0, 10);
    const ended = own.harvestedOn ? own.harvestedOn.slice(0, 10) : null;
    const endDay = ended ?? today; // real days, not the last satellite day (NASA data lags)
    const since = Math.max(0, Math.round((Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${planted}T00:00:00Z`)) / DAY));
    const total = own.totalDays && own.totalDays > 0 ? own.totalDays : 110;
    const name = own.plant;
    if (ended) {
      const r = since / total;
      simpleText = r < 0.6 ? `Your ${name} was harvested after ${dayWord(since)}. It was too early, so the harvest was not good.`
        : r < 0.9 ? `Your ${name} was harvested after ${dayWord(since)}, a little early. You may get less than usual.`
        : `Your ${name} was harvested after ${dayWord(since)}, at a good time.`;
    } else {
      const left = Math.max(0, total - since);
      simpleText = since < 4 ? `Your ${name} was planted ${since === 0 ? "today" : dayWord(since) + " ago"}. The seeds are still in the soil.`
        : `Your ${name} is ${dayWord(since)} old. ${left > 0 ? `About ${left} more days until harvest.` : "It is time to harvest."}`;
    }
    // "Rain at harvest" is based on the fixed rice calendar, so only show it for a plant that is near harvest
    const nearHarvest = since >= total * 0.9;
    watch = groups.filter((g) => g.end >= planted && g.start <= endDay && (g.kind !== "harvest_rain" || nearHarvest));
  }

  return (
    <Shell title={title ?? "Your plants"} subtitle={`${own ? "How your plant looks" : "How your crop grows through the season"}${district ? ` · ${district} District` : ""}`} badge={badge}>
      <p className="rounded-2xl bg-white px-4 py-3 text-base font-medium leading-relaxed text-[#2d2218] ring-1 ring-[#e8dcc8] sm:px-5 sm:py-4 sm:text-lg">{own ? simpleText : a.summary.text}</p>

      {a.water.series.length > 0 && (
        <div className="mt-5 min-w-0">
          <PlantScene
            own={own}
            key={`${own?.plantedOn ?? ""}-${own?.harvestedOn ?? ""}-${own?.totalDays ?? ""}-${a.period?.start}-${a.period?.end}-${a.ndvi.count}-${a.ndvi.peak?.value ?? "x"}-${a.water.rain.seasonTotalMm ?? "x"}`}
            a={a}
          />
        </div>
      )}

      {watch.length > 0 || (!own && dips.length > 0) ? (
        <>
          <h4 className="mt-7 text-lg font-extrabold text-[#2d2218]">{own ? "Problems for your plant" : "What to watch"}</h4>
          <ul className="mt-3 space-y-2">
            {watch.map((g) => (
              <li key={g.kind} className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-base text-[#2d2218] ring-1 ring-[#e8dcc8]">
                <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${MARKER[g.kind].dot}`} aria-hidden />
                <span className="min-w-0"><span className="font-semibold">{MARKER[g.kind].name}</span> · {range(g.start, g.end)}</span>
              </li>
            ))}
            {(own ? [] : dips).map((d) => (
              <li key={d.from} className="flex items-start gap-3 rounded-2xl bg-red-50 px-4 py-3 text-base text-red-900 ring-1 ring-red-100">
                <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" aria-hidden />
                <span className="min-w-0"><span className="font-semibold">Plants lost some greenness</span> · {range(d.from, d.to)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-7 rounded-2xl bg-[#e7f3ea] px-4 py-3 text-base font-semibold text-[#1f7a3d] ring-1 ring-[#1f7a3d]/20">
          {own ? "No problems found for your plant." : "No heat, flood or dry-soil problems found in this period."}
        </p>
      )}

      {!own && a.notes.length > 0 && (
        <details className="mt-6 rounded-2xl bg-white px-4 py-3 ring-1 ring-[#e8dcc8]">
          <summary className="cursor-pointer text-sm font-bold text-[#5a3e28]">Notes and limits</summary>
          <ul className="mt-3 space-y-1.5">
            {a.notes.map((n, i) => (
              <li key={i} className="text-sm text-[#6b5240]">ⓘ {n.text}<Tag r={n.reliability} /></li>
            ))}
          </ul>
        </details>
      )}
    </Shell>
  );
}