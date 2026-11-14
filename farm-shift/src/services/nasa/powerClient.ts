export async function fetchPowerWeatherData(lat: number, lon: number, startDate: string, endDate: string) {
  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG&longitude=${lon}&latitude=${lat}&start=${startDate}&end=${endDate}&format=JSON`;

  try {
    // { cache: 'no-store' } prevents Next.js from caching response between different lat/lon queries
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error("Failed to fetch NASA POWER");
    const data = await response.json();
    return {
      status: "active",
      parameter: data.properties.parameter
    };
  } catch (error) {
    return {
      status: "unknown",
      parameter: null
    };
  }
}