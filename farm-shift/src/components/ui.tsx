import type { ReactNode } from "react";

/* ------------------------------- icons ------------------------------- */
export type IconName = "pin" | "drop" | "globe" | "cloud" | "leaf" | "check" | "alert" | "sun";

const ICONS: Record<IconName, ReactNode> = {
  pin: (<><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>),
  drop: <path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3Z" />,
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c3 3 3 15 0 18-3-3-3-15 0-18Z" /></>),
  cloud: <path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 9.5 4.25 4.25 0 0 0 7 18Z" />,
  leaf: (<><path d="M12 21v-8" /><path d="M12 13c0-4 2.5-6.5 7-6.5 0 4-2.5 6.5-7 6.5Z" /><path d="M12 15c0-3-2-5-6-5 0 3 2 5 6 5Z" /></>),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: (<><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4.5" /><path d="M12 17.5v.01" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>),
};

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

/* -------------------------------- card -------------------------------- */
// `icon` is either an icon name or a number (a numbered step).
export function Card({ title, subtitle, badge, icon, children, className = "" }: {
  title: string; subtitle?: string; badge?: ReactNode; icon?: IconName | number; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-stone-200/70 bg-white shadow-[0_1px_2px_rgba(58,45,34,0.04),0_18px_40px_-24px_rgba(29,112,47,0.35)] ${className}`}>
      <header className="flex items-start justify-between gap-3 px-6 pt-6">
        <div className="flex items-start gap-3.5">
          {typeof icon === "number" ? (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-base font-bold text-white">{icon}</span>
          ) : icon ? (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"><Icon name={icon} /></span>
          ) : null}
          <div>
            <h2 className="text-xl font-bold leading-tight text-stone-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
          </div>
        </div>
        {badge}
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}

export function SourceBadge({ live }: { live: boolean }) {
  return live ? (
    <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">Live NASA data</span>
  ) : (
    <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600 ring-1 ring-stone-200">Estimate</span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-100">
      <div className="text-sm font-medium text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-stone-900">{value}</div>
      {hint && <div className="mt-0.5 text-sm text-stone-500">{hint}</div>}
    </div>
  );
}

const TONES: Record<string, { text: string; bg: string; ring: string; stroke: string; dot: string }> = {
  good: { text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200", stroke: "#258a39", dot: "bg-emerald-500" },
  warn: { text: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200", stroke: "#c88a16", dot: "bg-amber-500" },
  bad: { text: "text-red-700", bg: "bg-red-50", ring: "ring-red-200", stroke: "#dc2626", dot: "bg-red-500" },
  none: { text: "text-stone-600", bg: "bg-stone-100", ring: "ring-stone-200", stroke: "#b09378", dot: "bg-stone-400" },
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
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${t.bg} ${t.text} ${t.ring}`}>
      <span className={`h-2 w-2 rounded-full ${t.dot}`} />{children}
    </span>
  );
}

export function ScoreRing({ score, status }: { score: number | "unknown"; status: string }) {
  const r = 52, c = 2 * Math.PI * r;
  const pct = typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;
  const t = toneFor(status);
  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#f3ece3" strokeWidth="11" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={t.stroke} strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-5xl font-bold tracking-tight text-stone-900">{typeof score === "number" ? score : "—"}</div>
          <div className="text-sm text-stone-500">out of 100</div>
        </div>
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-3xl bg-stone-200/60 ${className}`} />;
}

export function Gauge({ value, max, threshold, thresholdLabel, color }: {
  value: number; max: number; threshold: number; thresholdLabel: string; color: string;
}) {
  const p = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div>
      <div className="relative h-4 rounded-full bg-stone-100 ring-1 ring-stone-200">
        <div className="h-4 rounded-full" style={{ width: p(value), background: color, transition: "width .5s" }} />
        <div className="absolute -top-1 h-6 w-0.5 rounded bg-stone-700" style={{ left: p(threshold) }} />
      </div>
      <div className="relative mt-1.5 h-5 text-sm text-stone-500">
        <span className="absolute left-0">Dry</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap font-medium text-stone-700" style={{ left: p(threshold) }}>{thresholdLabel}</span>
        <span className="absolute right-0">Wet</span>
      </div>
    </div>
  );
}