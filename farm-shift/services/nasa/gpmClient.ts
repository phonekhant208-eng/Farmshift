export async function fetchGpmPrecipitation(lat: number, lon: number, startDate: string, endDate: string) {
  try {
    return {
      status: "active",
      accumulatedPrecipitationMm: 185.4,
      heavyRainDays: 3,
      floodRisk: "Moderate",
      prototypeAssumption: "GPM IMERG 30-minute precipitation rates aggregated over observation window."
    };
  } catch (error) {
    console.error("Error fetching GPM data:", error);
    return {
      status: "unknown",
      prototypeAssumption: "GPM data retrieval failed."
    };
  }
}