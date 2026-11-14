import { supabase } from "../../../lib/supabaseClient";
import { getToken } from "../../../lib/authApi";
import type { LatLon } from "../../../types/geo";

export type LogKind = "water" | "fertilize" | "weed" | "pest" | "note" | "harvest";
export type Plot = {
  id: string; plant: string; region: string | null; lat: number; lon: number; zone: LatLon[];
  area_ha: number | null; planted_on: string; status: "growing" | "harvested"; harvested_on: string | null; created_at: string;
};
export type PlotLog = { id: string; plot_id: string; kind: LogKind; note: string | null; created_at: string };
/** Read-only view of any farmer's growing zone. */
export type PublicPlot = {
  id: string; plant: string; region: string | null; lat: number; lon: number; zone: LatLon[]; planted_on: string;
  owner: string; is_mine: boolean; last_water: string | null; last_log_at: string | null;
};

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("Please log in first.");
  const { data, error } = await supabase.rpc(fn, { p_token: token, ...args });
  if (error) throw new Error(error.message);
  return data as T;
}

export const listPlots = () => call<Plot[]>("list_plots");
export const listPublicPlots = () => call<PublicPlot[]>("list_public_plots");
/**
 * Every growing zone: other farmers' (list_public_plots) + my own (list_plots).
 * My own always show, even if list_public_plots is not installed yet (sharedOk = false then).
 */
export async function listAllZones(): Promise<{ plots: PublicPlot[]; sharedOk: boolean }> {
  const [mine, shared] = await Promise.allSettled([listPlots(), listPublicPlots()]);
  if (mine.status === "rejected" && shared.status === "rejected") throw shared.reason;
  const plots: PublicPlot[] = shared.status === "fulfilled" ? [...shared.value] : [];
  if (mine.status === "fulfilled") {
    for (const p of mine.value) {
      if (p.status !== "growing") continue;
      const i = plots.findIndex((x) => x.id === p.id);
      if (i >= 0) { plots[i] = { ...plots[i], is_mine: true }; continue; }
      plots.push({ id: p.id, plant: p.plant, region: p.region, lat: p.lat, lon: p.lon, zone: p.zone, planted_on: p.planted_on, owner: "You", is_mine: true, last_water: null, last_log_at: null });
    }
  }
  return { plots, sharedOk: shared.status === "fulfilled" };
}
export const listLogs = () => call<PlotLog[]>("list_logs");
export const addLog = (plotId: string, kind: LogKind, note?: string) =>
  call<PlotLog>("add_log", { p_plot: plotId, p_kind: kind, p_note: note ?? null });
export const deletePlot = (plotId: string) => call<void>("delete_plot", { p_plot: plotId });
export const createPlot = (a: {
  plant: string; region: string | null; lat: number; lon: number; zone: LatLon[]; areaHa: number; plantedOn: string;
}) =>
  call<Plot>("create_plot", {
    p_plant: a.plant, p_region: a.region, p_lat: a.lat, p_lon: a.lon,
    p_zone: a.zone, p_area_ha: Number(a.areaHa.toFixed(3)), p_planted_on: a.plantedOn,
  });