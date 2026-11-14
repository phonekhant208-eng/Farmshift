"use client";
import { useEffect, useState } from "react";
import PlantHealthCard from "./PlantHealthCard";
import { Skeleton } from "./ui";
import type { ApiResponse } from "@/types/dashboard";
import type { PlantHealthResult } from "@/types/plantHealth";
import { growth } from "@/types/cropingInfo";

const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

/** 3D plant health for ONE plot: NASA data from the planting date at the plot's own location. */
export default function PlotHealth({
  plant, plantedOn, endedOn, lat, lon, title,
}: {
  plant: string; plantedOn: string; endedOn?: string | null; lat: number; lon: number; title?: string;
}) {
  const [analysis, setAnalysis] = useState<PlantHealthResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setBusy(true); setErr(null); setAnalysis(null);
    // NASA data lags ~3 days, so a freshly planted plot has none since planting. Ask for at least the last 21 days.
    const planted = plantedOn.slice(0, 10);
    const minStart = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);
    let start = planted < minStart ? planted : minStart;
    if (endedOn && start > endedOn.slice(0, 10)) start = planted;
    const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), startDate: ymd(start) });
    if (endedOn) q.set("endDate", ymd(endedOn));
    fetch(`/api/environment?${q}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: ApiResponse) => {
        if (!j.success) {
          setErr(/startDate/.test(j.error) ? "Satellite data arrives a few days after planting. Check back soon." : j.error);
          return;
        }
        const a = j.evaluation.module4_vegetation?.analysis ?? null;
        if (!a || !a.water.series.length) setErr("No plant data for this field yet.");
        else setAnalysis(a);
      })
      .catch((e) => { if (e.name !== "AbortError") setErr("Could not reach the server."); })
      .finally(() => { if (!ctrl.signal.aborted) setBusy(false); });
    return () => ctrl.abort();
  }, [lat, lon, plantedOn, endedOn]);

  if (busy) return <Skeleton className="h-96" />;
  if (err) return <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{err}</p>;

  const g = growth(plant, plantedOn);
  const totalDays = g.pct && g.pct > 0 && g.pct < 1 ? Math.round(g.days / g.pct) : null; // days to the usual harvest
  return <PlantHealthCard analysis={analysis} title={title} own={{ plant, plantedOn, totalDays }} />;
}