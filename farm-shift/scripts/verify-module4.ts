import { readFileSync } from "node:fs";
import { analyzePlantHealth, rowsFromCsv } from "../src/lib/plantHealth.ts";

const exp = JSON.parse(readFileSync("data/test_cases_expected.json", "utf8"));
const map: Record<string, string> = { A: "A_good_season", B: "B_stress_season", C: "C_missing_soil_ndvi" };
let fail = 0;
const eq = (name: string, got: unknown, want: unknown, tol = 0) => {
  const ok = typeof got === "number" && typeof want === "number" ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`  FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log(`  ok   ${name}: ${JSON.stringify(got)}`);
};

for (const s of ["A", "B", "C"]) {
  console.log(`\n=== Scenario ${s}`);
  const r = analyzePlantHealth(rowsFromCsv(readFileSync(`data/scenarios/scenario_${s}.csv`, "utf8")));
  const e = exp.scenarios[map[s]];
  const m2 = e.module2, m3 = e.module3, m4 = e.module4;
  const so = r.water.soil, ra = r.water.rain;

  eq("soil.meanSurface", so.meanSurface === null ? null : +so.meanSurface.toFixed(3), m2.mean_surface_in_window, 0.0006);
  eq("soil.meanRoot", so.meanRoot === null ? null : +so.meanRoot.toFixed(3), m2.mean_rootzone_in_window, 0.0006);
  eq("soil.atHarvest", so.atHarvest, m2.sm_at_harvest, 0.0006);
  eq("soil.atSowing", so.atSowing, m2.sm_at_sowing, 0.0006);
  eq("soil.moistureLost", so.moistureLost === null ? null : +so.moistureLost.toFixed(3), m2.moisture_lost, 0.0006);
  eq("soil.lossPerDay", so.lossPerDay === null ? null : +so.lossPerDay.toFixed(4), m2.loss_per_day, 0.00006);
  eq("soil.status", so.status, m2.status);
  eq("soil.gate", so.gate, m2.black_gram_gate);

  const heat = r.markers.filter((x) => x.kind === "heat").reduce((a, x) => a + x.days, 0);
  const night = r.markers.filter((x) => x.kind === "warm_night").reduce((a, x) => a + x.days, 0);
  eq("heat days", heat, m3.hot_days_tmax_ge_35);
  eq("warm nights", night, m3.warm_nights_tmin_ge_27);
  eq("season rain", ra.seasonTotalMm, m3.rainy_season_total_mm, 0.15);
  eq("heavy rain days", ra.heavyRainDays, m3.heavy_rain_days_ge_50mm.length);
  eq("flood flag", ra.floodFlag, m3.flood_flag_3day_ge_200mm);
  eq("flood first start", ra.floodFirstStart, m3.flood_first_window_start);
  eq("harvest rain days", ra.harvestRainDays, m3.harvest_rain_days_ge_10mm);
  eq("harvest rain flag", ra.harvestRainFlag, m3.harvest_rain_flag);

  eq("ndvi n_obs", r.ndvi.count, m4.n_obs);
  if (m4.n_obs) {
    eq("ndvi first", [r.ndvi.first!.date, r.ndvi.first!.value], m4.first);
    eq("ndvi peak", [r.ndvi.peak!.date, r.ndvi.peak!.value], m4.peak);
    eq("ndvi last", [r.ndvi.last!.date, r.ndvi.last!.value], m4.last);
    eq("dips before 15 Oct", r.dips.filter((d) => d.phase === "in_season").map((d) => [d.from, d.to, -d.drop]), m4.drops_ge_0_08_before_oct15);
    console.log("  all dips:", r.dips.map((d) => `${d.from}->${d.to} -${d.drop} [${d.phase}] linked=${d.linked.join("+") || "none"}`));
  }
  console.log("  coverage:", r.coverage, "state:", r.summary.state);
  console.log("  summary:", r.summary.text);
}

console.log("\n=== Edge E: everything missing");
const E = analyzePlantHealth([]);
eq("E coverage", E.coverage, 0); eq("E state", E.summary.state, "no_data");
eq("E soil status", E.water.soil.status, "unknown"); eq("E season status", E.water.rain.seasonStatus, "unknown");

console.log("\n=== Edge F: only tmean present");
const F = analyzePlantHealth(rowsFromCsv(readFileSync("data/scenarios/scenario_B.csv", "utf8")).map((r) => ({ ...r, tmax: null, tmin: null })));
eq("F temperature layer", F.layers.temperature, false);
eq("F heat markers", F.markers.filter((x) => x.kind === "heat" || x.kind === "warm_night").length, 0);
eq("F rain still runs", F.water.rain.seasonTotalMm, 2792, 0.15);
console.log(F.notes.filter((n) => /missing/.test(n.text)).map((n) => n.text));

console.log("\n=== Short period (live default, May only) must not fake season stats");
const short = analyzePlantHealth(rowsFromCsv(readFileSync("data/scenarios/scenario_B.csv", "utf8")).filter((r) => r.date <= "2025-05-31"));
eq("short season total", short.water.rain.seasonTotalMm, null); eq("short season status", short.water.rain.seasonStatus, "unknown");
eq("short flood flag", short.water.rain.floodFlag, null); eq("short soil status", short.water.soil.status, "unknown");

console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
