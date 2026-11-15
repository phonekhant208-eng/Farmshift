"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ApiResponse, Evaluation, EnvironmentPayload } from "@/types/dashboard";
import { Icon, Skeleton, toneFor } from "@/components/ui";
import MyanmarGlobe, { type DistrictPick, type GlobeZone, type Region } from "@/components/MyanmarGlobe";
import FieldStatus from "./fieldStatus";
import { listAllZones, type PublicPlot } from "@/app/api/environment/plantsApi";
import { pointInZone } from "@/components/ZoneOverlap";
import { growth } from "@/types/cropingInfo";
import { AuthModal } from "@/components/AuthModal";
import { useAuth } from "@/lib/AuthContext";
import { MYANMAR_CITIES } from "@/lib/myanmarCountry";
import { avg, fmt, isNum, powerPoints, shortDate, sum } from "@/lib/format";

const LOCATIONS = [
  { name: "Pathein Township (Delta Center)", lat: 16.7845, lon: 94.7336 },
  { name: "Hinthada District (Upper Delta)", lat: 17.6447, lon: 95.4623 },
  { name: "Myaungmya Region", lat: 16.5862, lon: 95.0357 },
  { name: "Yangon Test Node", lat: 16.8661, lon: 96.1951 },
];

const STEPS = [
  { n: 1, title: "Tap your farm" },
  { n: 2, title: "Read the answer" },
  { n: 3, title: "Add your plant" },
];

type Ok = Extract<ApiResponse, { success: true }>;
type AnswerTab = "summary" | "field" | "satellite";
type Coords = { lat: number; lon: number };
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const normLon = (lon: number) => (((lon + 180) % 360) + 360) % 360 - 180;
const inMyanmar = (c: Coords) => c.lat >= 9.5 && c.lat <= 28.6 && c.lon >= 92.1 && c.lon <= 101.2;

/* palette: leaf green #1f7a3d / white / ground brown #5a3e28, cream #faf6ef, sand #e8dcc8 */

const chip = (active: boolean) =>
  `shrink-0 snap-start whitespace-nowrap rounded-full px-4 py-2.5 min-h-11 text-sm sm:px-5 sm:text-base font-semibold ring-1 transition ${
    active
      ? "bg-[#1f7a3d] text-white ring-[#1f7a3d]"
      : "bg-white text-[#5a3e28] ring-[#e8dcc8] hover:bg-[#f1f8f2] hover:ring-[#1f7a3d]/40"
  }`;

export default function Home() {
  const { user, setUser, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  const [coords, setCoords] = useState<Coords | null>(null);
  const [res, setRes] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [district, setDistrict] = useState<DistrictPick | null>(null);
  const [tab, setTab] = useState<AnswerTab>("summary");
  const [detailOpen, setDetailOpen] = useState(false);
  const [taken, setTaken] = useState<PublicPlot[]>([]);
  const [sharedOk, setSharedOk] = useState(true);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) { setTaken([]); return; }
    listAllZones().then((r) => { setTaken(r.plots); setSharedOk(r.sharedOk); }).catch(() => setTaken([]));
  }, [user, coords]);

  // fetch NASA data whenever the pin (or retry) changes
  useEffect(() => {
    if (!coords) return;
    const ctl = new AbortController();
    setLoading(true);
    fetch(`/api/environment?lat=${coords.lat}&lon=${coords.lon}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d: ApiResponse) => setRes(d))
      .catch((e) => { if (e?.name !== "AbortError") setRes({ success: false, error: "Network problem. Please try again." } as ApiResponse); })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    return () => ctl.abort();
  }, [coords, nonce]);

  const globeZones = useMemo<GlobeZone[]>(
    () => taken.map((t) => ({ id: t.id, lat: t.lat, lon: t.lon, mine: t.is_mine, title: `${t.plant} · ${t.is_mine ? "You" : t.owner}`, detail: growth(t.plant, t.planted_on).stage })),
    [taken],
  );

  const setPin = (lat: number, lon: number) => {
    const c = { lat: round4(lat), lon: round4(normLon(lon)) };
    if (!inMyanmar(c)) {
      setGeoMsg("That spot is outside Myanmar. Only Myanmar is supported.");
      return;
    }
    const owner = taken.find((t) => pointInZone([c.lat, c.lon], t.zone));
    if (owner) {
      setGeoMsg(`This place is already used by ${owner.is_mine ? "you" : owner.owner} (${owner.plant}). Pick a free spot.`);
      return;
    }
    setCoords(c);
    setLoading(true);
    setGeoMsg(null);
    setTab("summary"); // a new pin starts on the Summary tab
    setDetailOpen(false);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoMsg("Your browser can’t find your location."); return; }
    setGeoMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => setPin(p.coords.latitude, p.coords.longitude),
      () => setGeoMsg("Couldn’t find you. Allow location access, or tap your farm on the map."),
      { timeout: 10000 }
    );
  };

  const step = !coords ? 1 : res?.success && !loading ? 3 : 2;

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#faf6ef] text-[#2d2218]">
      {/* top bar */}
      <nav className="sticky top-0 z-40 border-b border-[#e8dcc8] bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#1f7a3d] text-white"><Icon name="leaf" className="h-5 w-5" /></span>
            <span className="truncate text-lg font-extrabold tracking-tight text-[#1f7a3d]">FarmShift</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link href="/my-plants" className="rounded-full px-3 py-2 text-sm font-semibold text-[#5a3e28] ring-1 ring-[#e8dcc8] hover:bg-[#faf6ef] sm:px-4">
              My plants
            </Link>
            {user ? (
              <>
                <span className="hidden text-sm font-medium text-[#8a6a4c] sm:inline">Hi, {user.username}</span>
                <button onClick={signOut} className="rounded-full bg-[#f3ece0] px-3 py-2 text-sm font-semibold text-[#5a3e28] hover:bg-[#e8dcc8] sm:px-4">
                  Log out
                </button>
              </>
            ) : (
              <button onClick={() => setAuthOpen(true)} className="rounded-full bg-[#1f7a3d] px-3 py-2 text-sm font-semibold text-white hover:bg-[#186230] sm:px-4">
                Log in<span className="hidden sm:inline"> / Register</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-4 pb-16">
        {/* hero */}
        <header className="pb-6 pt-8 md:pt-14">
          <p className="text-xs font-bold uppercase tracking-widest text-[#8a6a4c] sm:text-sm">Smart planting assistant</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight text-[#1f7a3d] min-[400px]:text-4xl md:text-6xl">
            Plant the right crop,<br />at the right time.
          </h1>
          <p className="mt-4 max-w-xl text-base text-[#6b5240] sm:text-lg">Tap your farm on the map. We read the soil, rain and heat from NASA satellite data and tell you in plain words.</p>

          {/* progress */}
          <ol className="mt-6 flex items-center gap-2 sm:mt-7 sm:gap-3">
            {STEPS.map((s, idx) => {
              const done = step > s.n;
              const active = step === s.n;
              return (
                <li key={s.n} className="flex items-center gap-2 sm:gap-3">
                  <span className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 text-sm font-bold ring-1 transition ${active ? "pr-3" : "pr-1.5 sm:pr-3"} ${
                    done ? "bg-[#1f7a3d] text-white ring-[#1f7a3d]" : active ? "bg-white text-[#1f7a3d] ring-[#1f7a3d]" : "bg-white text-[#a89078] ring-[#e8dcc8]"
                  }`}>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${done ? "bg-white text-[#1f7a3d]" : active ? "bg-[#1f7a3d] text-white" : "bg-[#f3ece0] text-[#a89078]"}`}>
                      {done ? <Icon name="check" className="h-3.5 w-3.5" /> : s.n}
                    </span>
                    <span className={`${active ? "inline" : "hidden"} whitespace-nowrap sm:inline`}>{s.title}</span>
                  </span>
                  {idx < STEPS.length - 1 && <span className="h-px w-3 bg-[#d9c9b0] sm:w-8" />}
                </li>
              );
            })}
          </ol>
        </header>

        {/* 1 · map */}
        <Section n={1} title="Where is your farm?" sub="Pick a place, or tap your field on the map.">
          <div className="-mx-4 mb-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {LOCATIONS.map((l) => {
              const active = coords?.lat === l.lat && coords?.lon === l.lon;
              return (
                <button key={l.name} onClick={() => setPin(l.lat, l.lon)} className={chip(active)}>
                  {l.name.split(" (")[0]}
                </button>
              );
            })}
            <button onClick={useMyLocation} className={`${chip(false)} inline-flex items-center gap-1.5`}>
              <Icon name="pin" className="h-4 w-4" /> My location
            </button>
          </div>

          <div className="w-full min-w-0 overflow-hidden rounded-3xl bg-[#e8dcc8] p-1 shadow-[0_20px_50px_-28px_rgba(90,62,40,0.55)] sm:rounded-[2rem] sm:p-1.5">
            <div className="overflow-hidden rounded-[1.25rem] sm:rounded-[1.6rem]">
              <MyanmarGlobe value={coords} onPick={setPin} cities={MYANMAR_CITIES} onRegionChange={setRegion} onDistrictChange={setDistrict} zones={globeZones} />
            </div>
          </div>

          {user && !sharedOk && (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
              Other farmers' fields are not available yet. Only your own plants are shown. (Run zone_overlap.sql and fix list_public_plots in Supabase.)
            </p>
          )}
          {geoMsg && <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 ring-1 ring-amber-200 sm:text-base">{geoMsg}</p>}
        </Section>

        {/* 2 · answer */}
        <div ref={resultsRef} className="scroll-mt-20">
          <Section n={2} title="Your answer" sub={coords ? `Pin at ${coords.lat}, ${coords.lon}${region ? ` · ${region.name}` : ""}${district ? ` · ${district.name} District` : ""}` : "Your result will show here."}>
            <div className="space-y-5">
              {!coords && (
                <div className="flex items-center gap-3 rounded-3xl border-2 border-dashed border-[#d9c9b0] bg-white/60 px-4 py-5 sm:gap-4 sm:px-5 sm:py-6">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#e7f3ea] text-[#1f7a3d]"><Icon name="pin" className="h-6 w-6" /></span>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-[#1f7a3d]">Drop a pin on the map</p>
                    <p className="text-sm text-[#6b5240] sm:text-base">Soil, rain and heat for your spot will appear here.</p>
                  </div>
                </div>
              )}

              {loading && <LoadingState />}

              {!loading && res && !res.success && (
                <div className="rounded-3xl border border-red-200 bg-red-50 p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-red-800">Couldn’t get satellite data</h3>
                  <p className="mt-1 text-base text-red-700">{res.error}</p>
                  <button onClick={() => { setLoading(true); setNonce((n) => n + 1); }} className="mt-4 w-full rounded-full bg-red-600 px-6 py-2.5 text-base font-bold text-white hover:bg-red-700 sm:w-auto">Try again</button>
                </div>
              )}

              {!loading && coords && res?.success && (
                <>
                  {/* tabs keep the answer short — new sections become new tabs, not more scrolling */}
                  <div className="-mx-4 flex snap-x items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {([
                      ["summary", "Summary"],
                      ["field", "Soil, rain & heat"],
                      ["satellite", "Satellite photo"],
                    ] as const).map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setTab(id)} className={chip(tab === id)}>
                        {label}
                      </button>
                    ))}
                    <button type="button" onClick={() => setDetailOpen(true)} className={`${chip(false)} inline-flex items-center gap-1.5 sm:ml-auto`}>
                      <Icon name="alert" className="h-4 w-4" /> Details
                    </button>
                  </div>

                  {tab === "summary" && (
                    <div className="space-y-5">
                      <Verdict res={res} />
                      <FarmFacts ev={res.evaluation} env={res.environment} />
                    </div>
                  )}
                  {tab === "field" && <FarmFacts ev={res.evaluation} env={res.environment} />}
                  {tab === "satellite" && (
                    <SatellitePhoto key={`${res.queryLocation.lat}-${res.queryLocation.lon}`} env={res.environment} lat={res.queryLocation.lat} lon={res.queryLocation.lon} />
                  )}

                  {detailOpen && (
                    <DetailScreen res={res} regionName={region?.name ?? null} districtName={district?.name ?? null} onClose={() => setDetailOpen(false)} />
                  )}
                </>
              )}
            </div>
          </Section>
        </div>

        {/* 3 · plant */}
        <Section n={3} title="Add your plant" sub="Save it and watch it grow on My plants.">
          <FieldStatus coords={coords} regionName={region?.name ?? null} onLoginClick={() => setAuthOpen(true)} />
        </Section>
      </div>

      <footer className="bg-[#3b2a1c] px-5 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center text-sm text-[#d9c9b0]">
        Temperature and rain are live from NASA. Soil water and plant colour are estimates in this prototype.
      </footer>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onSuccess={(u) => setUser(u)} />
    </main>
  );
}

/* ------------------------------ layout ------------------------------ */
function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="relative mt-8 sm:mt-10">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#5a3e28] text-sm font-extrabold text-white sm:h-10 sm:w-10 sm:text-base">{n}</span>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold leading-tight text-[#2d2218] sm:text-2xl">{title}</h2>
          {sub && <p className="break-words text-sm text-[#8a6a4c] sm:text-base">{sub}</p>}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-40" />
      <Skeleton className="h-28" />
      <p className="text-center text-base text-[#8a6a4c]">Getting NASA data for your farm…</p>
    </div>
  );
}

/* ----------------------------- the verdict ----------------------------- */
const HEADLINE: Record<string, { title: string; sub: string; bg: string }> = {
  suitable: { title: "Good time to plant", sub: "Conditions look right for your spot.", bg: "bg-[#1f7a3d]" },
  marginal: { title: "Borderline. Plant with care", sub: "You can plant, but watch the points below.", bg: "bg-amber-600" },
  unsuitable: { title: "Not a good time to plant yet", sub: "Wait, or fix the problems below first.", bg: "bg-red-700" },
  unknown: { title: "Not enough data to decide", sub: "Try another spot or check again later.", bg: "bg-stone-600" },
};

function Verdict({ res }: { res: Ok }) {
  const s = res.evaluation.dashboardSummary;
  const status = String(s.suitabilityStatus).toLowerCase();
  const h = HEADLINE[status] ?? HEADLINE.unknown;
  const score = typeof s.suitabilityScore === "number" ? s.suitabilityScore : null;
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-[0_20px_50px_-30px_rgba(90,62,40,0.5)] ring-1 ring-[#e8dcc8]">
      <div className={`${h.bg} flex items-center justify-between gap-3 px-4 py-5 text-white sm:gap-4 sm:px-6 sm:py-6`}>
        <div className="min-w-0">
          <p className="text-xs font-medium opacity-90 sm:text-sm">
            {shortDate(res.environment.timeframe.startDate)} – {shortDate(res.environment.timeframe.endDate)}
          </p>
          <h3 className="mt-1 text-xl font-extrabold leading-tight min-[400px]:text-2xl md:text-4xl">{h.title}</h3>
          <p className="mt-1 text-sm opacity-95 sm:text-base md:text-lg">{h.sub}</p>
        </div>
        {score !== null && (
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/15 text-center ring-2 ring-white/60 sm:h-20 sm:w-20 md:h-24 md:w-24">
            <span className="text-xl font-extrabold leading-none sm:text-2xl md:text-3xl">{score}<span className="block text-[10px] font-semibold opacity-90">out of 100</span></span>
          </div>
        )}
      </div>

      {(s.reasons.length > 0 || s.limitations.length > 0 || status === "suitable") && (
        <div className="space-y-3 p-4 sm:p-5">
          {s.reasons.length > 0 && (
            <ul className="space-y-2">
              {s.reasons.map((r, i) => (
                <li key={i} className="flex gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-base text-amber-900 ring-1 ring-amber-200/70">
                  <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><span className="min-w-0 break-words">{r}</span>
                </li>
              ))}
            </ul>
          )}
          {s.reasons.length === 0 && status === "suitable" && (
            <p className="flex items-center gap-2 rounded-2xl bg-[#e7f3ea] px-4 py-3 text-base font-medium text-[#1f7a3d] ring-1 ring-[#1f7a3d]/20">
              <Icon name="check" className="h-5 w-5" /> No warning signs found.
            </p>
          )}
          {s.limitations.length > 0 && (
            <ul className="space-y-1">
              {s.limitations.map((l, i) => <li key={i} className="text-sm text-[#8a6a4c]">ⓘ {l}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------- soil, rain, heat -------------------------- */
function Fact({ label, word, detail, status }: { label: string; word: string; detail?: string; status: string }) {
  const t = toneFor(status);
  return (
    <div className="flex flex-col justify-between rounded-3xl bg-white p-4 ring-1 ring-[#e8dcc8] sm:p-5">
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#8a6a4c]">
        <span className={`h-3 w-3 rounded-full ${t.dot}`} />
        {label}
      </div>
      <div className="mt-2 text-xl font-extrabold leading-tight text-[#2d2218] sm:mt-3 sm:text-2xl">{word}</div>
      <div className="mt-1 min-h-[1.25rem] text-sm text-[#8a6a4c]">{detail ?? ""}</div>
    </div>
  );
}

function FarmFacts({ ev, env }: { ev: Evaluation; env: EnvironmentPayload }) {
  const s = ev.module2_soil;
  const surface = s && isNum(s.surfaceMoisture) ? (s.surfaceMoisture as number) : null;
  const soilWord = surface === null ? "No data" : surface > 0.4 ? "Too wet" : surface >= 0.15 ? "Just right" : surface >= 0.11 ? "Getting dry" : "Too dry";
  const soilStatus = surface === null ? "unknown" : surface > 0.4 || surface < 0.11 ? "unsuitable" : surface < 0.15 ? "marginal" : "suitable";

  const w = env.weather;
  const rain = powerPoints(w?.PRECTOTCORR);
  const rainTotal = sum(rain.map((p) => p.value));
  const tmean = avg(powerPoints(w?.T2M).map((p) => p.value));
  const m = ev.module3_climate;
  const hot = m && isNum(m.extremeHeatDaysAtFlowering) ? m.extremeHeatDaysAtFlowering : null;
  const flood = env.rainfall?.floodRisk;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Fact label="Soil water" word={soilWord} status={soilStatus} detail={surface === null ? undefined : `${fmt(surface, 2)} top soil`} />
      <Fact
        label="Rain"
        word={w ? fmt(rainTotal, 0, " mm") : "No data"}
        status={flood ? flood : w ? "low" : "unknown"}
        detail={flood ? `Flood risk: ${flood}` : undefined}
      />
      <Fact
        label="Heat"
        word={hot === null ? (w ? `${fmt(tmean, 0, "°C")} average` : "No data") : hot > 2 ? "Too hot for plants" : "Safe for plants"}
        status={hot === null ? "unknown" : hot > 2 ? "high" : "low"}
        detail={hot === null ? undefined : `${hot} day(s) over 35°C`}
      />
    </div>
  );
}

/* -------------------------- satellite photo -------------------------- */
const GIBS_LAYERS = [
  { id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", name: "VIIRS" },
  { id: "MODIS_Terra_CorrectedReflectance_TrueColor", name: "MODIS" },
];
const DAYS_AGO = [1, 2, 3, 4, 5, 6, 8, 10];
const MIN_BYTES = 12_000; // an empty GIBS image is only a few KB
const dayStr = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);

function gibsUrl(layer: string, date: string, lat: number, lon: number, d = 0.25) {
  const dx = d * 1.6; // match the 16:10 box so the photo is not stretched
  const bbox = [lat - d, lon - dx, lat + d, lon + dx].map((n) => n.toFixed(4)).join(","); // WMS 1.3.0 + EPSG:4326 = lat,lon order
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?version=1.3.0&service=WMS&request=GetMap&format=image/jpeg&STYLES=&transparent=false&layers=${layer}&crs=EPSG:4326&bbox=${bbox}&width=1024&height=640&time=${date}`;
}

function SatellitePhoto({ env, lat, lon }: { env: EnvironmentPayload; lat: number; lon: number }) {
  const im = env.imagery;
  const imgTile = im?.imageTileUrl;
  const imgDate = im?.snapshotDate ?? "";

  // newest day first, both satellites per day
  const options = useMemo(() => {
    const list = DAYS_AGO.flatMap((ago) =>
      GIBS_LAYERS.map((l) => ({ url: gibsUrl(l.id, dayStr(ago), lat, lon), date: dayStr(ago), name: l.name }))
    );
    if (imgTile) list.push({ url: imgTile, date: imgDate, name: "NASA" });
    return list;
  }, [lat, lon, imgTile, imgDate]);

  const [i, setI] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tries, setTries] = useState(0);
  const failed = i >= options.length;
  const cur = options[Math.min(i, options.length - 1)];

  // fetch each candidate and skip empty/blank images
  useEffect(() => {
    if (i >= options.length) return;
    let dead = false;
    let objUrl: string | null = null;
    setSrc(null);
    setLoaded(false);
    fetch(options[i].url)
      .then((r) => {
        if (!r.ok) throw new Error("bad");
        return r.blob();
      })
      .then((b) => {
        if (dead) return;
        if (!b.type.startsWith("image/") || b.size < MIN_BYTES) throw new Error("blank");
        objUrl = URL.createObjectURL(b);
        setSrc(objUrl);
      })
      .catch((e) => {
        if (dead) return;
        // CORS/network error: can't inspect it, so let the <img> try the URL directly
        if (e instanceof TypeError) setSrc(options[i].url);
        else setI((n) => n + 1);
      });
    return () => {
      dead = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [i, tries, options]);

  const worldview = `https://worldview.earthdata.nasa.gov/?v=${(lon - 0.25).toFixed(3)},${(lat - 0.25).toFixed(3)},${(lon + 0.25).toFixed(3)},${(lat + 0.25).toFixed(3)}`;

  return (
    <div className="rounded-3xl bg-white p-2.5 ring-1 ring-[#e8dcc8] sm:p-3">
      <div className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-2xl bg-[#f3ece0]">
        {!failed ? (
          <>
            {!loaded && <div className="absolute inset-0 animate-pulse bg-[#e8dcc8]/70" />}
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${tries}-${i}`}
                src={src}
                alt="Satellite photo of your farm area"
                className={`h-full w-full object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setLoaded(true)}
                onError={() => { setLoaded(false); setI((n) => n + 1); }}
              />
            )}
            {loaded && (
              <>
                <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="block h-5 w-5 rounded-full border-[3px] border-white bg-orange-600 shadow-lg ring-4 ring-orange-600/30" />
                </span>
                <span className="pointer-events-none absolute left-2 top-2 max-w-[60%] rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-[#2d2218] shadow-sm sm:left-3 sm:top-3 sm:px-3 sm:text-sm">Your farm is in the centre</span>
                <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-[#1f7a3d] px-2.5 py-1 text-xs font-semibold text-white shadow-sm sm:right-3 sm:top-3 sm:px-3">NASA {cur.name}</span>
              </>
            )}
          </>
        ) : (
          <div className="px-4 text-center sm:px-6">
            <p className="text-sm font-medium text-[#6b5240] sm:text-base">No clear photo is available for this spot right now. You can still open it in NASA Worldview.</p>
            <button onClick={() => { setI(0); setTries((n) => n + 1); }} className="mt-3 rounded-full bg-[#1f7a3d] px-5 py-2 text-sm font-bold text-white hover:bg-[#186230]">
              Try again
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1 pt-3 sm:px-2">
        <p className="text-sm text-[#6b5240] sm:text-base">{loaded && cur.date ? `Satellite photo · taken ${shortDate(cur.date)}. Clouds can hide the ground.` : failed ? "" : "Loading photo…"}</p>
        <a href={worldview} target="_blank" rel="noopener noreferrer" className="w-full rounded-full bg-white px-4 py-2.5 text-center text-sm font-bold text-[#1f7a3d] ring-1 ring-[#1f7a3d]/40 hover:bg-[#f1f8f2] sm:w-auto">
          Open bigger in NASA Worldview
        </a>
      </div>
    </div>
  );
}
/* ------------------------------ detail screen ------------------------------ */
/** Full-screen (modal) detail view for one pin's answer — opens from the Details button. */
function DetailScreen({ res, regionName, districtName, onClose }: { res: Ok; regionName: string | null; districtName: string | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // stop the page scrolling behind the modal
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const s = res.evaluation.dashboardSummary;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Full details">
      <button type="button" aria-label="Close details" onClick={onClose} className="absolute inset-0 bg-[#2d2218]/60 backdrop-blur-sm" />
      <div className="relative z-10 max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[#faf6ef] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-[#e8dcc8] sm:max-h-[85dvh] sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-extrabold text-[#1f7a3d]">Full details</h3>
            <p className="break-words text-sm text-[#8a6a4c]">
              {regionName ?? "Myanmar"}
              {districtName ? ` · ${districtName} District` : ""} · pin at {res.queryLocation.lat}, {res.queryLocation.lon}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full bg-[#f3ece0] px-4 py-2 text-sm font-bold text-[#5a3e28] hover:bg-[#e8dcc8]">
            Close
          </button>
        </div>

        <dl className="space-y-3">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e8dcc8]">
            <dt className="text-xs font-bold uppercase tracking-wide text-[#8a6a4c]">Time window</dt>
            <dd className="mt-1 font-semibold text-[#2d2218]">
              {shortDate(res.environment.timeframe.startDate)} – {shortDate(res.environment.timeframe.endDate)}
            </dd>
          </div>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e8dcc8]">
            <dt className="text-xs font-bold uppercase tracking-wide text-[#8a6a4c]">Suitability</dt>
            <dd className="mt-1 font-semibold capitalize text-[#2d2218]">
              {String(s.suitabilityStatus)}{typeof s.suitabilityScore === "number" ? ` · ${s.suitabilityScore}/100` : ""}
            </dd>
          </div>
          {s.reasons.length > 0 && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e8dcc8]">
              <dt className="text-xs font-bold uppercase tracking-wide text-[#8a6a4c]">Reasons</dt>
              <dd className="mt-1 space-y-1 break-words text-[#2d2218]">{s.reasons.map((r, i) => <p key={i}>• {r}</p>)}</dd>
            </div>
          )}
          {s.limitations.length > 0 && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e8dcc8]">
              <dt className="text-xs font-bold uppercase tracking-wide text-[#8a6a4c]">Limits</dt>
              <dd className="mt-1 space-y-1 break-words text-[#6b5240]">{s.limitations.map((l, i) => <p key={i}>ⓘ {l}</p>)}</dd>
            </div>
          )}
        </dl>

        <details className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-[#e8dcc8]">
          <summary className="cursor-pointer text-sm font-bold text-[#5a3e28]">Raw data (for checking)</summary>
          <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-[#2d2218] p-4 text-xs leading-relaxed text-[#d9c9b0]">
{JSON.stringify({ evaluation: res.evaluation, environment: res.environment }, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}