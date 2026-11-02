"use client";

export const BAND_STYLE = {
  A: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  B: "bg-lime-100 text-lime-800 ring-lime-600/20",
  C: "bg-amber-100 text-amber-800 ring-amber-600/20",
  D: "bg-orange-100 text-orange-800 ring-orange-600/20",
  E: "bg-red-100 text-red-800 ring-red-600/20",
};

export const BAND_BAR = { A: "bg-emerald-500", B: "bg-lime-500", C: "bg-amber-500", D: "bg-orange-500", E: "bg-red-500" };

export const BAND_RANGE = { A: "under 10%", B: "10–20%", C: "20–35%", D: "35–55%", E: "55% and over" };

export function Band({ band, large = false }) {
  return (
    <span className={`inline-flex items-center rounded-md font-bold ring-1 ring-inset ${BAND_STYLE[band]} ${large ? "px-3 py-1 text-2xl" : "px-2 py-0.5 text-xs"}`}>
      {band}
    </span>
  );
}

const REC_STYLE = {
  approve: "bg-emerald-600 text-white",
  review: "bg-amber-500 text-white",
  decline: "bg-red-600 text-white",
};

export function Recommendation({ value, large = false }) {
  return (
    <span className={`inline-flex rounded-full font-semibold capitalize ${REC_STYLE[value]} ${large ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}>
      {value}
    </span>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function ErrorBox({ children }) {
  if (!children) return null;
  return <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

export function PageTitle({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
