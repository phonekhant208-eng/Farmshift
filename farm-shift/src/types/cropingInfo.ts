import data from "../../data/myanmar_plants.json";

export type Suggestion = { plant: string; suitability: string; reason: string; farmer_tip: string };
export type Cycle = { cycle_name: string; sequence: string; benefit: string; farmer_tip: string };
type Area = { region: string; five_recommended_plants: Suggestion[]; three_agricultural_cycles: Cycle[] };

const areas = (data as { regions: Area[] }).regions;
export const AREA_NAMES = areas.map((a) => a.region);

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z]/g, "").replace(/naypyi[td]aw/, "naypyidaw")
    .replace(/(unionterritory|state|region|division)$/, "");

/** Match the map's region name ("Ayeyarwady", "Shan"...) to an area in the JSON. */
export function findArea(name?: string | null): string | null {
  if (!name) return null;
  const n = norm(name);
  const exact = areas.find((a) => norm(a.region) === n);
  if (exact) return exact.region;
  const pre = areas.find((a) => norm(a.region).slice(0, 4) === n.slice(0, 4));
  return pre?.region ?? null;
}

export const areaData = (area: string | null) => areas.find((a) => a.region === area) ?? null;
export const tipFor = (area: string | null, plant: string) =>
  areaData(area)?.five_recommended_plants.find((p) => p.plant === plant)?.farmer_tip ?? null;

/** Rough days from planting to harvest. Typical ranges only; null = long-term (tree/perennial) crop. */
export const CYCLE_DAYS: Record<string, [number, number] | null> = {
  "Rice/Paddy": [110, 140], "Upland Rice": [110, 140], Maize: [100, 120], "Black Gram": [70, 90],
  Chickpea: [90, 110], "Pigeon Pea": [150, 180], Groundnut: [100, 130], Sesame: [80, 100],
  Soybean: [90, 110], Sorghum: [100, 120], Millet: [70, 100], Wheat: [110, 130], Cotton: [150, 180],
  Sugarcane: [300, 365], Onion: [100, 120], Potato: [90, 120], Tomato: [70, 100], Vegetables: [40, 70],
  "Leafy Vegetables": [25, 45], "Flowers/Ornamentals": [60, 100], Banana: [270, 365],
  Tea: null, Coffee: null, Rubber: null, Coconut: null, Cashew: null,
};

export const daysSince = (isoDate: string) =>
  Math.max(0, Math.floor((Date.now() - Date.parse(`${isoDate}T00:00:00`)) / 86_400_000));

export function growth(plant: string, plantedOn: string) {
  const days = daysSince(plantedOn);
  const c = CYCLE_DAYS[plant];
  if (!c) return { days, stage: days < 365 ? "Young plant" : "Established", pct: null as number | null, left: null as number | null };
  const pct = Math.min(1, days / c[1]);
  const stage = days >= c[0] ? "Ready to harvest (typical)" : pct < 0.2 ? "Seedling" : pct < 0.6 ? "Growing" : "Maturing";
  return { days, stage, pct, left: Math.max(0, c[0] - days) };
}