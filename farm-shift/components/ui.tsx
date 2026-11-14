import type { ReactNode } from "react";

export function Card({ title, subtitle, badge, children, className = "" }: {
  title: string; subtitle?: string; badge?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-stone-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}


export function SourceBadge({ live }: { live: boolean }) {
  return live ? (
    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">Live NASA data</span>
  ) : (
    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">Prototype estimate</span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-stone-900">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-stone-400">{hint}</div>}
    </div>
  );
}

const TONES: Record<string, { text: string; bg: string; ring: string; stroke: string }> = {
  good: { text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200", stroke: "#059669" },
  warn: { text: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200", stroke: "#d97706" },
  bad: { text: "text-red-700", bg: "bg-red-50", ring: "ring-red-200", stroke: "#dc2626" },
  none: { text: "text-stone-600", bg: "bg-stone-100", ring: "ring-stone-200", stroke: "#a8a29e" },
};

export function toneFor(status: string) {
  const s = status.toLowerCase();
  if (s === "suitable" || s === "low" || s === "active") return TONES.good;
  if (s === "marginal" || s === "moderate" || s === "medium") return TONES.warn;
  if (s === "unsuitable" || s === "high") return TONES.bad;
  return TONES.none;
}

export function Pill({ children, status }: { children: ReactNode; status: string }) {
  const t = toneFor(status);
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${t.bg} ${t.text} ${t.ring}`}>{children}</span>;
}

export function ScoreRing({ score, status }: { score: number | "unknown"; status: string }) {
  const r = 52, c = 2 * Math.PI * r;
  const pct = typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;
  const t = toneFor(status);
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e7e5e4" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={t.stroke} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-3xl font-bold text-stone-900">{typeof score === "number" ? score : "—"}</div>
          <div className="text-[11px] uppercase tracking-wide text-stone-500">/ 100</div>
        </div>
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-stone-200/70 ${className}`} />;
}


export function Gauge({ value, max, threshold, thresholdLabel, color }: {
  value: number; max: number; threshold: number; thresholdLabel: string; color: string;
}) {
  const p = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div>
      <div className="relative h-3 rounded-full bg-stone-200">
        <div className="h-3 rounded-full" style={{ width: p(value), background: color, transition: "width .5s" }} />
        <div className="absolute -top-1 h-5 w-0.5 bg-red-500" style={{ left: p(threshold) }} />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-stone-500">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2 text-red-600" style={{ left: p(threshold) }}>{thresholdLabel}</span>
        <span className="absolute right-0">{max}</span>
      </div>
    </div>
  );
}
