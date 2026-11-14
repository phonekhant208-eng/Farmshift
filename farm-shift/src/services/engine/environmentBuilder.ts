import { fetchPowerWeatherData } from '../nasa/powerClient';
import { fetchSmapSoilData } from '../nasa/smapClient';
import { fetchViirsNdviData } from '../nasa/viirsClient';
import { fetchGpmPrecipitation } from '../nasa/gpmClient';   
import { fetchGibsImageryData } from '../nasa/gibsClient';   

export async function buildEnvironmentData(lat: number, lon: number, startDate: string, endDate: string) {
  // Execute all 5 NASA satellite streams in parallel
  const [powerRes, smapData, viirsData, gpmData, gibsData] = await Promise.all([
    fetchPowerWeatherData(lat, lon, startDate, endDate),
    fetchSmapSoilData(lat, lon, startDate, endDate),
    fetchViirsNdviData(lat, lon, startDate, endDate),
    fetchGpmPrecipitation(lat, lon, startDate, endDate),
    fetchGibsImageryData(lat, lon, startDate, endDate) 
  ]);

  return {
    location: { lat, lon },
    timeframe: { startDate, endDate },
    weather: powerRes.status === "active" ? powerRes.parameter : null,
    weatherStatus: powerRes.status,
    soil: smapData,
    vegetation: viirsData,
    rainfall: gpmData,
    imagery: gibsData
  };
}