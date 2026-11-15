"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { AuthModal } from "@/components/AuthModal";
import { listLogs, listPlots, type Plot, type PlotLog } from "@/app/api/environment/plantsApi";
import { growth } from "@/types/cropingInfo";
import { haToAcre } from "@/types/geo";
import { shortDate } from "@/lib/format";
import PlantDetail from "./detail";

export default function MyPlants() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [logs, setLogs] = useState<PlotLog[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"growing" | "harvested">("growing");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

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

  const counts = useMemo(() => ({
    growing: (plots ?? []).filter((p) => p.status === "growing").length,
    harvested: (plots ?? []).filter((p) => p.status === "harvested").length,
  }), [plots]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (plots ?? []).filter((p) => {
      if (p.status !== tab) return false;
      if (q && !`${p.plant} ${p.region ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [plots, tab, query]);

  const open = (id: string) => { setOpenId(id); window.scrollTo({ top: 0 }); };
  const openPlot = (plots ?? []).find((p) => String(p.id) === openId) ?? null;

  /* ---------------------------- detail screen ---------------------------- */
  if (openPlot) {
    return (
      <PlantDetail
        plot={openPlot}
        logs={logs.filter((l) => l.plot_id === openPlot.id)}
        onBack={() => setOpenId(null)}
        onChange={load}
      />
    );
  }

  /* ----------------------------- list screen ----------------------------- */
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#faf6ef] text-[#2d2218]">
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
        <header className="pb-5 pt-8 md:pt-10">
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-[#1f7a3d] md:text-5xl">My plants</h1>
          <p className="mt-2 text-base text-[#6b5240]">Tap a plant to see its health, care and history.</p>
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

            {/* search */}
            <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-[#e8dcc8] focus-within:ring-2 focus-within:ring-[#1f7a3d]/50">
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[#8a6a4c]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by plant or region"
                aria-label="Search plants"
                className="w-full bg-transparent text-base placeholder:text-[#a89078] focus:outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="shrink-0 rounded-full bg-[#f3ece0] px-3 py-1 text-xs font-bold text-[#5a3e28] hover:bg-[#e8dcc8]">Clear</button>
              )}
            </label>

            {/* tabs */}
            <div className="mt-4 inline-flex rounded-full bg-[#f3ece0] p-1 ring-1 ring-[#e8dcc8]">
              {(["growing", "harvested"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`rounded-full px-5 py-2.5 text-base font-bold transition ${tab === t ? "bg-[#1f7a3d] text-white shadow-sm" : "text-[#5a3e28] hover:text-[#1f7a3d]"}`}>
                  {t === "growing" ? "Growing now" : "Harvested"}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${tab === t ? "bg-white/20" : "bg-white text-[#8a6a4c]"}`}>{counts[t]}</span>
                </button>
              ))}
            </div>

            {/* list */}
            <div className="mt-5">
              {!plots && !err && <p className="text-[#8a6a4c]">Loading your plants…</p>}

              {plots && shown.length === 0 && (
                <div className="rounded-3xl border-2 border-dashed border-[#d9c9b0] bg-white/60 px-5 py-12 text-center text-[#6b5240]">
                  {query ? (
                    <>No plants match “{query}”.</>
                  ) : tab === "growing" ? (
                    <>Nothing growing yet. <Link href="/" className="font-bold text-[#1f7a3d] underline">Drop a pin on the map</Link> and pick a plant.</>
                  ) : "No harvested plots yet."}
                </div>
              )}

              <ul className="grid gap-3 sm:grid-cols-2">
                {shown.map((p) => <PlotRow key={p.id} plot={p} onOpen={() => open(String(p.id))} />)}
              </ul>
            </div>
          </>
        )}
      </div>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => window.location.reload()} />
    </main>
  );
}

/** Compact card. Tapping it opens the detail screen. */
function PlotRow({ plot: p, onOpen }: { plot: Plot; onOpen: () => void }) {
  const g = growth(p.plant, p.planted_on);
  const harvested = p.status === "harvested";

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-3xl bg-white p-4 text-left ring-1 ring-[#e8dcc8] transition hover:ring-[#1f7a3d]/40 hover:shadow-[0_16px_40px_-28px_rgba(90,62,40,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f7a3d]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-extrabold text-[#1f7a3d]">{p.plant}</h2>
            <p className="truncate text-sm text-[#8a6a4c]">
              {p.region ?? "Myanmar"}{p.area_ha ? `, ${haToAcre(p.area_ha).toFixed(1)} acres` : ""}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${harvested ? "bg-[#f3ece0] text-[#5a3e28] ring-[#e8dcc8]" : "bg-[#e7f3ea] text-[#1f7a3d] ring-[#1f7a3d]/25"}`}>
            {harvested ? "Harvested" : g.days < 4 ? "Just planted" : g.stage}
          </span>
        </div>

        {!harvested && g.pct !== null && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f3ece0]">
            <div className="h-full rounded-full bg-[#1f7a3d]" style={{ width: `${Math.max(3, Math.round(g.pct * 100))}%` }} />
          </div>
        )}

        <p className="mt-3 text-sm text-[#6b5240]">
          {harvested && p.harvested_on
            ? `Harvested ${shortDate(p.harvested_on)}`
            : `Day ${g.days}${g.left ? `, about ${g.left} days to go` : ""}`}
          <span className="text-[#a89078]"> · planted {shortDate(p.planted_on)}</span>
        </p>
      </button>
    </li>
  );
}