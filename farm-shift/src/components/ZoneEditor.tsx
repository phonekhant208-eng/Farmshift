"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ZoneMap, { type OtherZone } from "./ZoneMap";
import { areaHa, centroid, haToAcre, type LatLon } from "@/types/geo";
import { createPlot, listAllZones, type PublicPlot } from "@/app/api/environment/plantsApi";
import { selfIntersects, zonesOverlap } from "@/components/ZoneOverlap";
import { growth } from "@/types/cropingInfo";

export default function ZoneEditor({
  coords, plant, area, onClose, onSaved,
}: {
  coords: { lat: number; lon: number }; plant: string; area: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [zone, setZone] = useState<LatLon[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [taken, setTaken] = useState<PublicPlot[]>([]);
  const ha = useMemo(() => areaHa(zone), [zone]);

  useEffect(() => { listAllZones().then((r) => setTaken(r.plots)).catch(() => {}); }, []);

  const others = useMemo<OtherZone[]>(
    () => taken.map((t) => ({ id: t.id, zone: t.zone, mine: t.is_mine, title: `${t.plant} · ${t.owner}`, detail: `${growth(t.plant, t.planted_on).stage}` })),
    [taken],
  );

  const problem = useMemo(() => {
    if (zone.length < 3) return null;
    if (selfIntersects(zone)) return "The lines cross each other. Undo a corner and tap the corners in order around the field.";
    const hit = taken.find((t) => zonesOverlap(zone, t.zone));
    return hit ? `This overlaps ${hit.is_mine ? "one of your own plots" : `${hit.owner}'s ${hit.plant} field`}. Move your corners onto free land.` : null;
  }, [zone, taken]);

  const save = async () => {
    if (zone.length < 3) return setErr("Tap at least 3 corners of your field on the map.");
    if (problem) return setErr(problem);
    setBusy(true); setErr(null);
    try {
      const c = centroid(zone);
      await createPlot({ plant, region: area, lat: c[0], lon: c[1], zone, areaHa: ha, plantedOn: date });
      setDone(true);
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save."); // the database also rejects overlaps (someone may have just planted there)
      listAllZones().then((r) => setTaken(r.plots)).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="py-6 text-center">
            <h2 className="text-2xl font-bold text-emerald-800">{plant} is added</h2>
            <p className="mt-2 text-stone-600">You can now watch and look after it on your plants screen.</p>
            <div className="mt-5 flex justify-center gap-3">
              <Link href="/my-plants" className="rounded-full bg-emerald-700 px-6 py-2.5 font-bold text-white hover:bg-emerald-800">Open My plants</Link>
              <button onClick={onClose} className="rounded-full px-6 py-2.5 font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">Close</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-stone-900">Mark where you grow {plant}</h2>
                <p className="mt-1 text-sm text-stone-600">Zoom in on your field, then tap its corners (at least 3). The orange circle is your pin. Brown areas are already used by other farmers.</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100">✕</button>
            </div>

            <div className="mt-4">
              <ZoneMap center={[coords.lat, coords.lon]} zoom={16} zone={zone} onChange={setZone} editable others={others} invalid={!!problem} className="h-80" />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={() => setZone((z) => z.slice(0, -1))} disabled={!zone.length} className="rounded-full px-4 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-40">Undo corner</button>
              <button onClick={() => setZone([])} disabled={!zone.length} className="rounded-full px-4 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-40">Clear</button>
              <span className="text-sm text-stone-600">
                {zone.length < 3 ? `${zone.length} corner(s) so far` : `≈ ${ha.toFixed(2)} ha (${haToAcre(ha).toFixed(1)} acres)`}
              </span>
            </div>

            {problem && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{problem}</p>}

            <label className="mt-4 block text-sm font-medium text-stone-700">
              Date planted (or planting soon)
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900" />
            </label>

            {err && !problem && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</p>}

            <button onClick={save} disabled={busy || !!problem} className="mt-4 w-full rounded-full bg-emerald-700 py-3 text-base font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
              {busy ? "Saving…" : "Save this plot"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}