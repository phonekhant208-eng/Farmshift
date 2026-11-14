// lib/plantHealth.ts
// FarmShift Module 4 (plant health & water) + Module 1 (rotation score) engine.
// Pure functions: rows in -> result out. Missing data stays missing (never invented).
//
// Thresholds: only 35°C heat, 27°C night temps and the rainy-season dates come from
// the agronomy record (tagged "Sourced"). Everything else is a prototype assumption
// and is tagged "Assumption" in notes and markers so the UI can label it.

import type {
  CropStage, DailyRow, NdviDip, NdviObs, PlantHealthResult, RainWater,
  SoilSnapshot, SoilWater, Status, StressKind, StressMarker, WaterPoint,
} from "@/types/plantHealth";

/* --------------------------------- constants --------------------------------- */

const FLOWER_START_MD = "08-10"; // sourced: flowering window 10 Aug - 10 Sep
const FLOWER_END_MD = "09-10";
const RAIN_SEASON = { startMd: "05-15", endMd: "10-15" }; // sourced season dates
const FLOOD_PERIOD = { startMd: "07-01", endMd: "10-31" };
const HARVEST_WINDOW = { startMd: "10-15", endMd: "11-15" }; // sourced harvest window
const SOWING_WINDOW = { startMd: "11-01", endMd: "12-10" };
const HARVEST_MD = "10-25";
const SOWING_MD = "11-08"; // HARVEST_MD + 14 day delay (assumption)
const SOWING_DELAY_DAYS = 14;
const POST_HARVEST_MD = "10-15"; // dips starting on/after this are post-harvest

const HEAT_TMAX = 35; // °C (sourced)
const NIGHT_TMIN = 27; // °C (sourced)
const DIP_MIN = 0.08; // NDVI drop between consecutive readings (assumption)
const SEASON_RAIN = { loMarginal: 1500, okMin: 2000, okMax: 3000, hiMarginal: 3500 };
const HEAVY_RAIN_MM = 50;
const FLOOD_3DAY_MM = 200;
const HARVEST_RAIN_MM = 10;
const HARVEST_RAIN_FLAG_DAYS = 2;
const SOIL_OK = 0.15;
const SOIL_MARGINAL = 0.11;
const NDVI_MIN = -0.2;
const NDVI_MAX = 1;

const DAY_MS = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const addDays = (d: string, n: number) => new Date(ms(d) + n * DAY_MS).toISOString().slice(0, 10);
const md = (year: number, mmd: string) => `${year}-${mmd}`;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const mean = (vals: (number | null | undefined)[]) => {
  const n = vals.filter(isNum) as number[];
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
};
const r3 = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);
const r4 = (v: number | null) => (v === null ? null : Math.round(v * 10000) / 10000);

/* ---------------------------------- CSV input --------------------------------- */

const CSV_FIELDS: [string, keyof DailyRow][] = [
  ["tmean_c", "tmean"], ["tmax_c", "tmax"], ["tmin_c", "tmin"],
  ["rain_mm", "rain"], ["soil_surface_m3m3", "soilSurface"],
  ["soil_rootzone_m3m3", "soilRoot"], ["ndvi", "ndvi"],
];

/** Parse the test-guide CSV format into DailyRows. Empty cells become null. */
export function rowsFromCsv(csv: string): DailyRow[] {
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (!lines.length) {
    return [];
  }

  const header = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase());

  return lines
    .slice(1)
    .map((line) => {
      const cells = line.split(",");

      const row: DailyRow = {
        date: (cells[header.indexOf("date")] ?? "").trim(),
      };

      for (const [csvName, field] of CSV_FIELDS) {
        const index = header.indexOf(csvName);

        if (index < 0) {
          continue;
        }

        const raw = (cells[index] ?? "").trim();
        const value = raw === "" ? null : Number(raw);

        const numericValue =
          value === null || !Number.isFinite(value) ? null : value;

        // Assign only the numeric fields from CSV_FIELDS.
        Object.assign(row, {
          [field]: numericValue,
        });
      }

      return row;
    })
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------- live environment (NASA POWER) ------------------------- */

type PowerSeries = Record<string, number>;
type LiveEnvironment = {
  weather?: {
    T2M?: PowerSeries; T2M_MAX?: PowerSeries; T2M_MIN?: PowerSeries; PRECTOTCORR?: PowerSeries;
  } | null;
  vegetation?: {
    status?: string | null;
    timeSeries?: { date?: string; ndvi?: number | null }[] | null;
  } | null;
};

const iso = (k: string) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
const pv = (s: PowerSeries | undefined, k: string): number | null => {
  const v = s?.[k];
  return v === undefined || v === -999 || !Number.isFinite(v) ? null : v;
};

/** Build daily rows from the live environment payload.
 *  Weather: NASA POWER (keys are YYYYMMDD). NDVI: vegetation.timeSeries (YYYY-MM-DD),
 *  only when vegetation.status is "active". Soil has no daily series -> null
 *  (the soil snapshot is passed separately). */
export function rowsFromEnvironment(env: LiveEnvironment): DailyRow[] {
  const w = env.weather ?? {};
  const veg = env.vegetation;
  const ndviByDate = new Map<string, number>();
  if (veg && String(veg.status ?? "").toLowerCase() === "active") {
    for (const p of veg.timeSeries ?? []) {
      if (p && typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && isNum(p.ndvi)) {
        ndviByDate.set(p.date, p.ndvi);
      }
    }
  }

  const dates = new Set<string>();
  for (const s of [w.T2M, w.T2M_MAX, w.T2M_MIN, w.PRECTOTCORR]) {
    if (s) Object.keys(s).forEach((k) => dates.add(iso(k)));
  }
  ndviByDate.forEach((_, d) => dates.add(d));

  return [...dates].sort().map((date) => {
    const k = date.replace(/-/g, "");
    return {
      date,
      tmean: pv(w.T2M, k),
      tmax: pv(w.T2M_MAX, k),
      tmin: pv(w.T2M_MIN, k),
      rain: pv(w.PRECTOTCORR, k),
      soilSurface: null,
      soilRoot: null,
      ndvi: ndviByDate.get(date) ?? null,
    };
  });
}

type LiveSoilEnvironment = {
  soil?: {
    surfaceMoisture?: number | null;
    rootZoneMoisture?: number | null;
    surface?: number | null;
    root?: number | null;
  } | null;
  timeframe?: { endDate?: string | null } | null;
};

/** Build a single-day soil snapshot from the live environment payload.
 *  Returns null when no soil moisture value is present (shown as unknown). */
export function soilSnapshotFromEnvironment(env: LiveSoilEnvironment | null | undefined): SoilSnapshot | null {
  const s = env?.soil;
  if (!s) return null;
  const surface = isNum(s.surfaceMoisture) ? s.surfaceMoisture : isNum(s.surface) ? s.surface : null;
  const root = isNum(s.rootZoneMoisture) ? s.rootZoneMoisture : isNum(s.root) ? s.root : null;
  if (surface === null && root === null) return null;
  const end = env?.timeframe?.endDate ?? null;
  const date = end && /^\d{8}$/.test(end) ? iso(end) : end;
  return { surface, root, date };
}

/* ---------------------------------- crop stages ---------------------------------- */

function buildStages(year: number): CropStage[] {
  return [
    { id: "plant", label: "Rice · transplanting & tillering", crop: "rice",
      start: md(year, "06-01"), end: addDays(md(year, FLOWER_START_MD), -1), reliability: "Assumption" },
    { id: "flower", label: "Rice · flowering", crop: "rice",
      start: md(year, FLOWER_START_MD), end: md(year, FLOWER_END_MD), reliability: "Sourced" },
    { id: "fill", label: "Rice · grain filling", crop: "rice",
      start: addDays(md(year, FLOWER_END_MD), 1), end: addDays(md(year, HARVEST_MD), -1), reliability: "Assumption" },
    { id: "harvest", label: "Rice · harvest", crop: "rice",
      start: md(year, HARVEST_MD), end: md(year, HARVEST_WINDOW.endMd), reliability: "Assumption" },
    { id: "prep", label: "Field preparation", crop: "prep",
      start: addDays(md(year, HARVEST_MD), 1), end: addDays(md(year, SOWING_MD), -1), reliability: "Assumption" },
    { id: "sow", label: "Black gram · sowing", crop: "black_gram",
      start: md(year, SOWING_MD), end: md(year, SOWING_WINDOW.endMd), reliability: "Assumption" },
  ];
}

/* --------------------------------- main analysis --------------------------------- */

export function analyzePlantHealth(
  rows: DailyRow[],
  opts?: { soilSnapshot?: SoilSnapshot | null },
): PlantHealthResult {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const period = sorted.length ? { start: sorted[0].date, end: sorted[sorted.length - 1].date } : null;
  const year = period ? parseInt(period.start.slice(0, 4), 10) : new Date().getUTCFullYear();

  /* ---- layers & coverage ---- */
  const layers = {
    temperature: sorted.some((r) => isNum(r.tmean) || isNum(r.tmax) || isNum(r.tmin)),
    rainfall: sorted.some((r) => isNum(r.rain)),
    soil: sorted.some((r) => isNum(r.soilSurface) || isNum(r.soilRoot)),
    ndvi: false, // set after parsing NDVI below
  };

  /* ---- NDVI ---- */
  const observations: NdviObs[] = [];
  let rejected = 0;
  for (const r of sorted) {
    if (!isNum(r.ndvi)) continue;
    if (r.ndvi < NDVI_MIN || r.ndvi > NDVI_MAX) { rejected++; continue; }
    observations.push({ date: r.date, value: r.ndvi });
  }
  layers.ndvi = observations.length > 0;
  const ndvi = {
    observations,
    count: observations.length,
    rejected,
    first: observations[0] ?? null,
    peak: observations.reduce<NdviObs | null>((best, o) => (best === null || o.value > best.value ? o : best), null),
    last: observations.length ? observations[observations.length - 1] : null,
  };

  /* ---- rainfall block ---- */
  const rain = buildRain(sorted, year);

  /* ---- soil block ---- */
  const soil = buildSoil(sorted, year, opts?.soilSnapshot ?? null);

  /* ---- stress markers (built before dips so dips can link to them) ---- */
  const markers = buildMarkers(sorted, year, soil);

  /* ---- NDVI dips ---- */
  const dips: NdviDip[] = [];
  for (let i = 1; i < observations.length; i++) {
    const fromValue = observations[i - 1].value;
    const toValue = observations[i].value;
    const drop = fromValue - toValue;
    if (drop < DIP_MIN) continue;
    const from = observations[i - 1].date;
    const to = observations[i].date;
    const linked = Array.from(new Set(
      markers.filter((m) => m.start <= to && m.end >= from).map((m) => m.kind),
    )) as StressKind[];
    dips.push({
      from, to, fromValue, toValue, drop: Math.round(drop * 1000) / 1000,
      phase: from < md(year, POST_HARVEST_MD) ? "in_season" : "post_harvest",
      linked,
    });
  }

  const coverage = (Number(layers.temperature) + Number(layers.rainfall) + Number(layers.soil) + Number(layers.ndvi)) / 4;
  const summary = buildSummary({ layers, ndvi, dips, soil, rain, coverage, year });
  const notes = buildNotes();

  return {
    period,
    layers,
    coverage,
    ndvi,
    dips,
    markers,
    stages: buildStages(year),
    water: {
      soil,
      rain,
      series: sorted.map((r): WaterPoint => ({ date: r.date, rain: isNum(r.rain) ? r.rain : null, surface: isNum(r.soilSurface) ? r.soilSurface : null, root: isNum(r.soilRoot) ? r.soilRoot : null })),
    },
    summary,
    notes,
  };
}

/* ---------------------------------- rainfall ---------------------------------- */

function buildRain(rows: DailyRow[], year: number): RainWater {
  const hasRain = rows.some((r) => isNum(r.rain));

  const sStart = md(year, RAIN_SEASON.startMd);
  const sEnd = md(year, RAIN_SEASON.endMd);
  const seasonVals = rows.filter((r) => r.date >= sStart && r.date <= sEnd).map((r) => r.rain);
  const seasonTotalMm = hasRain ? seasonVals.filter(isNum).reduce<number>((a, b) => a + (b as number), 0) : null;

  let seasonStatus: Status = "unknown";
  if (seasonTotalMm !== null) {
    if (seasonTotalMm >= SEASON_RAIN.okMin && seasonTotalMm <= SEASON_RAIN.okMax) seasonStatus = "suitable";
    else if (seasonTotalMm >= SEASON_RAIN.loMarginal && seasonTotalMm <= SEASON_RAIN.hiMarginal) seasonStatus = "marginal";
    else seasonStatus = "unsuitable";
  }

  const heavyRainDays = rows.filter((r) => isNum(r.rain) && (r.rain as number) >= HEAVY_RAIN_MM).length;

  /* Flood: leading 3-day windows (d, d+1, d+2) within Jul 1 - Oct 31, sum >= 200 mm.
   * floodFirstStart = the start date of the first qualifying window. */
  const fStart = md(year, FLOOD_PERIOD.startMd);
  const fEnd = md(year, FLOOD_PERIOD.endMd);
  const floodDays = new Set<string>();
  let floodFirstStart: string | null = null;
  for (let i = 0; i < rows.length - 2; i++) {
    const w = rows.slice(i, i + 3);
    if (w[0].date < fStart || w[2].date > fEnd) continue;
    const vals = w.map((x) => x.rain);
    if (vals.some((v) => !isNum(v))) continue;
    if (vals.reduce<number>((a, b) => a + (b as number), 0) >= FLOOD_3DAY_MM) {
      if (floodFirstStart === null) floodFirstStart = w[0].date;
      w.forEach((x) => floodDays.add(x.date));
    }
  }

  const hStart = md(year, HARVEST_WINDOW.startMd);
  const hEnd = md(year, HARVEST_WINDOW.endMd);
  const harvestRainDays = hasRain
    ? rows.filter((r) => r.date >= hStart && r.date <= hEnd && isNum(r.rain) && (r.rain as number) >= HARVEST_RAIN_MM).length
    : null;

  return {
    seasonTotalMm,
    seasonStatus,
    heavyRainDays,
    floodFlag: hasRain ? floodDays.size > 0 : null,
    floodFirstStart,
    harvestRainDays,
    harvestRainFlag: harvestRainDays === null ? null : harvestRainDays >= HARVEST_RAIN_FLAG_DAYS,
  };
}

/* ------------------------------------ soil ------------------------------------ */

function buildSoil(rows: DailyRow[], year: number, snapshot: SoilSnapshot | null): SoilWater {
  const wStart = md(year, SOWING_WINDOW.startMd);
  const wEnd = md(year, SOWING_WINDOW.endMd);
  const harvestDate = md(year, HARVEST_MD);
  const sowingDate = md(year, SOWING_MD);

  const winVals = rows.filter((r) => r.date >= wStart && r.date <= wEnd);
  const seriesSurface = rows.filter((r) => isNum(r.soilSurface));
  const hasSeries = seriesSurface.length > 0;
  const hasSnapshot = snapshot !== null && (isNum(snapshot.surface) || isNum(snapshot.root));

  const at = (d: string): number | null => {
    const v = rows.find((r) => r.date === d)?.soilSurface;
    return isNum(v) ? v : null;
  };

  let mode: SoilWater["mode"];
  let meanSurface: number | null;
  let meanRoot: number | null;
  let atHarvest: number | null;
  let atSowing: number | null;
  let moistureLost: number | null;
  let lossPerDay: number | null;
  let latestDate: string | null;
  let latestSurface: number | null;
  let latestRoot: number | null;

  if (hasSeries) {
    mode = "series";
    meanSurface = r3(mean(winVals.map((r) => r.soilSurface)));
    meanRoot = r3(mean(winVals.map((r) => r.soilRoot)));
    atHarvest = at(harvestDate);
    atSowing = at(sowingDate);
    moistureLost = isNum(atHarvest) && isNum(atSowing) ? r3((atHarvest as number) - (atSowing as number)) : null;
    lossPerDay = moistureLost !== null ? r4(moistureLost / SOWING_DELAY_DAYS) : null;
    const lastRow = seriesSurface[seriesSurface.length - 1];
    latestDate = lastRow.date;
    latestSurface = isNum(lastRow.soilSurface) ? lastRow.soilSurface : null;
    latestRoot = isNum(lastRow.soilRoot) ? lastRow.soilRoot : null;
  } else if (hasSnapshot) {
    mode = "snapshot";
    meanSurface = r3(isNum(snapshot?.surface) ? (snapshot?.surface as number) : null);
    meanRoot = r3(isNum(snapshot?.root) ? (snapshot?.root as number) : null);
    atHarvest = null;
    atSowing = null;
    moistureLost = null;
    lossPerDay = null;
    latestDate = snapshot?.date ?? (rows.length ? rows[rows.length - 1].date : null);
    latestSurface = isNum(snapshot?.surface) ? snapshot?.surface ?? null : null;
    latestRoot = isNum(snapshot?.root) ? snapshot?.root ?? null : null;
  } else {
    mode = "none";
    meanSurface = null; meanRoot = null; atHarvest = null; atSowing = null;
    moistureLost = null; lossPerDay = null;
    latestDate = null; latestSurface = null; latestRoot = null;
  }

  const status: Status = meanSurface === null ? "unknown"
    : meanSurface >= SOIL_OK ? "suitable"
    : meanSurface >= SOIL_MARGINAL ? "marginal" : "unsuitable";
  const gate = status === "unsuitable" ? "flag" : status === "unknown" ? "unknown" : "pass";

  return {
    mode, sowingWindow: { start: wStart, end: wEnd },
    meanSurface, meanRoot, harvestDate, sowingDate, delayDays: SOWING_DELAY_DAYS,
    atHarvest, atSowing, moistureLost, lossPerDay,
    latestDate, latestSurface, latestRoot, status, gate,
  };
}

/* ---------------------------------- markers ---------------------------------- */

type Run = { start: string; end: string; days: number };

function mergeRuns(dates: string[]): Run[] {
  const sorted = [...new Set(dates)].sort();
  const out: Run[] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && addDays(last.end, 1) === d) { last.end = d; last.days += 1; }
    else out.push({ start: d, end: d, days: 1 });
  }
  return out;
}

function buildMarkers(rows: DailyRow[], year: number, soil: SoilWater): StressMarker[] {
  const markers: StressMarker[] = [];
  const push = (kind: StressKind, run: Run, label: string, detail: string, reliability: "Sourced" | "Assumption") =>
    markers.push({ kind, start: run.start, end: run.end, days: run.days, label, detail, reliability });

  /* heat & warm nights: flowering window only */
  const fStart = md(year, FLOWER_START_MD);
  const fEnd = md(year, FLOWER_END_MD);
  const fRows = rows.filter((r) => r.date >= fStart && r.date <= fEnd);

  const hotRows = fRows.filter((r) => isNum(r.tmax) && (r.tmax as number) >= HEAT_TMAX);
  if (hotRows.length) {
    const vals = hotRows.map((r) => r.tmax as number);
    const detail = `Daily max ${Math.min(...vals).toFixed(1)}–${Math.max(...vals).toFixed(1)}°C during flowering`;
    for (const run of mergeRuns(hotRows.map((r) => r.date))) push("heat", run, `Heat ≥ ${HEAT_TMAX}°C`, detail, "Sourced");
  }

  const warmRows = fRows.filter((r) => isNum(r.tmin) && (r.tmin as number) >= NIGHT_TMIN);
  if (warmRows.length) {
    const vals = warmRows.map((r) => r.tmin as number);
    const detail = `Nights at ${Math.min(...vals).toFixed(1)}–${Math.max(...vals).toFixed(1)}°C (min temp)`;
    for (const run of mergeRuns(warmRows.map((r) => r.date))) push("warm_night", run, `Warm night ≥ ${NIGHT_TMIN}°C`, detail, "Sourced");
  }

  /* heavy rain days (any time in the season) */
  const heavyRows = rows.filter((r) => isNum(r.rain) && (r.rain as number) >= HEAVY_RAIN_MM);
  for (const r of heavyRows) {
    push("heavy_rain", { start: r.date, end: r.date, days: 1 }, `Heavy rain ≥ ${HEAVY_RAIN_MM} mm`,
      `${(r.rain as number).toFixed(0)} mm in one day`, "Assumption");
  }

  /* flood: union of qualifying 3-day windows */
  const floodDays = new Set<string>();
  const fPeriodStart = md(year, FLOOD_PERIOD.startMd);
  const fPeriodEnd = md(year, FLOOD_PERIOD.endMd);
  let floodMax = 0;
  for (let i = 0; i < rows.length - 2; i++) {
    const w = rows.slice(i, i + 3);
    if (w[0].date < fPeriodStart || w[2].date > fPeriodEnd) continue;
    const vals = w.map((x) => x.rain);
    if (vals.some((v) => !isNum(v))) continue;
    const s = vals.reduce<number>((a, b) => a + (b as number), 0);
    if (s >= FLOOD_3DAY_MM) {
      floodMax = Math.max(floodMax, s);
      w.forEach((x) => floodDays.add(x.date));
    }
  }
  if (floodDays.size) {
    const detail = `3-day rain total ≥ ${FLOOD_3DAY_MM} mm (peak ${floodMax.toFixed(0)} mm in 3 days)`;
    for (const run of mergeRuns([...floodDays])) push("flood", run, "Flood risk", detail, "Assumption");
  }

  /* harvest rain */
  const hStart = md(year, HARVEST_WINDOW.startMd);
  const hEnd = md(year, HARVEST_WINDOW.endMd);
  const hRows = rows.filter((r) => r.date >= hStart && r.date <= hEnd && isNum(r.rain) && (r.rain as number) >= HARVEST_RAIN_MM);
  for (const run of mergeRuns(hRows.map((r) => r.date))) {
    push("harvest_rain", run, "Rain at harvest", `${run.days} day(s) ≥ ${HARVEST_RAIN_MM} mm during the harvest window`, "Assumption");
  }

  /* dry soil inside the black gram sowing window */
  if (soil.mode === "series") {
    const dry = rows.filter((r) =>
      r.date >= soil.sowingWindow.start && r.date <= soil.sowingWindow.end &&
      isNum(r.soilSurface) && (r.soilSurface as number) < SOIL_MARGINAL);
    if (dry.length) {
      const vals = dry.map((r) => r.soilSurface as number);
      const detail = `Surface moisture ${Math.min(...vals).toFixed(2)}–${Math.max(...vals).toFixed(2)} m³/m³, below ${SOIL_MARGINAL}`;
      for (const run of mergeRuns(dry.map((r) => r.date))) push("dry_soil", run, "Soil too dry", detail, "Assumption");
    }
  }

  return markers.sort((a, b) => a.start.localeCompare(b.start) || a.kind.localeCompare(b.kind));
}

/* ------------------------------ summary & notes ------------------------------ */

type BuildArgs = Pick<PlantHealthResult, "layers" | "ndvi" | "dips" | "coverage"> & {
  soil: SoilWater; rain: RainWater; year: number;
};

function buildSummary({ layers, ndvi, dips, soil, coverage }: BuildArgs): PlantHealthResult["summary"] {
  const state: PlantHealthResult["summary"]["state"] =
    !layers.temperature && !layers.rainfall && !layers.soil && !layers.ndvi ? "no_data"
    : coverage < 1 ? "partial" : "ok";

  const parts: string[] = [];
  if (state === "no_data") {
    parts.push("No weather, soil or vegetation data is available for this period, so nothing can be judged.");
  } else {
    if (layers.ndvi && ndvi.peak) {
      const inSeasonDips = dips.filter((d) => d.phase === "in_season");
      const postDips = dips.filter((d) => d.phase === "post_harvest");
      let s = `NDVI rose from ${ndvi.first?.value.toFixed(2)} to a peak of ${ndvi.peak.value.toFixed(2)} on ${ndvi.peak.date.slice(5).replace("-", "/")}, then declined to ${ndvi.last?.value.toFixed(2)} by ${ndvi.last?.date.slice(5).replace("-", "/")}.`;
      if (inSeasonDips.length) {
        const d = inSeasonDips[0];
        const links = d.linked.length ? `, coinciding with ${d.linked.join(" and ")} stress markers` : "";
        s += ` A sharp drop of ${d.drop.toFixed(2)} between ${d.from.slice(5).replace("-", "/")} and ${d.to.slice(5).replace("-", "/")}${links} — timing match, not proof of cause.`;
        if (inSeasonDips.length > 1) s += ` A second drop of ${inSeasonDips[1].drop.toFixed(2)} occurred later in the season.`;
      } else if (postDips.length) {
        s += " The only notable drop came after the harvest window opened, where a decline is expected.";
      } else {
        s += " No drop of 0.08 or more occurred before the harvest window opened.";
      }
      parts.push(s);
    } else if (!layers.ndvi) {
      parts.push("No NDVI data — the vegetation trend is unknown for this period.");
    }
    if (soil.mode === "none") {
      parts.push("Soil moisture is unknown, so the black gram soil gate cannot be judged.");
    } else if (soil.status === "unsuitable") {
      parts.push(`Mean surface soil moisture in the sowing window is ${soil.meanSurface?.toFixed(3)} — below ${SOIL_MARGINAL}, so the black gram step is flagged.`);
    } else if (soil.status === "marginal") {
      parts.push(`Mean surface soil moisture in the sowing window is ${soil.meanSurface?.toFixed(3)} — getting dry (between ${SOIL_MARGINAL} and ${SOIL_OK}).`);
    } else if (soil.status === "suitable") {
      parts.push(`Mean surface soil moisture in the sowing window is ${soil.meanSurface?.toFixed(3)} — adequate for the black gram step.`);
    }
    if (!layers.temperature && !layers.rainfall) {
      parts.push("Weather data is also missing for this period.");
    }
  }
  return { state, text: parts.join(" ") };
}

function buildNotes(): { text: string; reliability: "Sourced" | "Assumption" }[] {
  return [
    { text: `Heat limit ${HEAT_TMAX}°C (day max) and ${NIGHT_TMIN}°C (night min) during the 10 Aug – 10 Sep flowering window, and the 15 May – 15 Oct rainy season, come from the agronomy record.`, reliability: "Sourced" },
    { text: `Rainy-season total: ${SEASON_RAIN.okMin.toLocaleString()}–${SEASON_RAIN.okMax.toLocaleString()} mm suitable, ${SEASON_RAIN.loMarginal.toLocaleString()}–<${SEASON_RAIN.okMin.toLocaleString()} or >${SEASON_RAIN.okMax.toLocaleString()}–${SEASON_RAIN.hiMarginal.toLocaleString()} marginal — prototype assumption.`, reliability: "Assumption" },
    { text: `Flood flag: any 3 consecutive days totalling ≥ ${FLOOD_3DAY_MM} mm between 1 Jul and 31 Oct; heavy-rain day ≥ ${HEAVY_RAIN_MM} mm — prototype assumption.`, reliability: "Assumption" },
    { text: `Harvest-rain flag: ≥ ${HARVEST_RAIN_FLAG_DAYS} days with ≥ ${HARVEST_RAIN_MM} mm between 15 Oct and 15 Nov — prototype assumption.`, reliability: "Assumption" },
    { text: `Black gram soil gate: mean surface moisture 1 Nov – 10 Dec ≥ ${SOIL_OK} suitable, ${SOIL_MARGINAL}–${SOIL_OK} marginal, < ${SOIL_MARGINAL} flagged. Sowing assumed 14 days after the 25 Oct rice harvest — prototype assumption.`, reliability: "Assumption" },
    { text: `NDVI is shown as a trend only — no healthy / stressed verdict. A "dip" is a drop ≥ ${DIP_MIN} between two consecutive readings — prototype assumption.`, reliability: "Assumption" },
    { text: "A dip that overlaps a stress marker is a timing match, not proof of cause.", reliability: "Assumption" },
    { text: "Missing values (empty soil or NDVI) are shown as unknown — they are never filled in with made-up numbers.", reliability: "Sourced" },
  ];
}

/* ------------------------------ Module 1: scores ------------------------------ */

export type RiskLevel = "low" | "medium" | "high" | "unknown";
export type CropScore = {
  indicators: Record<string, Status>;
  score: number | null;
  coverage: number;
  risk: RiskLevel;
};

export type RotationScores = { rice: CropScore; black_gram: CropScore };

/** Module 1 dashboard score, from a PlantHealthResult + its source rows.
 *  suitable = 1, marginal = 0.5, unsuitable = 0, unknown = skipped.
 *  score = mean x 100; coverage = known / total; risk low >= 75, medium 40-74, high < 40.
 *  Edge cases: no temperature AND no rainfall -> all unknown (no recommendation);
 *  tmean present but tmax/tmin missing -> heat & night indicators unknown, rainfall still scored. */
export function rotationScores(a: PlantHealthResult, rows: DailyRow[]): RotationScores {
  const year = a.period ? parseInt(a.period.start.slice(0, 4), 10) : new Date().getUTCFullYear();
  const fStart = md(year, FLOWER_START_MD);
  const fEnd = md(year, FLOWER_END_MD);
  const fRows = rows.filter((r) => r.date >= fStart && r.date <= fEnd);

  const countStatus = (n: number | null, marginalMax: number): Status =>
    n === null ? "unknown" : n === 0 ? "suitable" : n <= marginalMax ? "marginal" : "unsuitable";

  const nTmax = fRows.filter((r) => isNum(r.tmax)).length;
  const nTmin = fRows.filter((r) => isNum(r.tmin)).length;
  const hotDays = nTmax ? fRows.filter((r) => isNum(r.tmax) && (r.tmax as number) >= HEAT_TMAX).length : null;
  const warmNights = nTmin ? fRows.filter((r) => isNum(r.tmin) && (r.tmin as number) >= NIGHT_TMIN).length : null;

  const riceIndicators: Record<string, Status> = {
    heat_flowering: countStatus(hotDays, 2),
    night_temp: countStatus(warmNights, 3),
    season_rainfall: a.water.rain.seasonStatus,
    flood_risk: a.water.rain.floodFlag === null ? "unknown" : a.water.rain.floodFlag ? "unsuitable" : "suitable",
  };

  const soilStatus = a.water.soil.status;
  const blackGramIndicators: Record<string, Status> = {
    soil_moisture_sowing_window: soilStatus,
  };

  const finalize = (indicators: Record<string, Status>): CropScore => {
    const VALUES: Record<Status, number | null> = { suitable: 1, marginal: 0.5, unsuitable: 0, unknown: null };
    const vals = Object.values(indicators).map((s) => VALUES[s]).filter(isNum) as number[];
    const coverage = Object.keys(indicators).length ? vals.length / Object.keys(indicators).length : 0;
    if (!vals.length) return { indicators, score: null, coverage, risk: "unknown" };
    const score = Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 100);
    const risk: RiskLevel = score >= 75 ? "low" : score >= 40 ? "medium" : "high";
    return { indicators, score, coverage, risk };
  };

  return { rice: finalize(riceIndicators), black_gram: finalize(blackGramIndicators) };
}