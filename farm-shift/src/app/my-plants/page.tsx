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

const dayWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

const daysGrown = (planted: string, harvested: string) =>
  Math.max(0, Math.round((Date.parse(harvested.slice(0, 10)) - Date.parse(planted.slice(0, 10))) / 86_400_000));

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
  const counts = useMemo(() => ({
    growing: (plots ?? []).filter((p) => p.status === "growing").length,
    harvested: (plots ?? []).filter((p) => p.status === "harvested").length,
  }), [plots]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#faf6ef] text-[#2d2218]">
      {/* top bar */}
      <nav className="sticky top-0 z-40 border-b border-[#e8dcc8] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-[#5a3e28] hover:text-[#1f7a3d]">
            <span aria-hidden>←</span> Back to the map
          </Link>
          {user && (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm font-medium text-[#8a6a4c] sm:inline">Hi, {user.username}</span>
              <button onClick={async () => { await signOut(); setPlots(null); }} className="rounded-full bg-[#f3ece0] px-4 py-2 text-sm font-semibold text-[#5a3e28] hover:bg-[#e8dcc8]">Log out</button>
            </div>
          )}
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-4 pb-16">
        {/* hero */}
        <header className="pb-6 pt-10 md:pt-14">
          <p className="text-sm font-bold uppercase tracking-widest text-[#8a6a4c]">Your fields</p>
          <h1 className="mt-2 text-4xl font-extrabold leading-[1.05] tracking-tight text-[#1f7a3d] md:text-6xl">My plants</h1>
          <p className="mt-3 max-w-xl text-lg text-[#6b5240]">Watch each plant grow, note what you did, and harvest when it is ready.</p>
        </header>

        {authLoading ? (
          <p className="text-[#8a6a4c]">Loading…</p>
        ) : !user ? (
          <div className="rounded-3xl border-2 border-dashed border-[#d9c9b0] bg-white/60 px-5 py-12 text-center">
            <p className="text-lg font-semibold text-[#5a3e28]">Log in to see the plants you are growing.</p>
            <button onClick={() => setAuthOpen(true)} className="mt-5 rounded-full bg-[#1f7a3d] px-7 py-3 text-base font-bold text-white hover:bg-[#186230]">Log in / Register</button>
          </div>
        ) : (
          <>
            {err && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div>}

            {/* segmented tabs */}
            <div className="inline-flex rounded-full bg-[#f3ece0] p-1 ring-1 ring-[#e8dcc8]">
              {(["growing", "harvested"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`rounded-full px-5 py-2.5 text-base font-bold transition ${tab === t ? "bg-[#1f7a3d] text-white shadow-sm" : "text-[#5a3e28] hover:text-[#1f7a3d]"}`}>
                  {t === "growing" ? "Growing now" : "Harvested"}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${tab === t ? "bg-white/20" : "bg-white text-[#8a6a4c]"}`}>{counts[t]}</span>
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-8">
              {!plots && !err && <p className="text-[#8a6a4c]">Loading your plants…</p>}
              {plots && shown.length === 0 && (
                <div className="rounded-3xl border-2 border-dashed border-[#d9c9b0] bg-white/60 px-5 py-12 text-center text-[#6b5240]">
                  {tab === "growing" ? (
                    <>Nothing growing yet. <Link href="/" className="font-bold text-[#1f7a3d] underline">Drop a pin on the map</Link> and pick a plant.</>
                  ) : "No harvested plots yet."}
                </div>
              )}
              {shown.map((p) => (
                <PlotCard key={p.id} plot={p} logs={logs.filter((l) => l.plot_id === p.id)} onChange={load} onError={setErr} />
              ))}
            </div>
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
  const harvested = p.status === "harvested";
  const district = (p as Plot & { district?: string | null }).district; // set once the plot saves its district
  const grownDays = harvested && p.harvested_on ? daysGrown(p.planted_on, p.harvested_on) : null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); onError(null);
    try { await fn(); setNote(""); await onChange(); } catch (e: any) { onError(e?.message ?? "Something went wrong."); } finally { setBusy(false); }
  };

  return (
    <article className="overflow-hidden rounded-[2rem] bg-white shadow-[0_20px_50px_-30px_rgba(90,62,40,0.5)] ring-1 ring-[#e8dcc8]">
      {/* heading */}
      <header className="px-6 pb-5 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-[#8a6a4c]">
              {district ? `${district} District · ` : ""}{p.region ?? "Myanmar"}{p.area_ha ? ` · ${p.area_ha.toFixed(2)} ha (${haToAcre(p.area_ha).toFixed(1)} acres)` : ""}
            </p>
            <h2 className="mt-1 text-3xl font-extrabold leading-tight text-[#1f7a3d] md:text-4xl">{p.plant}</h2>
          </div>
          <span className={`rounded-full px-4 py-2 text-sm font-bold ring-1 ${harvested ? "bg-[#f3ece0] text-[#5a3e28] ring-[#e8dcc8]" : "bg-[#e7f3ea] text-[#1f7a3d] ring-[#1f7a3d]/25"}`}>
            {harvested ? "Harvested" : `Day ${g.days} · ${g.days < 4 ? "Just planted" : g.stage}`}
          </span>
        </div>

        <p className="mt-2 text-base text-[#6b5240]">
          Planted {shortDate(p.planted_on)}
          {harvested && p.harvested_on ? ` · harvested ${shortDate(p.harvested_on)}${grownDays !== null ? ` after ${dayWord(grownDays)}` : ""}` : ""}
        </p>

        {!harvested && g.pct !== null && (
          <div className="mt-4">
            <div className="h-3 overflow-hidden rounded-full bg-[#f3ece0]">
              <div className="h-full rounded-full bg-[#1f7a3d]" style={{ width: `${Math.max(3, Math.round(g.pct * 100))}%` }} />
            </div>
            <p className="mt-1.5 text-sm text-[#8a6a4c]">{g.left ? `About ${g.left} days until the earliest usual harvest (rough estimate)` : "Usual harvest time has arrived"}</p>
          </div>
        )}
      </header>

      <div className="space-y-6 border-t border-[#f0e7d6] p-6">
        <PlotHealth plant={p.plant} plantedOn={p.planted_on} endedOn={p.harvested_on} lat={p.lat} lon={p.lon} title={`My ${p.plant}`} />

        {tip && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-base text-amber-900 ring-1 ring-amber-200/70">Tip for {p.plant}: {tip}</p>}

        {/* care */}
        {!harvested && (
          <div>
            <h3 className="text-xl font-extrabold text-[#2d2218]">Look after it</h3>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional note (e.g. 2 hours, 50 kg urea)"
              className="mt-3 w-full rounded-2xl border border-[#e8dcc8] bg-[#faf6ef] px-4 py-3 text-base outline-none focus:border-[#1f7a3d] focus:ring-2 focus:ring-[#1f7a3d]/20" />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {ACTIONS.map((a) => (
                <button key={a.kind} disabled={busy || (a.kind === "note" && !note.trim())} onClick={() => run(() => addLog(p.id, a.kind, note))}
                  className="flex flex-col items-start rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-[#e8dcc8] transition hover:bg-[#f1f8f2] hover:ring-[#1f7a3d]/40 disabled:opacity-40">
                  <span className="text-base font-bold text-[#1f7a3d]">{a.label}</span>
                  {a.kind !== "note" && <span className="text-xs text-[#8a6a4c]">{last(a.kind) ? ago(last(a.kind)!.created_at) : "not yet"}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* history timeline */}
        {logs.length > 0 && (
          <details className="group rounded-2xl bg-[#faf6ef] px-4 py-3 ring-1 ring-[#e8dcc8]">
            <summary className="cursor-pointer text-base font-bold text-[#5a3e28]">History ({logs.length})</summary>
            <ul className="mt-3 space-y-3 border-l-2 border-[#e8dcc8] pl-4">
              {logs.slice(0, 20).map((l) => (
                <li key={l.id} className="relative text-base text-[#2d2218]">
                  <span className="absolute -left-[1.4rem] top-2 h-2.5 w-2.5 rounded-full bg-[#1f7a3d]" />
                  <span className="font-bold">{KIND_LABEL[l.kind]}</span> <span className="text-[#8a6a4c]">· {ago(l.created_at)}</span>
                  {l.note && <span className="block text-sm text-[#6b5240]">{l.note}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f0e7d6] pt-5">
          {!harvested ? (
            <button disabled={busy} onClick={() => confirm(`Mark ${p.plant} as harvested?`) && run(() => addLog(p.id, "harvest"))}
              className="rounded-full bg-[#1f7a3d] px-6 py-3 text-base font-bold text-white hover:bg-[#186230] disabled:opacity-50">Mark as harvested</button>
          ) : <span />}
          <button disabled={busy} onClick={() => confirm(`Delete this ${p.plant} plot and its history?`) && run(() => deletePlot(p.id))}
            className="rounded-full px-5 py-3 text-sm font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">Delete</button>
        </div>
      </div>
    </article>
  );
}