import type { PlantHealthResult } from "./plantHealth";

export type Num = number | "unknown";

export type PowerSeries = Record<string, number>; 

export type EnvironmentPayload = {
  location: { lat: number; lon: number };
  timeframe: { startDate: string; endDate: string };
  weather: {
    T2M?: PowerSeries;
    T2M_MAX?: PowerSeries;
    T2M_MIN?: PowerSeries;
    PRECTOTCORR?: PowerSeries;
  } | null;
  weatherStatus: string;
  soil?: {
    status: string;
    soilState?: string;
    drainageRisk?: string;
    prototypeAssumption?: string;
    // optional: a real SMAP daily series, picked up automatically by Module 4
    timeSeries?: { date: string; surface: number | null; root: number | null }[];
  };
  vegetation?: { status: string; meanNdvi?: Num };
  rainfall?: {
    status: string;
    accumulatedPrecipitationMm?: number;
    heavyRainDays?: number;
    floodRisk?: string;
    prototypeAssumption?: string;
  };
  imagery?: {
    status: string;
    layerName?: string;
    snapshotDate?: string;
    imageTileUrl?: string;
    cloudCoverEstimate?: string;
    prototypeAssumption?: string;
  };
};

export type DashboardSummary = {
  suitabilityStatus: string;
  suitabilityScore: number | "unknown";
  riskLevel: string;
  reasons: string[];
  limitations: string[];
  dataCoverage: { nasaPower: string; smap: string; viirs: string };
};

export type Evaluation = {
  cropRotation: string;
  dashboardSummary: DashboardSummary;
  module2_soil?: {
    description: string;
    surfaceMoisture: Num;
    rootZoneMoisture: Num;
    periodAverage: Num;
    soilThresholdComparison: string;
    legumeNitrogenBenefit: string;
    prototypeAssumption?: string;
  };
  module3_climate?: {
    description: string;
    status: string;
    extremeHeatDaysAtFlowering: Num;
    riskFlags: string[];
    prototypeAssumption?: string;
  };
  module4_vegetation?: {
    description: string;
    status: string;
    timeSeries: { date: string; ndvi: number }[];
    trend: string;
    healthVerdict: string;
    prototypeAssumption?: string;
    analysis?: PlantHealthResult; // Module 4: NDVI trend + stages + stress markers + water level
  };
};

export type ApiResponse =
  | { success: true; queryLocation: { lat: number; lon: number }; environment: EnvironmentPayload; evaluation: Evaluation }
  | { success: false; error: string };

export type ScenarioResponse =
  | { success: true; scenario: string; analysis: PlantHealthResult }
  | { success: false; error: string };
