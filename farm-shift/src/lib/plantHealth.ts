import type {
  CropStage, DailyRow, NdviDip, NdviObs, PlantHealthResult, RainWater, Reliability,
  SoilSnapshot, SoilWater, Status, StressKind, StressMarker, WaterPoint,
} from "@/types/plantHealth";

/**
 * Module 4 – Plant health monitoring (+ water level).
 *
 * Rules from the research record / test guide:
 *  - NDVI: show the TREND only. No "healthy / stressed" verdict (no sourced thresholds).
 *  - Missing data is never invented: it becomes null / "unknown" / empty state.
 *  - Only 35 °C heat, 27 °C night and the rainy-season dates are sourced. The rest are
 *    prototype assumptions and every reason/note carries a "Sourced" / "Assumption" tag.
 *
 * Dates are MM-DD windows applied to the year of the first row.
 */
export const PH = {
  heatC: 35, // Sourced (35–38 °C by variety)
  nightC: 27, // Assumption (single study)
  flowering: ["08-10", "09-10"], // Assumption
  rainySeason: ["05-15", "10-15"], // Sourced
  rainSuitable: [2000, 3000], // Sourced (mm/yr, rainy season)
  rainMarginalLow: 1500, // Assumption
  rainMarginalHigh: 3500, // Assumption
  flood3DayMm: 200, // Assumption
  floodMonths: [7, 10], // Jul–Oct
  heavyDayMm: 50, // Assumption
  harvestRainWindow: ["10-15", "11-15"], // Assumption
  harvestRainDayMm: 10, // Assumption
  harvestRainMinDays: 2, // Assumption
  soilWindow: ["11-01", "12-10"], // sowing window (record: Nov – early Dec)
  soilSuitable: 0.15, // Assumption  (test_cases_expected.json)
  soilMarginal: 0.11, // Assumption  (test_cases_expected.json)
  harvestDate: "10-25", // Assumption
  sowingDelayDays: 14, // record: land prep 1–2 weeks
  dipDrop: 0.08, // Assumption
  minCoverage: 0.9, // a window needs >= 90 % of its days to produce a number
} as const;

/* ------------------------------ date helpers ------------------------------ */
const DAY = 86_400_000;
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(t(d) + n * DAY);
const daysBetween = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY);
const month = (d: string) => parseInt(d.slice(5, 7), 10);
const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round = (v: number, n: number) => Math.round(v * 10 ** n) / 10 ** n;

function runs(dates: string[]): { start: string; end: string; days: number }[] {
  const out: { start: string; end: string; days: number }[] = [];
  for (const d of [...dates].sort()) {
    const last = out[out.length - 1];
    if (last && daysBetween(last.end, d) === 1) { last.end = d; last.days += 1; }
    else out.push({ start: d, end: d, days: 1 });
  }
  return out;
}

/* ------------------------------- main entry ------------------------------- */
export function analyzePlantHealth(
  input: DailyRow[],
  opts: { soilSnapshot?: SoilSnapshot | null } = {}
): PlantHealthResult {
  const rows = [...input].filter((r) => r?.date).sort((a, b) => a.date.localeCompare(b.date));
  const notes: PlantHealthResult["notes"] = [];
  const note = (text: string, reliability: Reliability) => notes.push({ text, reliability });

  const empty = !rows.length;
  const year = empty ? new Date().getUTCFullYear() : parseInt(rows[0].date.slice(0, 4), 10);
  const W = (md: readonly string[]) => ({ start: `${year}-${md[0]}`, end: `${year}-${md[1]}` });
  const flowering = W(PH.flowering);
  const season = W(PH.rainySeason);
  const harvestRainWin = W(PH.harvestRainWindow);
  const sowingWin = W(PH.soilWindow);
  const harvestDate = `${year}-${PH.harvestDate}`;
  const sowingDate = addDays(harvestDate, PH.sowingDelayDays);

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const val = (d: string, f: keyof DailyRow) => {
    const v = byDate.get(d)?.[f];
    return isNum(v) ? v : null;
  };
  const inWin = (w: { start: string; end: string }) => rows.filter((r) => inRange(r.date, w.start, w.end));
  const winDays = (w: { start: string; end: string }) => daysBetween(w.start, w.end) + 1;
  const coverageOf = (w: { start: string; end: string }, f: keyof DailyRow) =>
    inWin(w).filter((r) => isNum(r[f])).length / winDays(w);
  const covered = (w: { start: string; end: string }, f: keyof DailyRow) => coverageOf(w, f) >= PH.minCoverage;
  const mean = (w: { start: string; end: string }, f: keyof DailyRow) => {
    if (!covered(w, f)) return null;
    const v = inWin(w).map((r) => r[f]).filter(isNum);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  /* ------------------------------- layers -------------------------------- */
  const any = (f: keyof DailyRow) => rows.some((r) => isNum(r[f]));
  const snap = opts.soilSnapshot && (isNum(opts.soilSnapshot.surface) || isNum(opts.soilSnapshot.root)) ? opts.soilSnapshot : null;
  const hasSoilSeries = any("soilSurface") || any("soilRoot");
  const layers = {
    ndvi: any("ndvi"),
    temperature: any("tmax") || any("tmin"),
    rainfall: any("rain"),
    soil: hasSoilSeries || !!snap,
  };
  const coverage = Object.values(layers).filter(Boolean).length / 4;

  /* -------------------------------- NDVI --------------------------------- */
  const rawNdvi = rows.filter((r) => r.ndvi !== null && r.ndvi !== undefined);
  const observations: NdviObs[] = rawNdvi
    .filter((r) => isNum(r.ndvi) && r.ndvi >= -1 && r.ndvi <= 1) // quality filter: drops fill values / out-of-range
    .map((r) => ({ date: r.date, value: r.ndvi as number }));
  const rejected = rawNdvi.length - observations.length;
  const first = observations[0] ?? null;
  const last = observations[observations.length - 1] ?? null;
  const peak = observations.reduce<NdviObs | null>((p, o) => (!p || o.value > p.value ? o : p), null);

  /* ---------------------------- stress markers --------------------------- */
  const markers: StressMarker[] = [];

  // Heat at flowering (Sourced) – needs DAILY MAX; a mean cannot show a 35 °C spike.
  const heatDates = inWin(flowering).filter((r) => isNum(r.tmax) && r.tmax >= PH.heatC).map((r) => r.date);
  for (const g of runs(heatDates)) {
    const peakT = Math.max(...inWin({ start: g.start, end: g.end }).map((r) => r.tmax as number));
    markers.push({ kind: "heat", ...g, label: `Heat ≥ ${PH.heatC}°C`, detail: `${g.days} day(s), max ${peakT.toFixed(1)}°C during flowering window`, reliability: "Sourced" });
  }
  // Warm nights (Assumption)
  const nightDates = inWin(flowering).filter((r) => isNum(r.tmin) && r.tmin >= PH.nightC).map((r) => r.date);
  for (const g of runs(nightDates)) {
    const peakT = Math.max(...inWin({ start: g.start, end: g.end }).map((r) => r.tmin as number));
    markers.push({ kind: "warm_night", ...g, label: `Warm night ≥ ${PH.nightC}°C`, detail: `${g.days} night(s), max Tmin ${peakT.toFixed(1)}°C`, reliability: "Assumption" });
  }

  // Flood: any 3 consecutive days >= 200 mm (Jul–Oct)
  const floodStarts: string[] = [];
  for (const r of rows) {
    const d2 = addDays(r.date, -2), d1 = addDays(r.date, -1);
    const a = val(d2, "rain"), b = val(d1, "rain"), c = val(r.date, "rain");
    const m = month(r.date);
    if (a === null || b === null || c === null || m < PH.floodMonths[0] || m > PH.floodMonths[1]) continue;
    if (a + b + c >= PH.flood3DayMm) floodStarts.push(d2);
  }
  const floodDays: string[] = [];
  for (const s of floodStarts) for (let i = 0; i < 3; i++) floodDays.push(addDays(s, i));
  for (const g of runs([...new Set(floodDays)])) {
    markers.push({ kind: "flood", ...g, label: "Flood risk", detail: `3-day rain ≥ ${PH.flood3DayMm} mm`, reliability: "Assumption" });
  }

  // Heavy-rain days
  const heavyDates = rows.filter((r) => isNum(r.rain) && r.rain >= PH.heavyDayMm).map((r) => r.date);
  for (const g of runs(heavyDates)) {
    const mx = Math.max(...inWin({ start: g.start, end: g.end }).map((r) => r.rain as number));
    markers.push({ kind: "heavy_rain", ...g, label: `Heavy rain ≥ ${PH.heavyDayMm} mm`, detail: `${g.days} day(s), max ${mx.toFixed(0)} mm`, reliability: "Assumption" });
  }

  // Harvest rain
  const harvestRainDates = inWin(harvestRainWin).filter((r) => isNum(r.rain) && r.rain >= PH.harvestRainDayMm).map((r) => r.date);
  const harvestRainDays = covered(harvestRainWin, "rain") ? harvestRainDates.length : null;
  for (const g of runs(harvestRainDates)) {
    markers.push({ kind: "harvest_rain", ...g, label: `Harvest rain ≥ ${PH.harvestRainDayMm} mm`, detail: `${g.days} day(s) in harvest window`, reliability: "Assumption" });
  }

  // Dry soil in sowing window
  const dryDates = inWin(sowingWin).filter((r) => isNum(r.soilSurface) && r.soilSurface < PH.soilMarginal).map((r) => r.date);
  for (const g of runs(dryDates)) {
    markers.push({ kind: "dry_soil", ...g, label: `Dry soil < ${PH.soilMarginal}`, detail: `${g.days} day(s) surface moisture below ${PH.soilMarginal} m³/m³`, reliability: "Assumption" });
  }
  markers.sort((a, b) => a.start.localeCompare(b.start) || a.kind.localeCompare(b.kind));

  /* ------------------------------ NDVI dips ------------------------------ */
  const dips: NdviDip[] = [];
  for (let i = 1; i < observations.length; i++) {
    const a = observations[i - 1], b = observations[i];
    const drop = round(a.value - b.value, 3);
    if (drop >= PH.dipDrop - 1e-9) {
      const linked = [...new Set(markers.filter((m) => m.start <= b.date && m.end >= a.date).map((m) => m.kind))] as StressKind[];
      dips.push({
        from: a.date, to: b.date, fromValue: a.value, toValue: b.value, drop,
        phase: b.date <= harvestRainWin.start ? "in_season" : "post_harvest",
        linked,
      });
    }
  }

  /* ------------------------------ crop stages ---------------------------- */
  const stages: CropStage[] = [
    { id: "plant", label: "Rice planting", crop: "rice", start: `${year}-05-01`, end: `${year}-06-30`, reliability: "Sourced" },
    { id: "grow", label: "Vegetative", crop: "rice", start: `${year}-07-01`, end: addDays(flowering.start, -1), reliability: "Assumption" },
    { id: "flower", label: "Flowering", crop: "rice", start: flowering.start, end: flowering.end, reliability: "Assumption" },
    { id: "fill", label: "Grain filling", crop: "rice", start: addDays(flowering.end, 1), end: addDays(harvestRainWin.start, -1), reliability: "Assumption" },
    { id: "harvest", label: "Harvest", crop: "rice", start: harvestRainWin.start, end: harvestDate, reliability: "Sourced" },
    { id: "prep", label: "Land prep", crop: "prep", start: addDays(harvestDate, 1), end: addDays(sowingDate, -1), reliability: "Sourced" },
    { id: "sow", label: "Black gram", crop: "black_gram", start: sowingDate, end: sowingWin.end, reliability: "Sourced" },
  ];

  /* ------------------------------ water level ---------------------------- */
  const soilStatus = (v: number | null): Status =>
    v === null ? "unknown" : v >= PH.soilSuitable ? "suitable" : v >= PH.soilMarginal ? "marginal" : "unsuitable";

  const meanSurface = mean(sowingWin, "soilSurface");
  const meanRoot = mean(sowingWin, "soilRoot");
  const atHarvest = val(harvestDate, "soilSurface");
  const atSowing = val(sowingDate, "soilSurface");
  const moistureLost = atHarvest !== null && atSowing !== null ? atHarvest - atSowing : null;
  const lossPerDay = moistureLost !== null ? moistureLost / PH.sowingDelayDays : null;

  const surfRows = rows.filter((r) => isNum(r.soilSurface));
  const rootRows = rows.filter((r) => isNum(r.soilRoot));
  const lastSoilDate = [surfRows[surfRows.length - 1]?.date, rootRows[rootRows.length - 1]?.date].filter(Boolean).sort().pop() ?? null;

  let soil: SoilWater;
  if (hasSoilSeries) {
    const status = soilStatus(meanSurface);
    soil = {
      mode: "series", sowingWindow: sowingWin, meanSurface, meanRoot, harvestDate, sowingDate, delayDays: PH.sowingDelayDays,
      atHarvest, atSowing, moistureLost, lossPerDay,
      latestDate: lastSoilDate,
      latestSurface: surfRows.length ? (surfRows[surfRows.length - 1].soilSurface as number) : null,
      latestRoot: rootRows.length ? (rootRows[rootRows.length - 1].soilRoot as number) : null,
      status, gate: status === "unknown" ? "unknown" : status === "unsuitable" ? "flag" : "pass",
    };
  } else if (snap) {
    // Source only gives one scalar: show it, but do NOT pretend it is the sowing-window mean.
    soil = {
      mode: "snapshot", sowingWindow: sowingWin, meanSurface: null, meanRoot: null, harvestDate, sowingDate, delayDays: PH.sowingDelayDays,
      atHarvest: null, atSowing: null, moistureLost: null, lossPerDay: null,
      latestDate: snap.date ?? null,
      latestSurface: isNum(snap.surface) ? snap.surface : null,
      latestRoot: isNum(snap.root) ? snap.root : null,
      status: "unknown", gate: "unknown",
    };
  } else {
    soil = {
      mode: "none", sowingWindow: sowingWin, meanSurface: null, meanRoot: null, harvestDate, sowingDate, delayDays: PH.sowingDelayDays,
      atHarvest: null, atSowing: null, moistureLost: null, lossPerDay: null,
      latestDate: null, latestSurface: null, latestRoot: null, status: "unknown", gate: "unknown",
    };
  }

  const seasonTotal = covered(season, "rain")
    ? inWin(season).reduce((a, r) => a + (isNum(r.rain) ? r.rain : 0), 0)
    : null;
  const seasonStatus: Status =
    seasonTotal === null ? "unknown"
    : seasonTotal >= PH.rainSuitable[0] && seasonTotal <= PH.rainSuitable[1] ? "suitable"
    : (seasonTotal >= PH.rainMarginalLow && seasonTotal < PH.rainSuitable[0]) || (seasonTotal > PH.rainSuitable[1] && seasonTotal < PH.rainMarginalHigh) ? "marginal"
    : "unsuitable";

  const floodWinCovered = covered({ start: `${year}-07-01`, end: `${year}-10-31` }, "rain");
  const rain: RainWater = {
    seasonTotalMm: seasonTotal === null ? null : round(seasonTotal, 1),
    seasonStatus,
    heavyRainDays: heavyDates.length,
    floodFlag: floodStarts.length ? true : floodWinCovered ? false : null,
    floodFirstStart: floodStarts[0] ?? null,
    harvestRainDays,
    harvestRainFlag: harvestRainDays === null ? null : harvestRainDays >= PH.harvestRainMinDays,
  };

  const series: WaterPoint[] = rows.map((r) => ({
    date: r.date,
    rain: isNum(r.rain) ? r.rain : null,
    surface: isNum(r.soilSurface) ? r.soilSurface : null,
    root: isNum(r.soilRoot) ? r.soilRoot : null,
  }));

  /* --------------------------- plain-language text ----------------------- */
  const fmtD = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const inSeasonDips = dips.filter((d) => d.phase === "in_season");
  let state: PlantHealthResult["summary"]["state"];
  let text: string;

  if (!observations.length) {
    state = "no_data";
    text = "No NDVI data for this location and period. Nothing is charted and no health statement is made. The water-level layers below still use whatever data is available.";
  } else {
    state = coverage < 1 ? "partial" : "ok";
    const parts: string[] = [];
    if (peak && first && last && observations.length > 1) {
      if (peak.date === last.date) parts.push(`NDVI is still rising: ${first.value.toFixed(2)} on ${fmtD(first.date)} to ${last.value.toFixed(2)} on ${fmtD(last.date)}.`);
      else if (peak.date === first.date) parts.push(`NDVI started at its highest (${first.value.toFixed(2)} on ${fmtD(first.date)}) and ended at ${last.value.toFixed(2)} on ${fmtD(last.date)}.`);
      else parts.push(`NDVI rose from ${first.value.toFixed(2)} (${fmtD(first.date)}) to a peak of ${peak.value.toFixed(2)} (${fmtD(peak.date)}), then moved to ${last.value.toFixed(2)} by ${fmtD(last.date)}.`);
    } else if (last) parts.push(`Only one NDVI observation: ${last.value.toFixed(2)} on ${fmtD(last.date)}, so no trend can be drawn.`);

    if (observations.length > 1) {
      if (!inSeasonDips.length) parts.push(`No in-season drops of ${PH.dipDrop} or more between observations.`);
      else {
        const matched = inSeasonDips.filter((d) => d.linked.length).length;
        parts.push(`${inSeasonDips.length} in-season drop(s) of ${PH.dipDrop}+ ; ${matched} overlap a heat, flood, rain or soil marker (timing only, not proof of cause).`);
      }
    }
    if (coverage < 1) parts.push(`Data coverage is ${Math.round(coverage * 100)}%: ${(["ndvi", "temperature", "rainfall", "soil"] as const).filter((k) => !layers[k]).map((k) => ({ ndvi: "NDVI", temperature: "temperature", rainfall: "rainfall", soil: "soil moisture" }[k])).join(", ")} missing, shown as unknown.`);
    text = parts.join(" ");
  }

  /* --------------------------------- notes ------------------------------- */
  note("NDVI is shown as a trend only. No sourced NDVI thresholds exist, so there is no healthy/stressed verdict.", "Assumption");
  note(`An NDVI "dip" = drop of ${PH.dipDrop} or more between consecutive observations.`, "Assumption");
  note(`Heat marker: daily Tmax ≥ ${PH.heatC}°C inside the flowering window (${PH.flowering[0]} to ${PH.flowering[1]}). Window dates are assumed.`, "Sourced");
  note(`Warm-night marker: Tmin ≥ ${PH.nightC}°C (single study).`, "Assumption");
  note(`Rainy season ${PH.rainySeason[0]} to ${PH.rainySeason[1]}, about ${PH.rainSuitable[0]}–${PH.rainSuitable[1]} mm.`, "Sourced");
  note(`Flood = 3 days totalling ≥ ${PH.flood3DayMm} mm (Jul–Oct); heavy rain ≥ ${PH.heavyDayMm} mm/day; harvest rain ≥ ${PH.harvestRainMinDays} days ≥ ${PH.harvestRainDayMm} mm.`, "Assumption");
  note(`Soil moisture (surface mean in sowing window): ≥ ${PH.soilSuitable} suitable, ${PH.soilMarginal}–<${PH.soilSuitable} marginal, < ${PH.soilMarginal} unsuitable (m³/m³).`, "Assumption");
  if (!layers.temperature) note("Daily max/min temperature missing, so heat and warm-night markers are unknown (a mean cannot show a 35°C spike).", "Sourced");
  if (soil.mode === "snapshot") note("Soil moisture is a single reading, not a time series, so sowing-window mean and moisture loss are unknown.", "Assumption");

  return {
    period: empty ? null : { start: rows[0].date, end: rows[rows.length - 1].date },
    layers, coverage,
    ndvi: { observations, count: observations.length, rejected, first, peak, last },
    dips, markers, stages,
    water: { soil, rain, series },
    summary: { state, text },
    notes,
  };
}

/* ------------------------- adapters / data loading ------------------------ */

/** NASA POWER keys are YYYYMMDD; -999 is the fill value. */
const powerDate = (k: string) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
const powerVal = (v: unknown) => (isNum(v) && v !== -999 ? v : null);

/** Merge the existing environment payload (POWER daily + soil/NDVI series) into daily rows. */
export function rowsFromEnvironment(env: any): DailyRow[] {
  const map = new Map<string, DailyRow>();
  const row = (d: string) => { let r = map.get(d); if (!r) { r = { date: d }; map.set(d, r); } return r; };

  const w = env?.weather;
  if (w) {
    for (const [k, v] of Object.entries(w.T2M ?? {})) row(powerDate(k)).tmean = powerVal(v);
    for (const [k, v] of Object.entries(w.T2M_MAX ?? {})) row(powerDate(k)).tmax = powerVal(v);
    for (const [k, v] of Object.entries(w.T2M_MIN ?? {})) row(powerDate(k)).tmin = powerVal(v);
    for (const [k, v] of Object.entries(w.PRECTOTCORR ?? {})) row(powerDate(k)).rain = powerVal(v);
  }
  for (const p of env?.vegetation?.timeSeries ?? []) if (p?.date) row(p.date).ndvi = isNum(p.ndvi) ? p.ndvi : null;
  // Optional: once smapClient returns a real series ([{date, surface, root}]) it is picked up here.
  for (const p of env?.soil?.timeSeries ?? []) {
    if (!p?.date) continue;
    const r = row(p.date);
    r.soilSurface = isNum(p.surface) ? p.surface : null;
    r.soilRoot = isNum(p.root) ? p.root : null;
  }
  return [...map.values()];
}

export function soilSnapshotFromEnvironment(env: any): SoilSnapshot | null {
  const s = env?.soil;
  if (!s || s.status !== "active" || (s.timeSeries?.length ?? 0) > 0) return null;
  const surface = isNum(s.surfaceMoisture) ? s.surfaceMoisture : null;
  const root = isNum(s.rootZoneMoisture) ? s.rootZoneMoisture : null;
  return surface === null && root === null ? null : { surface, root, date: env?.timeframe?.endDate ?? null };
}

/** Parse the test-guide CSV (date,tmean_c,tmax_c,tmin_c,rain_mm,soil_surface_m3m3,soil_rootzone_m3m3,ndvi). */
export function rowsFromCsv(csv: string): DailyRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines.shift()?.split(",").map((h) => h.trim()) ?? [];
  const idx = (n: string) => head.indexOf(n);
  const num = (c: string[], n: string) => {
    const i = idx(n);
    const s = i >= 0 ? c[i]?.trim() : "";
    if (!s) return null;
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  };
  return lines.filter(Boolean).map((l) => {
    const c = l.split(",");
    return {
      date: c[idx("date")].trim(),
      tmean: num(c, "tmean_c"), tmax: num(c, "tmax_c"), tmin: num(c, "tmin_c"),
      rain: num(c, "rain_mm"),
      soilSurface: num(c, "soil_surface_m3m3"), soilRoot: num(c, "soil_rootzone_m3m3"),
      ndvi: num(c, "ndvi"),
    };
  });
}
