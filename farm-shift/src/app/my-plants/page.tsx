"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { AuthModal } from "@/components/AuthModal";
import PlotHealth from "@/components/PlotHealth";
import { addLog, deletePlot, listLogs, listPlots, type LogKind, type Plot, type PlotLog } from "@/app/api/environment/plantsApi";
import { growth, tipFor } from "@/types/cropingInfo";
import { haToAcre } from "@/types/geo";
import { shortDate } from "@/lib/format";

const ACTIONS: { kind: Exclude<LogKind, "harvest">; label: string }[] = [
  { kind: "water", label: "Watered" },
  { kind: "fertilize", label: "Fertilised" },
  { kind: "weed", label: "Weeded" },
  { kind: "pest", label: "Checked pests" },
  { kind: "note", label: "Add note" },
];
const KIND_LABEL: Record<LogKind, string> = {
  water: "Watered", fertilize: "Fertilised", weed: "Weeded", pest: "Checked pests", note: "Note", harvest: "Harvested",
};

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

export default function MyPlants() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [logs, setLogs] = useState<PlotLog[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"growing" | "harvested">("growing");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [p, l] = await Promise.all([listPlots(), listLogs()]);
      setPlots(p); setLogs(l); setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? "Could not load your plants.");
    }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (plots ?? []).filter((p) => p.status === tab), [plots, tab]);

  return (
    <main className="min-h-screen text-stone-900">
      <header className="bg-emerald-700 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-6">
          <div>
            <Link href="/" className="text-sm font-medium text-emerald-100 hover:underline">← Back to the map</Link>
            <h1 className="mt-1 text-3xl font-extrabold">My plants</h1>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Hi, {user.username}</span>
              <button onClick={async () => { await signOut(); setPlots(null); }} className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">Log out</button>
            </div>
          )}
        </div>
        <div className="h-1.5 bg-stone-700" />
      </header>

      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 pb-16">
        {authLoading ? (
          <p className="text-stone-500">Loading…</p>
        ) : !user ? (
          <div className="rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50/70 px-4 py-10 text-center">
            <p className="text-lg font-medium text-emerald-900/80">Log in to see the plants you are growing.</p>
            <button onClick={() => setAuthOpen(true)} className="mt-4 rounded-full bg-emerald-700 px-6 py-2.5 font-bold text-white hover:bg-emerald-800">Log in / Register</button>
          </div>
        ) : (
          <>
            {err && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div>}
            <div className="flex gap-2">
              {(["growing", "harvested"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`rounded-full px-5 py-2.5 text-base font-semibold ring-1 ${tab === t ? "bg-emerald-700 text-white ring-emerald-700" : "bg-white text-stone-700 ring-stone-300 hover:bg-emerald-50"}`}>
                  {t === "growing" ? "Growing now" : "Harvested"}
                </button>
              ))}
            </div>

            {!plots && !err && <p className="text-stone-500">Loading your plants…</p>}
            {plots && shown.length === 0 && (
              <div className="rounded-3xl border-2 border-dashed border-stone-300 px-4 py-10 text-center text-stone-600">
                {tab === "growing" ? (
                  <>Nothing growing yet. <Link href="/" className="font-bold text-emerald-800 underline">Drop a pin on the map</Link> and pick a plant.</>
                ) : "No harvested plots yet."}
              </div>
            )}
            {shown.map((p) => (
              <PlotCard key={p.id} plot={p} logs={logs.filter((l) => l.plot_id === p.id)} onChange={load} onError={setErr} />
            ))}
          </>
        )}
      </div>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => window.location.reload()} />
    </main>
  );
}

function PlotCard({ plot: p, logs, onChange, onError }: { plot: Plot; logs: PlotLog[]; onChange: () => void; onError: (m: string | null) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const g = growth(p.plant, p.planted_on);
  const tip = tipFor(p.region, p.plant);
  const last = (k: LogKind) => logs.find((l) => l.kind === k);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); onError(null);
    try { await fn(); setNote(""); await onChange(); } catch (e: any) { onError(e?.message ?? "Something went wrong."); } finally { setBusy(false); }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-stone-200/70 bg-white shadow-[0_18px_40px_-24px_rgba(29,112,47,0.35)]">
      <div className="bg-emerald-600 px-6 py-4 text-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-extrabold">{p.plant}</h2>
          <span className="text-sm font-medium opacity-90">
            {p.region ?? "Myanmar"}{p.area_ha ? ` · ${p.area_ha.toFixed(2)} ha (${haToAcre(p.area_ha).toFixed(1)} acres)` : ""}
          </span>
        </div>
        <p className="mt-1 text-base opacity-95">
          {p.status === "harvested" ? `Harvested ${p.harvested_on ? shortDate(p.harvested_on) : ""}` : `Day ${g.days} · ${g.stage}`} · planted {shortDate(p.planted_on)}
        </p>
        {p.status === "growing" && g.pct !== null && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-white/30"><div className="h-full bg-white" style={{ width: `${Math.round(g.pct * 100)}%` }} /></div>
            <p className="mt-1 text-xs opacity-90">{g.left ? `About ${g.left} days until the earliest usual harvest (rough estimate)` : "Usual harvest time has arrived"}</p>
          </div>
        )}
      </div>

      <div className="space-y-4 p-5">
        <PlotHealth plant={p.plant} plantedOn={p.planted_on} endedOn={p.harvested_on} lat={p.lat} lon={p.lon} title={`My ${p.plant}`} />

        {tip && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200/70">Tip for {p.plant}: {tip}</p>}

        {p.status === "growing" && (
          <div>
            <h3 className="text-base font-bold">Look after it</h3>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional note (e.g. 2 hours, 50 kg urea)" className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            <div className="mt-2 flex flex-wrap gap-2">
              {ACTIONS.map((a) => (
                <button key={a.kind} disabled={busy || (a.kind === "note" && !note.trim())} onClick={() => run(() => addLog(p.id, a.kind, note))}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-50 disabled:opacity-40">
                  {a.label}
                  {a.kind !== "note" && <span className="ml-1.5 text-xs font-normal text-stone-500">{last(a.kind) ? ago(last(a.kind)!.created_at) : "not yet"}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <details className="rounded-2xl border border-stone-200 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-stone-700">History ({logs.length})</summary>
            <ul className="mt-2 space-y-1.5">
              {logs.slice(0, 20).map((l) => (
                <li key={l.id} className="text-sm text-stone-700"><span className="font-semibold">{KIND_LABEL[l.kind]}</span> · {ago(l.created_at)}{l.note ? ` · ${l.note}` : ""}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {p.status === "growing" ? (
            <button disabled={busy} onClick={() => confirm(`Mark ${p.plant} as harvested?`) && run(() => addLog(p.id, "harvest"))}
              className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Mark as harvested</button>
          ) : <span />}
          <button disabled={busy} onClick={() => confirm(`Delete this ${p.plant} plot and its history?`) && run(() => deletePlot(p.id))}
            className="rounded-full px-4 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">Delete</button>
        </div>
      </div>
    </section>
  );
}