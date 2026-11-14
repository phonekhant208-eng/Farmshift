"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import ZoneEditor from "@/components/ZoneEditor";
import { useAuth } from "@/lib/AuthContext";
import { listPlots, type Plot } from "@/app/api/environment/plantsApi";
import { distanceKm } from "../types/geo";
import { AREA_NAMES, areaData, findArea, growth } from "../types/cropingInfo";

const NEAR_KM = 2; // the globe pin is only accurate to roughly this much

export default function FieldStatus({
  coords, regionName, onLoginClick,
}: {
  coords: { lat: number; lon: number } | null; regionName: string | null; onLoginClick: () => void;
}) {
  const { user } = useAuth();
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [areaPick, setAreaPick] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [growing, setGrowing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) { setPlots(null); return; }
    try { setPlots(await listPlots()); setErr(null); } catch (e: any) { setErr(e?.message ?? "Could not load your plots."); }
  }, [user]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setShowSuggest(false); }, [coords?.lat, coords?.lon]);

  const here = useMemo(
    () => (coords && plots ? plots.filter((p) => p.status === "growing" && distanceKm(coords, p) <= NEAR_KM) : []),
    [coords, plots]
  );

  if (!coords) return null;

  if (!user) {
    return (
      <Card title="What can you grow here?" subtitle="Log in to save your plants and get suggestions" icon="leaf">
        <button onClick={onLoginClick} className="rounded-full bg-emerald-700 px-6 py-2.5 text-base font-bold text-white hover:bg-emerald-800">Log in / Register</button>
      </Card>
    );
  }

  const area = findArea(regionName) ?? (areaPick || null);
  const data = areaData(area);
  const suggestionsOpen = here.length === 0 || showSuggest;

  return (
    <Card title="Your plants here" subtitle={`Checked within ${NEAR_KM} km of your pin`} icon="leaf">
      {err && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      {!plots && !err && <p className="text-stone-500">Checking your plots…</p>}

      {plots && here.length > 0 && (
        <div className="space-y-2">
          <p className="text-base font-semibold text-emerald-800">You already have {here.length === 1 ? "a plant" : `${here.length} plants`} growing here.</p>
          {here.map((p) => {
            const g = growth(p.plant, p.planted_on);
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
                <div>
                  <div className="text-lg font-bold text-stone-900">{p.plant}</div>
                  <div className="text-sm text-stone-600">Day {g.days} · {g.stage}</div>
                </div>
                <Link href="/my-plants" className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">Watch</Link>
              </div>
            );
          })}
          {!showSuggest && (
            <button onClick={() => setShowSuggest(true)} className="mt-1 text-sm font-semibold text-emerald-800 underline">Grow something else nearby</button>
          )}
        </div>
      )}

      {plots && here.length === 0 && (
        <p className="mb-3 text-base font-medium text-stone-700">Nothing of yours is growing here yet. Pick a plant below and mark your field.</p>
      )}

      {plots && suggestionsOpen && (
        <div className={here.length ? "mt-4" : ""}>
          {!findArea(regionName) && (
            <label className="mb-3 block text-sm font-medium text-stone-700">
              Which state or region is this?
              <select value={areaPick} onChange={(e) => setAreaPick(e.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2">
                <option value="">Choose…</option>
                {AREA_NAMES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          )}

          {data && (
            <>
              <h3 className="text-base font-bold text-stone-900">Good plants for {data.region}</h3>
              <ul className="mt-2 space-y-2">
                {data.five_recommended_plants.map((s) => (
                  <li key={s.plant} className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-bold text-stone-900">{s.plant}</div>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">{s.suitability} fit</span>
                      </div>
                      <button onClick={() => setGrowing(s.plant)} className="shrink-0 rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800">Grow this</button>
                    </div>
                    <p className="mt-2 text-sm text-stone-700">{s.reason}</p>
                    <p className="mt-1 text-sm text-stone-500">Tip: {s.farmer_tip}</p>
                  </li>
                ))}
              </ul>

              <details className="mt-3 rounded-2xl border border-stone-200 px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-stone-700">Crop rotation ideas</summary>
                <ul className="mt-2 space-y-2">
                  {data.three_agricultural_cycles.map((c) => (
                    <li key={c.cycle_name} className="text-sm text-stone-700">
                      <span className="font-semibold">{c.cycle_name}</span>: {c.sequence}
                      <div className="text-stone-500">{c.benefit}</div>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>
      )}

      {growing && (
        <ZoneEditor coords={coords} plant={growing} area={area} onClose={() => setGrowing(null)} onSaved={load} />
      )}
    </Card>
  );
}