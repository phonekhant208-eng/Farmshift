"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ApiResponse, Evaluation, EnvironmentPayload } from "@/types/dashboard";
import { Card, Icon, Skeleton, toneFor } from "@/components/ui";
import MyanmarGlobe, { type GlobeZone, type Region } from "@/components/MyanmarGlobe";
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

type Ok = Extract<ApiResponse, { success: true }>;
type Coords = { lat: number; lon: number };
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const normLon = (lon: number) => (((lon + 180) % 360) + 360) % 360 - 180;
const inMyanmar = (c: Coords) => c.lat >= 9.5 && c.lat <= 28.6 && c.lon >= 92.1 && c.lon <= 101.2;

const chip = (active: boolean) =>
  `rounded-full px-4 py-2.5 text-base font-semibold ring-1 transition ${
    active
      ? "bg-emerald-700 text-white ring-emerald-700"
      : "bg-white text-stone-700 ring-stone-300 hover:bg-emerald-50 hover:ring-emerald-300"
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
  const [taken, setTaken] = useState<PublicPlot[]>([]); // every farmer's growing zone
  const [sharedOk, setSharedOk] = useState(true);

  // reload who owns what whenever the user logs in or picks a new place
  useEffect(() => {
    if (!user) { setTaken([]); return; }
    listAllZones().then((r) => { setTaken(r.plots); setSharedOk(r.sharedOk); }).catch(() => setTaken([]));
  }, [user, coords]);

  // every farmer's field as a dot on the globe (green = mine)
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

  return (
    <main className="min-h-screen text-stone-900">
      {/* simple header */}
      <header className="bg-emerald-700 text-white">
        <div className="mx-auto max-w-4xl px-5 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-700"><Icon name="leaf" className="h-6 w-6" /></span>
              <span className="text-xl font-bold">FarmShift</span>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/my-plants" className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">
                My plants
              </Link>
              {user ? (
                <>
                  <span className="text-sm font-medium">Hi, {user.username}</span>
                  <button onClick={signOut} className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">
                    Log out
                  </button>
                </>
              ) : (
                <button onClick={() => setAuthOpen(true)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
                  Log in / Register
                </button>
              )}
            </div>
          </div>

          <h1 className="mt-6 text-3xl font-extrabold leading-tight md:text-4xl">Is your rice field ready for black gram?</h1>
          <p className="mt-2 text-lg text-emerald-50/90">Tap your farm on the map. We tell you in plain words.</p>
        </div>
        <div className="h-1.5 bg-stone-700" />
      </header>

      <div className="relative z-10 mx-auto max-w-4xl space-y-6 px-4 py-6 pb-12">
        {/* 1. pick farm */}
        <Card title="Where is your farm?" subtitle="Tap a place below, or tap your farm on the map." icon={1}>
          <div className="mb-4 flex flex-wrap gap-2">
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

          <MyanmarGlobe value={coords} onPick={setPin} cities={MYANMAR_CITIES} onRegionChange={setRegion} zones={globeZones} />

          {user && !sharedOk && (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
              Other farmers' fields are not available yet. Only your own plants are shown. (Run zone_overlap.sql and fix list_public_plots in Supabase.)
            </p>
          )}
          {geoMsg && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-base font-medium text-amber-800 ring-1 ring-amber-200">{geoMsg}</p>}
        </Card>

        {!coords && (
          <p className="rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50/70 px-4 py-8 text-center text-lg font-medium text-emerald-900/80">
            Drop a pin on the map to see your result.
          </p>
        )}

        <FieldStatus coords={coords} regionName={region?.name ?? null} onLoginClick={() => setAuthOpen(true)} />

        {loading && <LoadingState />}

        {!loading && res && !res.success && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6">
            <h2 className="text-lg font-bold text-red-800">Couldn’t get satellite data</h2>
            <p className="mt-1 text-base text-red-700">{res.error}</p>
            <button onClick={() => { setLoading(true); setNonce((n) => n + 1); }} className="mt-4 rounded-full bg-red-600 px-6 py-2.5 text-base font-bold text-white hover:bg-red-700">Try again</button>
          </div>
        )}

        {!loading && res?.success && (
          <>
            <Answer res={res} />
            <SatellitePhoto key={`${res.queryLocation.lat}-${res.queryLocation.lon}`} env={res.environment} lat={res.queryLocation.lat} lon={res.queryLocation.lon} />
            <FarmFacts ev={res.evaluation} env={res.environment} />
          </>
        )}
      </div>

      <footer className="bg-stone-800 px-5 py-6 text-center text-sm text-stone-400">
        Temperature and rain are live from NASA. Soil water and plant colour are estimates in this prototype.
      </footer>

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={(u) => setUser(u)}
      />
    </main>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-48" />
      <Skeleton className="h-56" />
      <p className="text-center text-base text-stone-500">Getting NASA data for your farm…</p>
    </div>
  );
}

/* ---------------------------- the answer ---------------------------- */
const HEADLINE: Record<string, { title: string; sub: string; bar: string }> = {
  suitable: { title: "Good time to sow black gram", sub: "Conditions look right after your rice.", bar: "bg-emerald-600" },
  marginal: { title: "Borderline. Sow with care", sub: "You can sow, but watch the points below.", bar: "bg-amber-500" },
  unsuitable: { title: "Not a good time to sow yet", sub: "Wait, or fix the problems below first.", bar: "bg-red-600" },
  unknown: { title: "Not enough data to decide", sub: "Try another spot or check again later.", bar: "bg-stone-500" },
};

function Answer({ res }: { res: Ok }) {
  const s = res.evaluation.dashboardSummary;
  const status = String(s.suitabilityStatus).toLowerCase();
  const h = HEADLINE[status] ?? HEADLINE.unknown;
  return (
    <section className="overflow-hidden rounded-3xl border border-stone-200/70 bg-white shadow-[0_18px_40px_-24px_rgba(29,112,47,0.35)]">
      <div className={`${h.bar} px-6 py-6 text-white`}>
        <p className="text-sm font-medium opacity-90">
          Your answer · {shortDate(res.environment.timeframe.startDate)} – {shortDate(res.environment.timeframe.endDate)}
        </p>
        <h2 className="mt-1 text-3xl font-extrabold leading-tight">{h.title}</h2>
        <p className="mt-1 text-lg opacity-95">{h.sub}</p>
        {typeof s.suitabilityScore === "number" && <p className="mt-3 text-base font-semibold">Score: {s.suitabilityScore} out of 100</p>}
      </div>

      <div className="space-y-4 p-6">
        {s.reasons.length > 0 && (
          <ul className="space-y-2">
            {s.reasons.map((r, i) => (
              <li key={i} className="flex gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-base text-amber-900 ring-1 ring-amber-200/70">
                <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><span>{r}</span>
              </li>
            ))}
          </ul>
        )}
        {s.reasons.length === 0 && status === "suitable" && (
          <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-800 ring-1 ring-emerald-200">
            <Icon name="check" className="h-5 w-5" /> No warning signs found.
          </p>
        )}
        {s.limitations.length > 0 && (
          <ul className="space-y-1">
            {s.limitations.map((l, i) => <li key={i} className="text-sm text-stone-500">ⓘ {l}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}

/* -------------------------- satellite photo -------------------------- */
// Built here from NASA GIBS (no API key). Recent days are often not published yet,
// so we try a few dates and two satellites until one loads.
const GIBS_LAYERS = [
  { id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", name: "VIIRS" },
  { id: "MODIS_Terra_CorrectedReflectance_TrueColor", name: "MODIS" },
];
const dayStr = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);

function gibsUrl(layer: string, date: string, lat: number, lon: number, d = 0.25) {
  const bbox = [lat - d, lon - d, lat + d, lon + d].map((n) => n.toFixed(4)).join(","); // WMS 1.3.0 + EPSG:4326 = lat,lon order
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?version=1.3.0&service=WMS&request=GetMap&format=image/jpeg&STYLES=&transparent=false&layers=${layer}&crs=EPSG:4326&bbox=${bbox}&width=1024&height=640&time=${date}`;
}

function SatellitePhoto({ env, lat, lon }: { env: EnvironmentPayload; lat: number; lon: number }) {
  const im = env.imagery;
  const options = GIBS_LAYERS.flatMap((l) => [2, 3, 5, 8].map((ago) => ({ url: gibsUrl(l.id, dayStr(ago), lat, lon), date: dayStr(ago), name: l.name })));
  if (im?.imageTileUrl) options.push({ url: im.imageTileUrl, date: im.snapshotDate ?? "", name: "NASA" });

  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [tries, setTries] = useState(0);
  const failed = i >= options.length;
  const cur = options[Math.min(i, options.length - 1)];
  const worldview = `https://worldview.earthdata.nasa.gov/?v=${(lon - 0.25).toFixed(3)},${(lat - 0.25).toFixed(3)},${(lon + 0.25).toFixed(3)},${(lat + 0.25).toFixed(3)}`;

  return (
    <Card
      title="Satellite photo of your farm"
      subtitle="What NASA’s satellite sees from space"
      icon="globe"
      badge={loaded ? <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">NASA {cur.name}</span> : null}
    >
      <div className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-2xl bg-stone-100 ring-1 ring-stone-200">
        {!failed ? (
          <>
            {!loaded && <div className="absolute inset-0 animate-pulse bg-stone-200/70" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${tries}-${i}`}
              src={cur.url}
              alt="Satellite photo of your farm area"
              className={`h-full w-full object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setLoaded(true)}
              onError={() => { setLoaded(false); setI((n) => n + 1); }}
            />
            {loaded && (
              <>
                <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="block h-5 w-5 rounded-full border-[3px] border-white bg-orange-600 shadow-lg ring-4 ring-orange-600/30" />
                </span>
                <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-sm font-semibold text-stone-800 shadow-sm">Your farm is in the centre</span>
              </>
            )}
          </>
        ) : (
          <div className="px-6 text-center">
            <p className="text-base font-medium text-stone-600">No photo could be loaded. Check your internet connection.</p>
            <button onClick={() => { setI(0); setLoaded(false); setTries((n) => n + 1); }} className="mt-3 rounded-full bg-emerald-700 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-800">
              Try again
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-stone-600">{loaded && cur.date ? `Taken ${shortDate(cur.date)}. Clouds can hide the ground.` : failed ? "" : "Loading photo…"}</p>
        <a href={worldview} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-4 py-2 text-sm font-bold text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-50">
          Open bigger in NASA Worldview
        </a>
      </div>
    </Card>
  );
}

/* ------------------------- soil, rain, heat -------------------------- */
function Fact({ label, word, detail, status }: { label: string; word: string; detail?: string; status: string }) {
  const t = toneFor(status);
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
      <span className={`h-4 w-4 shrink-0 rounded-full ${t.dot}`} />
      <div className="flex-1">
        <div className="text-sm font-medium text-stone-500">{label}</div>
        <div className="text-xl font-bold text-stone-900">{word}</div>
      </div>
      {detail && <div className="text-right text-sm text-stone-500">{detail}</div>}
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
    <Card title="Your farm right now" subtitle="Soil, rain and heat" icon="drop">
      <div className="space-y-3">
        <Fact label="Soil water" word={soilWord} status={soilStatus} detail={surface === null ? undefined : `${fmt(surface, 2)} top soil`} />
        <Fact
          label="Rain"
          word={w ? fmt(rainTotal, 0, " mm") : "No data"}
          status={flood ? flood : w ? "low" : "unknown"}
          detail={flood ? `Flood risk: ${flood}` : undefined}
        />
        <Fact
          label="Heat"
          word={hot === null ? (w ? `${fmt(tmean, 0, "°C")} average` : "No data") : hot > 2 ? "Too hot for flowers" : "Safe for flowers"}
          status={hot === null ? "unknown" : hot > 2 ? "high" : "low"}
          detail={hot === null ? undefined : `${hot} day(s) over 35°C`}
        />
      </div>
    </Card>
  );
}