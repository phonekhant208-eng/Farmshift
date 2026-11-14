"use client";
import { useEffect, useState } from "react";
import type { ApiResponse, Evaluation, EnvironmentPayload, ScenarioResponse } from "@/types/dashboard";
import type { PlantHealthResult } from "@/types/plantHealth";
import { Card, Gauge, Pill, ScoreRing, Skeleton, SourceBadge, Stat, toneFor } from "@/components/ui";
import { Chart } from "@/components/charts";
import PlantHealthCard from "@/components/PlantHealthCard";
// import LocationMap from "@/components/LocationMap";
import MyanmarGlobe from "@/components/MyanmarGlobe";
import { avg, fmt, isNum, powerPoints, shortDate, sum } from "@/lib/format";
import { AuthModal } from "@/components/AuthModal";

const LOCATIONS = [
  { name: "Pathein Township (Delta Center)", lat: 16.7845, lon: 94.7336 },
  { name: "Hinthada District (Upper Delta)", lat: 17.6447, lon: 95.4623 },
  { name: "Myaungmya Region", lat: 16.5862, lon: 95.0357 },
  { name: "Yangon Test Node", lat: 16.8661, lon: 96.1951 },
];

type Ok = Extract<ApiResponse, { success: true }>;

type Coords = { lat: number; lon: number };
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const normLon = (lon: number) => (((lon + 180) % 360) + 360) % 360 - 180;
const inMyanmar = (c: Coords) => c.lat >= 9.5 && c.lat <= 28.6 && c.lon >= 92.1 && c.lon <= 101.2;

export default function Home() {
  const [coords, setCoords] = useState<Coords | null>(null); // nothing pinned until the user chooses
  const [draft, setDraft] = useState({ lat: "", lon: "" });
  const [res, setRes] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!coords) return;
    const ctrl = new AbortController();
    fetch(`/api/environment?lat=${coords.lat}&lon=${coords.lon}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: ApiResponse) => { setRes(j); setLoading(false); })
      .catch((e) => {
        if (e.name === "AbortError") return;
        setRes({ success: false, error: "Could not reach the server. Is `npm run dev` running?" });
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [coords, nonce]);

  const setPin = (lat: number, lon: number) => {
  const c = { lat: round4(lat), lon: round4(normLon(lon)) };
  if (!inMyanmar(c)) {
    setGeoMsg("That location is outside Myanmar. Only Myanmar is supported.");
    return;
  }
  setCoords(c);
  setLoading(true);
  setDraft({ lat: String(c.lat), lon: String(c.lon) });
  setGeoMsg(null);
};

  const parsed = { lat: parseFloat(draft.lat), lon: parseFloat(draft.lon) };
  const draftValid = isNum(parsed.lat) && isNum(parsed.lon) && Math.abs(parsed.lat) <= 90 && Math.abs(parsed.lon) <= 180;
  const applyDraft = () => { if (draftValid) setPin(parsed.lat, parsed.lon); };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoMsg("Your browser doesn’t support location."); return; }
    setGeoMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => setPin(p.coords.latitude, p.coords.longitude),
      () => setGeoMsg("Couldn’t get your location — allow access or pin it on the map."),
      { timeout: 10000 }
    );
  };

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-5">
          <div>
            <h1 className="text-xl font-bold leading-tight">FarmShift</h1>
            <p className="text-xs text-stone-500">Rice → Black Gram rotation advisor · powered by NASA Earth data</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-5 py-6">
        <Card title="1. Pin your farm" subtitle="Click anywhere on the map or drag the pin. Use the layers button (top-right of the map) for satellite view.">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-stone-500">Quick jump:</span>
            {LOCATIONS.map((l) => {
              const active = coords?.lat === l.lat && coords?.lon === l.lon;
              return (
                <button key={l.name} onClick={() => setPin(l.lat, l.lon)} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${active ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
                  {l.name.split(" (")[0]}
                </button>
              );
            })}
            <button onClick={useMyLocation} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-300 hover:bg-stone-50">🎯 Use my location</button>
          </div>

          <MyanmarGlobe value={coords} onPick={setPin} />

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-stone-500">Latitude
              <input inputMode="decimal" placeholder="e.g. 16.7845" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} onKeyDown={(e) => e.key === "Enter" && applyDraft()} className="mt-1 block w-32 rounded-lg border border-stone-300 px-2 py-2 text-sm" />
            </label>
            <label className="text-xs text-stone-500">Longitude
              <input inputMode="decimal" placeholder="e.g. 94.7336" value={draft.lon} onChange={(e) => setDraft({ ...draft, lon: e.target.value })} onKeyDown={(e) => e.key === "Enter" && applyDraft()} className="mt-1 block w-32 rounded-lg border border-stone-300 px-2 py-2 text-sm" />
            </label>
            <button onClick={applyDraft} disabled={!draftValid} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">Analyze</button>
            {geoMsg && <span className="text-xs text-stone-500">{geoMsg}</span>}
          </div>

          {coords && !inMyanmar(coords) && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
               This pin is outside Myanmar. The Rice (May–Oct) → Black Gram (Nov–Dec) calendar and thresholds are tuned for the Ayeyarwady Delta, so treat results here with caution.
            </p>
          )}
        </Card>

        {!coords && (
          <div className="grid h-40 place-items-center rounded-2xl border border-dashed border-stone-300 bg-white px-4 text-center text-sm text-stone-500">
             Drop a pin on the map to see the rice → black gram suitability for that spot.
          </div>
        )}

        {loading && <LoadingState />}

        {!loading && res && !res.success && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-semibold text-red-800">Couldn’t load satellite data</h2>
            <p className="mt-1 text-sm text-red-700">{res.error}</p>
            <button onClick={() => { setLoading(true); setNonce((n) => n + 1); }} className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Try again</button>
          </div>
        )}

        {!loading && res?.success && (
          <>
            <Summary res={res} />
            <div className="grid gap-5 lg:grid-cols-2">
              <SoilCard ev={res.evaluation} env={res.environment} />
              <ImageryCard env={res.environment} />
              <ClimateCard ev={res.evaluation} env={res.environment} />
            </div>
          </>
        )}

        <Module4
          live={res?.success ? res.evaluation.module4_vegetation?.analysis ?? null : null}
          liveLoading={loading}
          hasPin={!!coords}
        />

        <footer className="pb-6 text-center text-xs text-stone-400">
          Temperature &amp; rainfall come from the live NASA POWER API. Soil moisture, NDVI, GPM rainfall and imagery metadata are prototype estimates in this build. Module 4 can also be tested with the synthetic scenarios A/B/C.
        </footer>
      </div>
    </main>
  );
}



function LoadingState() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-56" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-72" /><Skeleton className="h-72" /><Skeleton className="h-72" /><Skeleton className="h-72" />
      </div>
      <p className="text-center text-sm text-stone-500">Querying NASA POWER, SMAP, VIIRS, GPM and GIBS…</p>
    </div>
  );
}

function Summary({ res }: { res: Ok }) {
  const s = res.evaluation.dashboardSummary;
  const t = toneFor(s.suitabilityStatus);
  const cov = [
    { name: "NASA POWER", sub: "Temp & rain", v: s.dataCoverage.nasaPower },
    { name: "SMAP", sub: "Soil moisture", v: s.dataCoverage.smap },
    { name: "VIIRS", sub: "Vegetation", v: s.dataCoverage.viirs },
  ];
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <ScoreRing score={s.suitabilityScore} status={s.suitabilityStatus} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${t.bg} ${t.text} ${t.ring}`}>
              {s.suitabilityStatus === "unknown" ? "No recommendation" : s.suitabilityStatus}
            </span>
            <Pill status={s.riskLevel}>Risk: {s.riskLevel}</Pill>
          </div>
          <h2 className="mt-3 text-lg font-semibold">Is it a good time to sow black gram after rice?</h2>
          <p className="text-xs text-stone-500">
            {res.queryLocation.lat.toFixed(4)}°N, {res.queryLocation.lon.toFixed(4)}°E · {shortDate(res.environment.timeframe.startDate)} – {shortDate(res.environment.timeframe.endDate)}
          </p>

          <RotationTimeline />

          {s.reasons.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {s.reasons.map((r, i) => (
                <li key={i} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><span>{r}</span></li>
              ))}
            </ul>
          )}
          {s.reasons.length === 0 && s.suitabilityStatus === "Suitable" && (
            <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✅ No risk flags detected — conditions look good for the rotation.</p>
          )}
          {s.limitations.length > 0 && (
            <ul className="mt-2 space-y-1">
              {s.limitations.map((l, i) => <li key={i} className="text-xs text-stone-500">ⓘ {l}</li>)}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 border-t border-stone-100 pt-4">
        {cov.map((c) => {
          const active = c.v.toLowerCase() === "active";
          return (
            <div key={c.name} className="flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-emerald-500" : "bg-stone-300"}`} />
              <div><div className="font-medium leading-tight">{c.name}</div><div className="text-[11px] text-stone-500">{c.sub} · {active ? "Active" : "No data"}</div></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RotationTimeline() {
  const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return (
    <div className="mt-4">
      <div className="grid grid-cols-8 gap-1 text-center text-[10px] text-stone-400">{months.map((m) => <span key={m}>{m}</span>)}</div>
      <div className="mt-1 grid grid-cols-8 gap-1">
        <div className="col-span-6 rounded-l-full bg-amber-200 py-1.5 text-center text-xs font-medium text-amber-900"> Rice</div>
        <div className="col-span-2 rounded-r-full bg-emerald-500 py-1.5 text-center text-xs font-medium text-white"> Black gram</div>
      </div>
    </div>
  );
}

function SoilCard({ ev, env }: { ev: Evaluation; env: EnvironmentPayload }) {
  const m = ev.module2_soil;
  const ok = m && isNum(m.surfaceMoisture);
  const saturated = ok && (m!.surfaceMoisture as number) > 0.4;
  return (
    <Card title="Soil moisture" subtitle="SMAP surface & root zone (m³/m³)" badge={<SourceBadge live={false} />}>
      {!ok ? <Empty text="SMAP soil moisture data is unavailable for this location." /> : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Surface" value={fmt(m!.surfaceMoisture, 2)} />
            <Stat label="Root zone" value={fmt(m!.rootZoneMoisture, 2)} />
          </div>
          <div className="mt-5">
            <Gauge value={m!.surfaceMoisture as number} max={0.5} threshold={0.4} thresholdLabel="0.40 limit" color={saturated ? "#dc2626" : "#059669"} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill status={saturated ? "high" : "low"}>{env.soil?.soilState ?? "—"}</Pill>
          </div>
          <p className="mt-3 text-sm text-stone-600">{env.soil?.drainageRisk}</p>
          <p className="mt-2 text-xs text-stone-400">Nitrogen benefit from legumes: {m!.legumeNitrogenBenefit}</p>
        </>
      )}
    </Card>
  );
}

function ClimateCard({ ev, env }: { ev: Evaluation; env: EnvironmentPayload }) {
  const w = env.weather;
  const tmax = powerPoints(w?.T2M_MAX), tmean = powerPoints(w?.T2M), tmin = powerPoints(w?.T2M_MIN), rain = powerPoints(w?.PRECTOTCORR);
  const m = ev.module3_climate;
  const hot = m && isNum(m.extremeHeatDaysAtFlowering) ? m.extremeHeatDaysAtFlowering : null;
  const peak = tmax.reduce<number | null>((a, p) => (p.value !== null && (a === null || p.value > a) ? p.value : a), null);
  const rainTotal = sum(rain.map((p) => p.value));
  return (
    <Card title="Climate & extremes" subtitle="Daily temperature and rainfall" badge={<SourceBadge live={env.weatherStatus === "active"} />} className="lg:col-span-2">
      {!w ? <Empty text="NASA POWER temperature and rainfall data is unavailable." /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Avg temp" value={fmt(avg(tmean.map((p) => p.value)), 1, "°C")} />
            <Stat label="Hottest day" value={fmt(peak, 1, "°C")} />
            <Stat label="Days over 35°C" value={hot ?? "—"} hint={hot !== null && hot > 2 ? "Heat-stress risk" : "Within safe range"} />
            <Stat label="Total rain" value={fmt(rainTotal, 0, " mm")} hint={env.rainfall?.status === "active" ? `GPM est. ${env.rainfall.accumulatedPrecipitationMm} mm · ${env.rainfall.heavyRainDays} heavy days` : undefined} />
          </div>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Temperature (°C)</h3>
              <Chart unit="°C" threshold={{ value: 35, label: "35°C heat limit" }} series={[
                { name: "Max", color: "#dc2626", points: tmax },
                { name: "Mean", color: "#d97706", points: tmean },
                { name: "Min", color: "#0284c7", points: tmin },
              ]} />
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Rainfall (mm/day)</h3>
              <Chart kind="bar" unit=" mm" series={[{ name: "Rain", color: "#0ea5e9", points: rain }]} />
            </div>
          </div>
          {env.rainfall?.floodRisk && <div className="mt-4 flex items-center gap-2 text-sm text-stone-600">Flood risk (GPM): <Pill status={env.rainfall.floodRisk}>{env.rainfall.floodRisk}</Pill></div>}
        </>
      )}
    </Card>
  );
}

function ImageryCard({ env }: { env: EnvironmentPayload }) {
  const im = env.imagery;
  const [failed, setFailed] = useState(false);
  return (
    <Card title="Satellite view" subtitle="NASA GIBS true-colour imagery" badge={<SourceBadge live={false} />}>
      {!im || im.status !== "active" ? <Empty text="Imagery is unavailable." /> : (
        <>
          <div className="grid aspect-video place-items-center overflow-hidden rounded-xl bg-stone-100">
            {failed || !im.imageTileUrl ? (
              <span className="text-sm text-stone-400"> Imagery tile couldn’t be loaded</span>
            ) : (
              
              <img src={im.imageTileUrl} alt="True-colour satellite tile" className="h-full w-full object-cover" onError={() => setFailed(true)} />
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-500">
            <div><dt className="text-stone-400">Layer</dt><dd className="truncate font-medium text-stone-700" title={im.layerName}>{im.layerName}</dd></div>
            <div><dt className="text-stone-400">Snapshot</dt><dd className="font-medium text-stone-700">{im.snapshotDate ? shortDate(im.snapshotDate) : "—"}</dd></div>
            <div><dt className="text-stone-400">Cloud cover</dt><dd className="font-medium text-stone-700">{im.cloudCoverEstimate ?? "—"}</dd></div>
          </dl>
        </>
      )}
    </Card>
  );
}




type Source = "live" | "A" | "B" | "C";
const SCENARIOS: { id: Exclude<Source, "live">; label: string }[] = [
  { id: "A", label: "A · Good season" },
  { id: "B", label: "B · Stress season" },
  { id: "C", label: "C · Soil + NDVI missing" },
];

function Module4({ live, liveLoading, hasPin }: { live: PlantHealthResult | null; liveLoading: boolean; hasPin: boolean }) {
  const [source, setSource] = useState<Source>("live");
  const [compare, setCompare] = useState(false);
  const [scn, setScn] = useState<PlantHealthResult | null>(null);
  const [base, setBase] = useState<PlantHealthResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = (id: string, ok: (a: PlantHealthResult) => void, ctrl: AbortController) =>
    fetch(`/api/scenario?id=${id}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: ScenarioResponse) => (j.success ? ok(j.analysis) : setErr(j.error)))
      .catch((e) => { if (e.name !== "AbortError") setErr("Could not load the scenario."); });

  useEffect(() => {
    setScn(null); setErr(null);
    if (source === "live") return;
    const ctrl = new AbortController();
    load(source, setScn, ctrl);
    return () => ctrl.abort();
  }, [source]);

  const canCompare = source === "B" || source === "C";
  useEffect(() => {
    setBase(null);
    if (!compare || !canCompare) return;
    const ctrl = new AbortController();
    load("A", setBase, ctrl);
    return () => ctrl.abort();
  }, [compare, canCompare]);

  const analysis = source === "live" ? live : scn;
  const busy = source === "live" ? liveLoading : !scn && !err;
  const badge = source === "live"
    ? <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">POWER live · NDVI/soil estimated</span>
    : <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">Synthetic test data</span>;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-500">Module 4 data:</span>
        {([{ id: "live", label: "Pinned farm" }, ...SCENARIOS] as { id: Source; label: string }[]).map((o) => (
          <button key={o.id} onClick={() => { setSource(o.id); if (o.id !== "B" && o.id !== "C") setCompare(false); }} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${source === o.id ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"}`}>
            {o.label}
          </button>
        ))}
        {canCompare && (
          <label className="ml-2 flex items-center gap-1.5 text-xs text-stone-600">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            Compare with scenario A
          </label>
        )}
      </div>


      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{err}</div>
      ) : source === "live" && !hasPin ? (
        <div className="grid h-32 place-items-center rounded-2xl border border-dashed border-stone-300 bg-white px-4 text-center text-sm text-stone-500">Pin a farm above, or pick a test scenario, to see plant health and water level.</div>
      ) : busy ? (
        <Skeleton className="h-96" />
      ) : (
        <PlantHealthCard analysis={analysis} badge={badge} baseline={base?.ndvi.observations ?? null} baselineLabel="Scenario A (good season)" />
      )}
    </section>
  );

}

function Empty({ text }: { text: string }) {
  return <div className="grid h-40 place-items-center rounded-xl border border-dashed border-stone-200 px-4 text-center text-sm text-stone-400">{text}</div>;
}