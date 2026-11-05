"use client";

import Link from "next/link";
import { useState } from "react";
import { api, pct } from "@/lib/api";
import { Band, ErrorBox, PageTitle, Recommendation } from "@/components/ui";

export default function BatchPage() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    const body = new FormData();
    body.append("file", file);
    try {
      setResult(await api("/api/applications/batch", { method: "POST", body }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title="Batch upload" subtitle="Score up to 5,000 borrowers from a CSV file. Each row is stored and audited like a single application.">
        <a className="btn-ghost" href="/api/batch-template">Download CSV template</a>
      </PageTitle>

      <form onSubmit={upload} className="card flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="csv">CSV file (max 5 MB)</label>
          <input id="csv" type="file" accept=".csv,text/csv" className="field file:mr-3 file:rounded file:border-0 file:bg-wine-50 file:px-3 file:py-1 file:text-wine-800"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <button className="btn" disabled={!file || busy}>{busy ? "Scoring…" : "Upload and score"}</button>
      </form>

      <p className="mt-2 text-xs text-slate-500">
        Columns: reference, credit_limit, age, education, sex, marital_status (both optional), pay_status_1–6, bill_amount_1–6,
        paid_amount_1–6. Month 1 is the latest.
      </p>

      <div className="mt-4"><ErrorBox>{error}</ErrorBox></div>

      {result && (
        <section className="card mt-4 p-0 sm:p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <h2 className="text-sm font-semibold">
              {result.scored} scored with <span className="font-mono">{result.model_version}</span>
              {result.rejected.length > 0 && <span className="text-red-700"> · {result.rejected.length} rows rejected</span>}
            </h2>
            <Link href="/" className="text-sm text-wine-700 hover:underline">See the portfolio →</Link>
          </div>
          {result.rejected.length > 0 && (
            <ul className="mx-4 mb-3 space-y-1 rounded-md bg-red-50 p-3 text-xs text-red-800">
              {result.rejected.slice(0, 20).map((r) => (
                <li key={r.line}>Line {r.line}{r.reference ? ` (${r.reference})` : ""}: {r.error}</li>
              ))}
            </ul>
          )}
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Applicant</th>
                  <th className="px-4 py-2 font-medium">Risk</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Band</th>
                  <th className="px-4 py-2 font-medium">Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.decisions.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-1.5"><Link href={`/decisions/${r.id}`} className="text-wine-800 hover:underline">{r.reference}</Link></td>
                    <td className="px-4 py-1.5 tabular-nums">{pct(r.probability)}</td>
                    <td className="px-4 py-1.5 tabular-nums">{r.score}</td>
                    <td className="px-4 py-1.5"><Band band={r.band} /></td>
                    <td className="px-4 py-1.5"><Recommendation value={r.recommendation} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
