"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money, pct, when } from "@/lib/api";
import { BAND_BAR, BAND_RANGE, Band, ErrorBox, PageTitle, Recommendation, Stat } from "@/components/ui";

export default function PortfolioPage() {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [band, setBand] = useState("");
  const [limit, setLimit] = useState(25);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/portfolio").then(setSummary).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    api(`/api/applications?limit=${limit}${band ? `&band=${band}` : ""}`).then(setRows).catch((e) => setError(e.message));
  }, [band, limit]);

  const maxBand = summary ? Math.max(1, ...Object.values(summary.bands)) : 1;
  const maxHist = summary ? Math.max(1, ...summary.probability_histogram.map((b) => b.count)) : 1;

  return (
    <>
      <PageTitle title="Portfolio" subtitle="Every application scored so far, by risk band and recommendation.">
        <Link href="/apply" className="btn">Score an application</Link>
      </PageTitle>
      <ErrorBox>{error}</ErrorBox>

      {summary && summary.total === 0 && (
        <div className="card text-sm text-slate-600">
          Nothing scored yet. <Link className="font-medium text-teal-700 underline" href="/apply">Score one application</Link> or{" "}
          <Link className="font-medium text-teal-700 underline" href="/batch">upload a CSV</Link>.
        </div>
      )}

      {summary && summary.total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Applications" value={summary.total.toLocaleString()} />
            <Stat label="Average risk" value={pct(summary.average_probability)} hint="Mean probability of missing next payment" />
            <Stat
              label="Approve / review / decline"
              value={`${summary.recommendations.approve} / ${summary.recommendations.review} / ${summary.recommendations.decline}`}
            />
            <Stat label="Suggested exposure" value={money(summary.suggested_exposure)}
              hint={`Exposure-weighted risk ${pct(summary.exposure_weighted_probability)} · illustrative limits`} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="card">
              <h2 className="mb-3 text-sm font-semibold">Risk bands</h2>
              <div className="space-y-2">
                {Object.entries(summary.bands).map(([b, n]) => (
                  <button key={b} onClick={() => setBand(band === b ? "" : b)}
                    className={`flex w-full items-center gap-3 rounded-md p-1 text-left hover:bg-slate-50 ${band === b ? "bg-slate-100" : ""}`}>
                    <Band band={b} />
                    <span className="w-24 shrink-0 text-xs text-slate-500">{BAND_RANGE[b]}</span>
                    <span className="h-3 flex-1 rounded bg-slate-100">
                      <span className={`block h-3 rounded ${BAND_BAR[b]}`} style={{ width: `${(n / maxBand) * 100}%` }} />
                    </span>
                    <span className="w-12 text-right text-sm tabular-nums">{n}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">Click a band to filter the list below.</p>
            </section>

            <section className="card">
              <h2 className="mb-3 text-sm font-semibold">Distribution of predicted risk</h2>
              <div className="flex h-36 items-end gap-1" role="img" aria-label="Histogram of predicted probability of default">
                {summary.probability_histogram.map((b) => (
                  <div key={b.from} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-[10px] tabular-nums text-slate-500">{b.count || ""}</span>
                    <div className="w-full rounded-t bg-teal-600" style={{ height: `${(b.count / maxHist) * 100}%`, minHeight: b.count ? 2 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-1 text-[10px] text-slate-500">
                {summary.probability_histogram.map((b) => (
                  <span key={b.from} className="flex-1 text-center">{Math.round(b.from * 100)}%</span>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Model versions used: {Object.entries(summary.by_model_version).map(([v, n]) => `${v} (${n})`).join(", ")}
              </p>
            </section>
          </div>
        </>
      )}

      {rows.length > 0 && (
        <section className="card mt-4 overflow-hidden p-0 sm:p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold">Recent decisions {band && <>· band {band}</>}</h2>
            {band && <button className="text-xs text-teal-700 underline" onClick={() => setBand("")}>Show all</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Applicant</th>
                  <th className="px-4 py-2 font-medium">Risk</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Band</th>
                  <th className="px-4 py-2 font-medium">Recommendation</th>
                  <th className="px-4 py-2 font-medium">Scored</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link href={`/decisions/${r.id}`} className="font-medium text-teal-800 hover:underline">{r.reference}</Link>
                      {r.source === "batch" && <span className="ml-2 text-xs text-slate-400">batch</span>}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{pct(r.probability)}</td>
                    <td className="px-4 py-2 tabular-nums">{r.score}</td>
                    <td className="px-4 py-2"><Band band={r.band} /></td>
                    <td className="px-4 py-2"><Recommendation value={r.recommendation} /></td>
                    <td className="px-4 py-2 text-slate-500">{when(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === limit && (
            <div className="border-t border-slate-100 px-4 py-3 text-center">
              <button className="btn-ghost" onClick={() => setLimit((l) => l + 50)}>Show more</button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
