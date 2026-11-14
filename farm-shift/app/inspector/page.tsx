"use client";
import { useEffect, useState } from "react";


const LOCATIONS = [
  { name: "Pathein Township (Delta Center)", lat: 16.7845, lon: 94.7336 },
  { name: "Hinthada District (Upper Delta)", lat: 17.6447, lon: 95.4623 },
  { name: "Myaungmya Region", lat: 16.5862, lon: 95.0357 },
  { name: "Yangon Test Node", lat: 16.8661, lon: 96.1951 }
];

export default function Home() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState<string>("dashboard");

  
  const [selectedLocationName, setSelectedLocationName] = useState(LOCATIONS[0].name);
  const [lat, setLat] = useState<number>(LOCATIONS[0].lat);
  const [lon, setLon] = useState<number>(LOCATIONS[0].lon);

  
  useEffect(() => {
    setLoading(true);
    fetch(`/api/environment?lat=${lat}&lon=${lon}`)
      .then((res) => res.json())
      .then((resData) => {
        setData(resData);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [lat, lon]);

  const handleLocationPresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const locName = e.target.value;
    setSelectedLocationName(locName);
    const found = LOCATIONS.find((l) => l.name === locName);
    if (found) {
      setLat(found.lat);
      setLon(found.lon);
    }
  };

  const getModulePayload = () => {
    if (!data || !data.success) return data;
    switch (activeModule) {
      case "dashboard":
        return { view: "Module 1 - Master Dashboard Summary", queryLocation: data.queryLocation, ...data.evaluation.dashboardSummary, targetRotation: data.evaluation.cropRotation };
      case "soil":
        return { view: "Module 2 - SMAP Soil & Root Zone Analysis", queryLocation: data.queryLocation, ...data.evaluation.module2_soil };
      case "weather":
        return { view: "Module 3 - Climate & Extreme Weather Risks", queryLocation: data.queryLocation, ...data.evaluation.module3_climate };
      case "vegetation":
        return { view: "Module 4 - MODIS/VIIRS NDVI Time-Series & Trend", queryLocation: data.queryLocation, ...data.evaluation.module4_vegetation };
      case "raw_full":
        return data;
      default:
        return data;
    }
  };

  return (
    <main className="min-h-screen bg-stone-950 text-stone-100 p-6 md:p-10 font-mono">
      <header className="mb-6 border-b border-stone-800 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-emerald-400">
            FarmShift Backend Module Inspector
          </h1>
          <p className="text-xs text-stone-400 mt-1">
            Test multi-source NASA telemetry & rotation engine across different delta locations.
          </p>
        </div>

        
        <div className="bg-stone-900 border border-stone-800 p-3 rounded-xl flex flex-col gap-2 w-full md:w-auto">
          <div className="flex items-center justify-between gap-4">
            <label className="text-xs text-emerald-400 font-semibold uppercase">Location Preset:</label>
            <select
              value={selectedLocationName}
              onChange={handleLocationPresetChange}
              className="bg-stone-950 text-stone-200 text-xs px-2 py-1 rounded border border-stone-700 cursor-pointer"
            >
              {LOCATIONS.map((loc) => (
                <option key={loc.name} value={loc.name}>{loc.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 text-xs text-stone-400 pt-1 border-t border-stone-800">
            <span>Lat: <input type="number" step="0.0001" value={lat} onChange={(e) => setLat(parseFloat(e.target.value) || 0)} className="w-20 bg-stone-950 text-emerald-300 px-1 py-0.5 rounded border border-stone-700 font-mono" /></span>
            <span>Lon: <input type="number" step="0.0001" value={lon} onChange={(e) => setLon(parseFloat(e.target.value) || 0)} className="w-20 bg-stone-950 text-emerald-300 px-1 py-0.5 rounded border border-stone-700 font-mono" /></span>
          </div>
        </div>
      </header>

     
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: "dashboard", label: "Module 1 (Dashboard Summary)" },
          { id: "soil", label: "Module 2 (SMAP Soil & Rotation)" },
          { id: "weather", label: "Module 3 (Climate & Extremes)" },
          { id: "vegetation", label: "Module 4 (NDVI Trend)" },
          { id: "raw_full", label: "Full Master Object" },
        ].map((btn) => (
          <button
            key={btn.id}
            onClick={() => setActiveModule(btn.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeModule === btn.id
                ? "bg-emerald-600 text-white"
                : "bg-stone-900 text-stone-400 hover:bg-stone-800 hover:text-stone-200"
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

     
      <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 shadow-xl">
        <div className="flex justify-between items-center mb-3 pb-2 border-b border-stone-800">
          <span className="text-xs text-emerald-400 font-semibold uppercase">
            Active Module: {activeModule} | Target: {selectedLocationName} ({lat}, {lon})
          </span>
          <span className="text-xs text-stone-500">{loading ? "Fetching Satellite Streams..." : "Status: 200 OK"}</span>
        </div>

        {loading ? (
          <div className="py-20 text-center text-emerald-400 animate-pulse text-xs">
            Querying NASA POWER, SMAP, and VIIRS endpoints for coordinates [{lat}, {lon}]...
          </div>
        ) : (
          <pre className="text-xs text-emerald-300 overflow-auto max-h-[600px] leading-relaxed">
            {JSON.stringify(getModulePayload(), null, 2)}
          </pre>
        )}
      </div>
    </main>
  );
}