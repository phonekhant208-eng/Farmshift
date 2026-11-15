"use client";
import { useState } from "react";
import PlotHealth from "@/components/PlotHealth";
import { addLog, deletePlot, type LogKind, type Plot, type PlotLog } from "@/app/api/environment/plantsApi";
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

type Tab = "health" | "care" | "history";

export default function PlantDetail({
  plot: p,
  logs,
  onBack,
  onChange,
}: {
  plot: Plot;
  logs: PlotLog[];
  onBack: () => void;
  onChange: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<Tab>("health");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const g = growth(p.plant, p.planted_on);
  const tip = tipFor(p.region, p.plant);
  const harvested = p.status === "harvested";
  const last = (k: LogKind) => logs.find((l) => l.kind === k);
  const grownDays = harvested && p.harvested_on ? daysGrown(p.planted_on, p.harvested_on) : null;

  const run = async (fn: () => Promise<unknown>, afterDelete = false) => {
    setBusy(true); setErr(null);
    try {
      await fn();
      setNote("");
      await onChange();
      if (afterDelete) onBack();
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "health", label: "Health" },
    ...(harvested ? [] : [{ key: "care" as const, label: "Care" }]),
    { key: "history", label: `History${logs.length ? ` (${logs.length})` : ""}` },
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#faf6ef] text-[#2d2218]">
      <nav className="sticky top-0 z-40 border-b border-[#e8dcc8] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-[#5a3e28] hover:text-[#1f7a3d]">
            <span aria-hidden>←</span> My plants
          </button>
          <span className="truncate text-sm font-bold text-[#1f7a3d]">{p.plant}</span>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        {err && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{err}</div>}

        {/* summary */}
        <header className="rounded-3xl bg-white p-5 ring-1 ring-[#e8dcc8]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold leading-tight text-[#1f7a3d] md:text-4xl">{p.plant}</h1>
              <p className="mt-1 text-sm text-[#8a6a4c]">
                {p.region ?? "Myanmar"}{p.area_ha ? `, ${p.area_ha.toFixed(2)} ha (${haToAcre(p.area_ha).toFixed(1)} acres)` : ""}
              </p>
            </div>
            <span className={`rounded-full px-4 py-2 text-sm font-bold ring-1 ${harvested ? "bg-[#f3ece0] text-[#5a3e28] ring-[#e8dcc8]" : "bg-[#e7f3ea] text-[#1f7a3d] ring-[#1f7a3d]/25"}`}>
              {harvested ? "Harvested" : `Day ${g.days} · ${g.days < 4 ? "Just planted" : g.stage}`}
            </span>
          </div>

          <p className="mt-3 text-base text-[#6b5240]">
            Planted {shortDate(p.planted_on)}
            {harvested && p.harvested_on ? `, harvested ${shortDate(p.harvested_on)}${grownDays !== null ? ` after ${dayWord(grownDays)}` : ""}` : ""}
          </p>

          {!harvested && g.pct !== null && (
            <div className="mt-4">
              <div className="h-3 overflow-hidden rounded-full bg-[#f3ece0]">
                <div className="h-full rounded-full bg-[#1f7a3d]" style={{ width: `${Math.max(3, Math.round(g.pct * 100))}%` }} />
              </div>
              <p className="mt-1.5 text-sm text-[#8a6a4c]">
                {g.left ? `About ${g.left} days until the earliest usual harvest (rough estimate)` : "Usual harvest time has arrived"}
              </p>
            </div>
          )}
        </header>

        {/* tabs */}
        <div className="mt-5 inline-flex max-w-full overflow-x-auto rounded-full bg-[#f3ece0] p-1 ring-1 ring-[#e8dcc8]" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-full px-5 py-2.5 text-base font-bold transition ${tab === t.key ? "bg-[#1f7a3d] text-white shadow-sm" : "text-[#5a3e28] hover:text-[#1f7a3d]"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-5">
          {tab === "health" && (
            <>
              <PlotHealth plant={p.plant} plantedOn={p.planted_on} endedOn={p.harvested_on} lat={p.lat} lon={p.lon} title={`My ${p.plant}`} />
              {tip && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-base text-amber-900 ring-1 ring-amber-200/70">Tip for {p.plant}: {tip}</p>}
            </>
          )}

          {tab === "care" && !harvested && (
            <div className="rounded-3xl bg-white p-5 ring-1 ring-[#e8dcc8]">
              <h2 className="text-xl font-extrabold text-[#2d2218]">Look after it</h2>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional note (e.g. 2 hours, 50 kg urea)"
                className="mt-3 w-full rounded-2xl border border-[#e8dcc8] bg-[#faf6ef] px-4 py-3 text-base outline-none focus:border-[#1f7a3d] focus:ring-2 focus:ring-[#1f7a3d]/20" />
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
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

          {tab === "history" && (
            <div className="rounded-3xl bg-white p-5 ring-1 ring-[#e8dcc8]">
              {logs.length === 0 ? (
                <p className="text-base text-[#6b5240]">Nothing logged yet.{!harvested && " Use the Care tab to add your first entry."}</p>
              ) : (
                <ul className="space-y-3 border-l-2 border-[#e8dcc8] pl-4">
                  {logs.slice(0, 50).map((l) => (
                    <li key={l.id} className="relative text-base text-[#2d2218]">
                      <span className="absolute -left-[1.4rem] top-2 h-2.5 w-2.5 rounded-full bg-[#1f7a3d]" />
                      <span className="font-bold">{KIND_LABEL[l.kind]}</span> <span className="text-[#8a6a4c]">· {ago(l.created_at)}</span>
                      {l.note && <span className="block text-sm text-[#6b5240]">{l.note}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f0e7d6] pt-5">
            {!harvested ? (
              <button disabled={busy} onClick={() => confirm(`Mark ${p.plant} as harvested?`) && run(() => addLog(p.id, "harvest"))}
                className="rounded-full bg-[#1f7a3d] px-6 py-3 text-base font-bold text-white hover:bg-[#186230] disabled:opacity-50">Mark as harvested</button>
            ) : <span />}
            <button disabled={busy} onClick={() => confirm(`Delete this ${p.plant} plot and its history?`) && run(() => deletePlot(p.id), true)}
              className="rounded-full px-5 py-3 text-sm font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">Delete</button>
          </div>
        </div>
      </div>
    </main>
  );
}
