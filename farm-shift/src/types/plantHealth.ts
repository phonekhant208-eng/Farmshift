// src/types/plantHealth.ts
// Types only. Must NOT import from "@/lib/plantHealth" (that caused the circular alias error).

export type Status = "suitable" | "marginal" | "unsuitable" | "unknown";
export type Reliability = "Sourced" | "Assumption";
export type StressKind = "heat" | "warm_night" | "heavy_rain" | "flood" | "harvest_rain" | "dry_soil";

export type DailyRow = {
  date: string; // YYYY-MM-DD
  tmean?: number | null;
  tmax?: number | null;
  tmin?: number | null;
  rain?: number | null;
  soilSurface?: number | null;
  soilRoot?: number | null;
  ndvi?: number | null;
};

export type SoilSnapshot = {
  surface?: number | null;
  root?: number | null;
  date?: string | null;
};

export type NdviObs = { date: string; value: number };

export type NdviDip = {
  from: string;
  to: string;
  fromValue: number;
  toValue: number;
  drop: number;
  phase: "in_season" | "post_harvest";
  linked: StressKind[];
};

export type StressMarker = {
  kind: StressKind;
  start: string;
  end: string;
  days: number;
  label: string;
  detail: string;
  reliability: Reliability;
};

export type CropStage = {
  id: string;
  label: string;
  crop: "rice" | "prep" | "black_gram";
  start: string;
  end: string;
  reliability: Reliability;
};

export type WaterPoint = {
  date: string;
  rain: number | null;
  surface: number | null;
  root: number | null;
  tmax?: number | null; // daily highest temperature, °C
  tmin?: number | null; // daily lowest temperature, °C
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

export type PlantHealthResult = {
  period: { start: string; end: string } | null;
  layers: { temperature: boolean; rainfall: boolean; soil: boolean; ndvi: boolean };
  coverage: number;
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