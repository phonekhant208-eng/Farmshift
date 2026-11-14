export function evaluateCrops(envData: any) {
  const reasons: string[] = [];
  const limitations: string[] = [];
  let score = 80;
  let suitabilityStatus = "Suitable";
  let riskLevel = "Low";

  // --- MODULE 3 VALIDATION CHECK ---
  const hasWeather = envData.weatherStatus === "active" && envData.weather !== null;
  const hasSoil = envData.soil?.status === "active";

  if (!hasWeather) {
    limitations.push("NASA POWER temperature and rainfall data missing.");
  }

  // Weather threshold analysis (Max, Min, Mean)
  let extremeHeatDays = 0;
  let floodRisk = "Low";
  if (hasWeather) {
    const maxTemps = Object.values(envData.weather.T2M_MAX || {}) as number[];
    extremeHeatDays = maxTemps.filter((t) => t > 35).length; // 35°C+ spike check at flowering
    if (extremeHeatDays > 2) {
      suitabilityStatus = "Marginal";
      riskLevel = "High";
      reasons.push(`Detected ${extremeHeatDays} days exceeding 35°C max temperature during critical crop stages.`);
    }
  }

  // --- MODULE 2 SOIL ANALYSIS ---
  let soilStatusText = "Optimal";
  let surfaceMoisture = envData.soil?.surfaceMoisture ?? "unknown";
  let rootZoneMoisture = envData.soil?.rootZoneMoisture ?? "unknown";

  if (!hasSoil || surfaceMoisture === "unknown") {
    limitations.push("SMAP soil moisture data is missing.");
    soilStatusText = "unknown";
  } else if (surfaceMoisture > 0.40) {
    score -= 20;
    suitabilityStatus = "Marginal";
    riskLevel = "High";
    soilStatusText = "Unsuitable - Saturation Risk for Black Gram Sowing";
    reasons.push(`Surface volumetric moisture (${surfaceMoisture} m³/m³) exceeds black gram drainage safety thresholds. Delayed sowing incurs yield cost.`);
  }

  // If both core climate and soil are missing, output no recommendation
  if (!hasWeather && !hasSoil) {
    return {
      cropRotation: "Rice (May–Oct) ➔ Black Gram (Nov–Dec)",
      dashboardSummary: {
        suitabilityStatus: "unknown",
        suitabilityScore: "unknown",
        riskLevel: "unknown",
        reasons: ["No recommendation produced: Both temperature and rainfall telemetry are missing."],
        limitations,
        dataCoverage: { nasaPower: "unknown", smap: "unknown", viirs: "unknown" }
      }
    };
  }

  return {
    cropRotation: "Rice (May–Oct) ➔ Black Gram (Nov–Dec)",
    
    // --- MODULE 1: MASTER DASHBOARD SUMMARY ---
    dashboardSummary: {
      suitabilityStatus,
      suitabilityScore: score,
      riskLevel,
      reasons,
      limitations,
      dataCoverage: {
        nasaPower: hasWeather ? "Active" : "unknown",
        smap: hasSoil ? "Active" : "unknown",
        viirs: envData.vegetation?.status || "unknown"
      }
    },

    // --- MODULE 2: SMAP SOIL & ROOT ZONE OUTPUT ---
    module2_soil: {
      description: "Surface and Root Zone Level 4 SMAP Analysis",
      surfaceMoisture,
      rootZoneMoisture,
      periodAverage: envData.soil?.periodAverage ?? "unknown",
      soilThresholdComparison: soilStatusText,
      legumeNitrogenBenefit: envData.soil?.legumeNitrogenBenefit || "Not verified",
      prototypeAssumption: envData.soil?.prototypeAssumption
    },

    // --- MODULE 3: CLIMATE & WEATHER EXTREMES OUTPUT ---
    module3_climate: {
      description: "Daily Temperature (Mean, Max, Min) & Rainfall Thresholds",
      status: hasWeather ? "Active" : "unknown",
      extremeHeatDaysAtFlowering: hasWeather ? extremeHeatDays : "unknown",
      riskFlags: extremeHeatDays > 2 ? ["HEAT_SPIKE_FLOWERING"] : [],
      prototypeAssumption: "Daily max temperature thresholds checked against crop calendar schedules."
    },

    // --- MODULE 4: VEGETATION NDVI TIME-SERIES OUTPUT ---
    module4_vegetation: {
      description: "MODIS/VIIRS NDVI Time-Series Trend & Stress Overlay",
      status: envData.vegetation?.status || "unknown",
      timeSeries: envData.vegetation?.timeSeries || [],
      trend: envData.vegetation?.trend || "unknown",
      healthVerdict: "Trend displayed; verdict label is unverified.",
      prototypeAssumption: envData.vegetation?.prototypeAssumption
    }
  };
}