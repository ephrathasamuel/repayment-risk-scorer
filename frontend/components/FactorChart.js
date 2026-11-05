"use client";

function show(v) {
  if (v == null) return "—";
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString("en-US");
  return String(v);
}

// Horizontal bars of SHAP contributions: right (red) raises the risk, left (green) lowers it.
export default function FactorChart({ factors, limit = 10 }) {
  const top = factors.slice(0, limit);
  const max = Math.max(...top.map((f) => Math.abs(f.contribution)), 1e-6);
  return (
    <div>
      <div className="mb-2 flex justify-between text-[11px] font-medium text-slate-500">
        <span>← lowers the risk</span>
        <span>raises the risk →</span>
      </div>
      <ul className="space-y-2">
        {top.map((f) => {
          const w = (Math.abs(f.contribution) / max) * 50;
          const up = f.contribution > 0;
          return (
            <li key={f.feature} className="text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-medium text-slate-800">{f.label}</span>
                <span className="text-xs text-slate-500">
                  this applicant <b className="text-slate-700">{show(f.value)}</b> · typical {show(f.typical)}
                </span>
              </div>
              <div className="relative mt-1 h-3 rounded bg-slate-100">
                <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
                <div
                  className={`absolute inset-y-0 rounded ${up ? "bg-wine-600" : "bg-brass"}`}
                  style={up ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                  title={`${f.contribution > 0 ? "+" : ""}${f.contribution} log-odds`}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        Bar length is each factor&apos;s SHAP contribution to this applicant&apos;s score, compared with the average applicant.
        It explains the model&apos;s output, not cause and effect.
      </p>
    </div>
  );
}
