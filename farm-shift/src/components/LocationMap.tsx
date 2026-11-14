"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LMap, Marker } from "leaflet";

type Coords = { lat: number; lon: number };

const CSS_ID = "leaflet-css";
const CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const STREET = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";


export default function LocationMap({ value, onPick }: { value: Coords | null; onPick: (lat: number, lon: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  
  const LRef = useRef<any>(null);
  const pickRef = useRef(onPick);
  const fromMap = useRef(false); 
  const [ready, setReady] = useState(false);

  useEffect(() => { pickRef.current = onPick; }, [onPick]);

  
  useEffect(() => {
    let cancelled = false;
    if (!document.getElementById(CSS_ID)) {
      const link = document.createElement("link");
      link.id = CSS_ID; link.rel = "stylesheet"; link.href = CSS_URL;
      document.head.appendChild(link);
    }
    (async () => {
      
      const mod: any = await import("leaflet");
      const L = mod.default ?? mod;
      if (cancelled || !el.current) return;

      const map: LMap = L.map(el.current, { center: [17.0, 95.5], zoom: 7, worldCopyJump: true });
      const street = L.tileLayer(STREET, { maxZoom: 19, attribution: "© OpenStreetMap contributors" });
      const sat = L.tileLayer(SATELLITE, { maxZoom: 18, attribution: "Tiles © Esri" });
      street.addTo(map);
      L.control.layers({ Street: street, Satellite: sat }, undefined, { position: "topright" }).addTo(map);

      map.on("click", (e: { latlng: { wrap: () => { lat: number; lng: number } } }) => {
        const p = e.latlng.wrap();
        fromMap.current = true;
        pickRef.current(p.lat, p.lng);
      });

      LRef.current = L;
      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  
  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!ready || !L || !map) return;

    if (!value) { markerRef.current?.remove(); markerRef.current = null; return; }
    const ll = L.latLng(value.lat, value.lon);

    if (!markerRef.current) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="font-size:30px;line-height:30px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.45))">📍</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 28],
      });
      const m: Marker = L.marker(ll, { icon, draggable: true }).addTo(map);
      m.on("dragend", () => {
        const p = m.getLatLng().wrap();
        fromMap.current = true;
        pickRef.current(p.lat, p.lng);
      });
      markerRef.current = m;
    } else {
      markerRef.current.setLatLng(ll);
    }

    if (fromMap.current) {
      fromMap.current = false;
      if (!map.getBounds().pad(-0.1).contains(ll)) map.panTo(ll);
    } else {
      
      map.flyTo(ll, Math.max(map.getZoom(), 9), { duration: 0.8 });
    }
  }, [ready, value]);

  return (
    <div
      ref={el}
      className="isolate h-80 w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-100 md:h-[26rem]"
      aria-label="Map: click to place a pin on your farm"
    />
  );
}
