import type { LatLon } from "@/types/geo";

// x = lon, y = lat. UX pre-check only; the database trigger is the real guard.
const cross = (o: LatLon, a: LatLon, b: LatLon) =>
  (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);

function segCross(a: LatLon, b: LatLon, c: LatLon, d: LatLon) {
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

function inside(p: LatLon, poly: LatLon[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const mean = (z: LatLon[]): LatLon => [z.reduce((s, p) => s + p[0], 0) / z.length, z.reduce((s, p) => s + p[1], 0) / z.length];

/** True if the zone's own edges cross each other. */
export function selfIntersects(z: LatLon[]) {
  const n = z.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // neighbours share a corner
      if (segCross(z[i], z[(i + 1) % n], z[j], z[(j + 1) % n])) return true;
    }
  return false;
}

/** True if two zones share area. Touching borders are allowed. */
export function zonesOverlap(a: LatLon[], b: LatLon[]) {
  if (a.length < 3 || b.length < 3) return false;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      if (segCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  return a.some((p) => inside(p, b)) || b.some((p) => inside(p, a)) || inside(mean(a), b) || inside(mean(b), a);
}

/** True if a point [lat, lon] lies inside a zone. */
export const pointInZone = (p: LatLon, z: LatLon[]) => z.length >= 3 && inside(p, z);