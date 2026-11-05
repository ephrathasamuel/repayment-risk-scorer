"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, money, pct, when, who } from "@/lib/api";
import { conceptNote } from "@/lib/conceptNote";
import FactorChart from "@/components/FactorChart";
import { BAND_RANGE, Band, ErrorBox, Recommendation } from "@/components/ui";

const STATUS_LABEL = { "-2": "No balance", "-1": "Paid in full", 0: "Paid minimum" };
const statusLabel = (s) => STATUS_LABEL[s] ?? `${s} month${s > 1 ? "s" : ""} late`;

export default function DecisionView() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("en");
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);

  useEffect(() => {
    api(`/api/applications/${id}`)
      .then((data) => {
        setD(data);
        if (data.ai_summary) setSummary({ text: data.ai_summary });
      })
      .catch((e) => setError(e.message));
    api("/api/health").then((h) => setAiAvailable(!!h.ai_available)).catch(() => {});
  }, [id]);

  async function summarise() {
    setBusy(true);
    setSummaryError("");
    try {
      setSummary(await api(`/api/applications/${id}/summary`, { method: "POST", json: { language } }));
    } catch (e) {
      setSummaryError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!d) return <p className="text-sm text-slate-500">Loading decision…</p>;

  const raising = d.contributions.filter((c) => c.contribution > 0).slice(0, 3);
  const lowering = d.contributions.filter((c) => c.contribution < 0).slice(0, 3);

  return (
    <>
      <div className="mb-4 text-sm">
        <Link href="/" className="text-teal-700 hover:underline">← Portfolio</Link>
      </div>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Decision #{d.id}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{d.reference}</h1>
            <p className="mt-1 text-xs text-slate-500">
              Scored {when(d.created_at)} by {who(d.created_by)} · model <span className="font-mono">{d.model_version}</span>
              {d.source === "batch" && " · batch upload"}
            </p>
          </div>
          <Recommendation value={d.recommendation} large />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-slate-500">Score (300–850)</div>
            <div className="text-4xl font-semibold tabular-nums">{d.score}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Risk band</div>
            <div className="mt-1 flex items-center gap-2"><Band band={d.band} large /><span className="text-xs text-slate-500">{BAND_RANGE[d.band]}</span></div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Chance of missing next payment</div>
            <div className="text-2xl font-semibold tabular-nums">{pct(d.probability)}</div>
            <div className="text-xs text-slate-500">Model cut-off {pct(d.threshold, 0)}</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-xs text-slate-500">In short</div>
            <p className="text-sm text-slate-700">
              {raising.length > 0 && <>Risk up mainly from <b>{raising.map((r) => r.label.toLowerCase()).join(", ")}</b>. </>}
              {lowering.length > 0 && <>Helped by <b>{lowering.map((r) => r.label.toLowerCase()).join(", ")}</b>.</>}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <h2 className="mb-3 text-sm font-semibold">What drove this score</h2>
          <FactorChart factors={d.contributions} />
        </section>

        <div className="space-y-4 lg:col-span-2">
          <section className="card">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Suggested offer</h2>
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Illustrative rules</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-500">Current limit</dt><dd className="font-medium">{money(d.inputs.credit_limit)}</dd></div>
              <div><dt className="text-xs text-slate-500">Suggested limit</dt><dd className="font-medium">{d.offer.suggested_limit ? money(d.offer.suggested_limit) : "No new credit"}</dd></div>
              <div><dt className="text-xs text-slate-500">Limit factor</dt><dd className="font-medium">× {d.offer.limit_factor}</dd></div>
              <div><dt className="text-xs text-slate-500">Annual rate</dt><dd className="font-medium">{d.offer.annual_rate_pct ? `${d.offer.annual_rate_pct}%` : "—"}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">{d.offer.note} A lender would replace these with its own credit policy.</p>
          </section>

          <section className="card">
            <h2 className="text-sm font-semibold">AI note for the credit officer</h2>
            <p className="mt-1 text-xs text-slate-500">Claude writes a short note from the model&apos;s numbers only. The applicant&apos;s name is not sent.</p>
            {aiAvailable ? (
              <div className="mt-3 flex gap-2">
                <select aria-label="Language" className="field w-auto" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="en">English</option>
                  <option value="am">Amharic</option>
                </select>
                <button className="btn" onClick={summarise} disabled={busy}>{busy ? "Writing…" : summary ? "Rewrite note" : "Write note"}</button>
              </div>
            ) : !summary ? (
              <div className="mt-3 rounded-md border border-dashed border-slate-300 p-3" data-testid="concept-note">
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Concept preview</span>
                <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{conceptNote(d)}</div>
                <p className="mt-2 text-xs text-slate-500">
                  This shows the shape of the note. Here it is filled in from a fixed template with this decision&apos;s
                  numbers, not written by AI. With an Anthropic API key, Claude writes it in English or Amharic.
                </p>
              </div>
            ) : null}
            <div className="mt-3"><ErrorBox>{summaryError}</ErrorBox></div>
            {summary && (
              <div className="mt-3 whitespace-pre-line rounded-md bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">{summary.text}</div>
            )}
          </section>
        </div>
      </div>

      <section className="card mt-4 p-0 sm:p-0">
        <h2 className="px-4 pt-4 text-sm font-semibold sm:px-5">Inputs</h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium sm:px-5">Month</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 text-right font-medium">Balance</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[1, 2, 3, 4, 5, 6].map((m) => (
                <tr key={m}>
                  <td className="px-4 py-1.5 text-slate-600 sm:px-5">{m === 1 ? "Latest" : `${m - 1} earlier`}</td>
                  <td className="px-2 py-1.5">{statusLabel(d.inputs[`pay_status_${m}`])}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.inputs[`bill_amount_${m}`].toLocaleString("en-US")}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums sm:px-5">{d.inputs[`paid_amount_${m}`].toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-4 pt-2 text-xs text-slate-500 sm:px-5">
          Age {d.inputs.age} · education code {d.inputs.education} · limit {money(d.inputs.credit_limit)}
        </p>
      </section>
    </>
  );
}
