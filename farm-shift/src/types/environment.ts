export type EnvironmentData = {
  location: { latitude: number; longitude: number };
  period: { start: string; end: string };
  temperatureC?: number | null; // average 
  precipitationMm?: number | null; // total
  soilMoisture?: number | null; 
  ndvi?: number | null; 
  sources: Array<{
    name: string;
    product?: string;
    retrievedAt: string;
    temporalResolution?: string;
  }>;
  warnings: string[];
};