"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { LatLon } from "@/types/geo";

export type OtherZone = { id: string; zone: LatLon[]; title: string; detail?: string; mine?: boolean };

/**
 * Flat satellite map (Esri World Imagery) used to draw or show field zones.
 * editable  -> every tap adds a corner (onChange gets the new list)
 * !editable -> just shows the zones, zoomed to fit
 * others    -> other farmers' zones: brown, read-only, tap for plant status (green if mine)
 * invalid   -> draws your zone red (overlap / crossing lines)
 */
export default function ZoneMap({
  center, zoom = 16, zone, onChange, editable = false, className = "h-72", others = [], invalid = false,
}: {
  center: LatLon; zoom?: number; zone: LatLon[]; onChange?: (z: LatLon[]) => void; editable?: boolean;
  className?: string; others?: OtherZone[]; invalid?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const zoneRef = useRef(zone);
  const cbRef = useRef(onChange);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { zoneRef.current = zone; cbRef.current = onChange; });

  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | undefined;
    (async () => {
      const L = await import("leaflet"); // loaded in the browser only
      if (cancelled || !el.current) return;
      LRef.current = L;
      map = L.map(el.current, { center, zoom, maxZoom: 19 });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      if (editable) map.on("click", (e: Leaflet.LeafletMouseEvent) => cbRef.current?.([...zoneRef.current, [e.latlng.lat, e.latlng.lng]]));
      mapRef.current = map;
      setReady(true);
    })();
    return () => { cancelled = true; map?.remove(); mapRef.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = LRef.current, layer = layerRef.current, map = mapRef.current;
    if (!ready || !L || !layer || !map) return;
    layer.clearLayers();

    // other farmers' zones (taps pass through while drawing)
    for (const o of others) {
      if (o.zone.length < 3) continue;
      const poly = L.polygon(o.zone, o.mine
        ? { color: "#4ade80", weight: 3, fillColor: "#22c55e", fillOpacity: 0.3, interactive: !editable }
        : { color: "#d97706", weight: 2, fillColor: "#92400e", fillOpacity: 0.35, interactive: !editable }).addTo(layer);
      if (!editable) {
        const box = document.createElement("div");
        const t = document.createElement("strong"); t.textContent = o.title; box.appendChild(t);
        if (o.detail) { const d = document.createElement("div"); d.textContent = o.detail; box.appendChild(d); }
        poly.bindPopup(box);
      }
    }

    if (editable) {
      L.circle(center, { radius: 40, color: "#f97316", weight: 2, fillOpacity: 0.15, dashArray: "4 4" }).addTo(layer); // your pin
    }
    const mine = invalid
      ? { color: "#ef4444", weight: 3, fillColor: "#dc2626", fillOpacity: 0.35 }
      : { color: "#4ade80", weight: 3, fillColor: "#22c55e", fillOpacity: 0.3 };
    if (zone.length >= 3) L.polygon(zone, { ...mine, interactive: false }).addTo(layer);
    else if (zone.length === 2) L.polyline(zone, { color: mine.color, weight: 3, interactive: false }).addTo(layer);
    if (editable) zone.forEach((p) => L.circleMarker(p, { radius: 6, color: "#fff", weight: 2, fillColor: invalid ? "#dc2626" : "#16a34a", fillOpacity: 1, interactive: false }).addTo(layer));

    if (!editable && !fitted.current) {
      const pts = zone.length >= 3 ? zone : others.flatMap((o) => o.zone);
      if (pts.length >= 3) {
        fitted.current = true;
        map.fitBounds(L.latLngBounds(pts), { maxZoom: 18, padding: [24, 24] });
      }
    }
  }, [ready, zone, editable, center, others, invalid]);

  return (
    <div className={`relative isolate z-0 overflow-hidden rounded-2xl ring-1 ring-stone-300 ${className}`}>
      <div ref={el} className="h-full w-full bg-stone-200" />
    </div>
  );
}