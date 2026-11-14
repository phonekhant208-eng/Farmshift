export type Status = "suitable" | "marginal" | "unsuitable" | "unknown";
export type Reliability = "Sourced" | "Assumption";

/** One day of merged inputs. Any field may be null/undefined = missing (never invented). */
export type DailyRow = {
  date: string; // YYYY-MM-DD
  tmean?: number | null;
  tmax?: number | null;
  tmin?: number | null;
  rain?: number | null; // mm/day
  soilSurface?: number | null; // m3/m3
  soilRoot?: number | null; // m3/m3
  ndvi?: number | null;
};

export type StressKind = "heat" | "warm_night" | "flood" | "heavy_rain" | "harvest_rain" | "dry_soil";

export type StressMarker = {
  kind: StressKind;
  start: string;
  end: string;
  days: number;
  label: string;
  detail: string;
  reliability: Reliability;
};

export type NdviObs = { date: string; value: number };

export type NdviDip = {
  from: string;
  to: string;
  fromValue: number;
  toValue: number;
  drop: number; // positive number, e.g. 0.12
  phase: "in_season" | "post_harvest";
  linked: StressKind[]; // stress markers overlapping the dip interval (timing only, not cause)
};

export type CropStage = {
  id: string;
  label: string;
  crop: "rice" | "prep" | "black_gram";
  start: string;
  end: string;
  reliability: Reliability;
};

export type SoilWater = {
  mode: "series" | "snapshot" | "none";
  sowingWindow: { start: string; end: string };
  meanSurface: number | null;
  meanRoot: number | null;
  harvestDate: string;
  sowingDate: string;
  delayDays: number;
  atHarvest: number | null;
  atSowing: number | null;
  moistureLost: number | null;
  lossPerDay: number | null;
  latestDate: string | null;
  latestSurface: number | null;
  latestRoot: number | null;
  status: Status;
  gate: "pass" | "flag" | "unknown";
};

export type RainWater = {
  seasonTotalMm: number | null;
  seasonStatus: Status;
  heavyRainDays: number;
  floodFlag: boolean | null;
  floodFirstStart: string | null;
  harvestRainDays: number | null;
  harvestRainFlag: boolean | null;
};

export type WaterPoint = { date: string; rain: number | null; surface: number | null; root: number | null };

export type PlantHealthResult = {
  period: { start: string; end: string } | null;
  layers: { ndvi: boolean; temperature: boolean; rainfall: boolean; soil: boolean };
  coverage: number; // 0..1 = layers available / 4
  ndvi: {
    observations: NdviObs[];
    count: number;
    rejected: number;
    first: NdviObs | null;
    peak: NdviObs | null;
    last: NdviObs | null;
  };
  dips: NdviDip[];
  markers: StressMarker[];
  stages: CropStage[];
  water: { soil: SoilWater; rain: RainWater; series: WaterPoint[] };
  summary: { state: "no_data" | "partial" | "ok"; text: string };
  notes: { text: string; reliability: Reliability }[];
};

/** Optional scalar soil reading for sources that have no time series yet. */
export type SoilSnapshot = { surface: number | null; root: number | null; date?: string | null };
