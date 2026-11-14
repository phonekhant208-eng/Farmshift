// Reads Myanmar's entry from the MAIN source file: data/global_agriculture_cities_by_country.json
// (country -> capital + representative agriculture city). The JSON has names only, so the
// coordinates of those two cities live in CITY_COORDS below.
import raw from "../../data/global_agriculture_cities_by_country.json";
import type { City } from "@/components/MyanmarGlobe";

const CITY_COORDS: Record<string, [number, number]> = {
  "Nay Pyi Taw": [19.7633, 96.0785],
  Pathein: [16.7791, 94.7325],
};

type Country = { country: string; capital: string; agricultureCity?: { name: string; rationale?: string } };

function findCountry(name: string): Country | null {
  for (const cont of (raw as any).continents)
    for (const reg of cont.regions ?? [])
      for (const c of reg.countries ?? []) if (c.country === name) return c as Country;
  return null;
}

const mm = findCountry("Myanmar");

export const MYANMAR_CITIES: City[] = [
  mm && CITY_COORDS[mm.capital] && { name: mm.capital, role: "Capital", lat: CITY_COORDS[mm.capital][0], lon: CITY_COORDS[mm.capital][1] },
  mm?.agricultureCity && CITY_COORDS[mm.agricultureCity.name] && {
    name: mm.agricultureCity.name,
    role: "Agriculture city",
    lat: CITY_COORDS[mm.agricultureCity.name][0],
    lon: CITY_COORDS[mm.agricultureCity.name][1],
  },
].filter(Boolean) as City[];