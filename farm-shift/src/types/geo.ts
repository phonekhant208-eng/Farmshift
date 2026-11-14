export type LatLon = [number, number];

export function centroid(zone: LatLon[]): LatLon {
  const n = zone.length || 1;
  return [zone.reduce((s, p) => s + p[0], 0) / n, zone.reduce((s, p) => s + p[1], 0) / n];
}

/** Approximate area in hectares (fine for field-sized shapes). */
export function areaHa(zone: LatLon[]): number {
  if (zone.length < 3) return 0;
  const [lat0, lon0] = zone[0];
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const pts = zone.map(([la, lo]) => [(lo - lon0) * kx, (la - lat0) * ky]);
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2 / 10000;
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const haToAcre = (ha: number) => ha * 2.47105;