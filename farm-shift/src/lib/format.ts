const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];


export function shortDate(raw: string): string {
  const s = raw.replace(/-/g, "");
  if (s.length !== 8) return raw;
  return `${MONTHS[parseInt(s.slice(4, 6), 10) - 1]} ${parseInt(s.slice(6, 8), 10)}`;
}


export function powerPoints(series?: Record<string, number>) {
  if (!series) return [];
  return Object.entries(series)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ label: shortDate(k), value: v === -999 || v == null ? null : v }));
}

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function avg(vals: (number | null)[]): number | null {
  const n = vals.filter(isNum);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
}

export function sum(vals: (number | null)[]): number | null {
  const n = vals.filter(isNum);
  return n.length ? n.reduce((a, b) => a + b, 0) : null;
}

export const fmt = (v: unknown, digits = 1, suffix = ""): string =>
  isNum(v) ? `${v.toFixed(digits)}${suffix}` : "—";