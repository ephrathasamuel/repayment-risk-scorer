"use client";

import { useEffect, useState } from "react";
import { api, pct, when, who } from "@/lib/api";
import { ErrorBox, PageTitle } from "@/components/ui";

export default function ModelsPage() {
  const [user, setUser] = useState(null);
  const [models, setModels] = useState([]);
  const [detail, setDetail] = useState(null);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const isAdmin = user?.role === "admin";

  // Fetch everything first, then set state in one place, so the effect never sets state synchronously.
  async function fetchAll() {
    const [me, list] = await Promise.all([api("/api/auth/me"), api("/api/models")]);
    const active = list.find((m) => m.is_active) ?? list[0];
    const activeDetail = active ? await api(`/api/models/${active.version}`) : null;
    const auditLog = me.role === "admin" ? await api("/api/audit?limit=25") : [];
    return { me, list, activeDetail, auditLog };
  }

  function apply({ me, list, activeDetail, auditLog }) {
    setUser(me);
    setModels(list);
    setDetail(activeDetail);
    setAudit(auditLog);
  }

  async function load() {
    try {
      apply(await fetchAll());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    fetchAll().then(apply).catch((e) => setError(e.message));
  }, []);

  async function activate(version) {
    if (!window.confirm(`Make ${version} the model for all new decisions?`)) return;
    setBusy(version);
    setError("");
    try {
      await api(`/api/models/${version}/activate`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  const t = detail?.metrics.test;

  return (
    <>
      <PageTitle title="Model registry" subtitle="Every trained version with its test results. Each decision records the version that made it." />
      <ErrorBox>{error}</ErrorBox>

      <section className="card overflow-hidden p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">Test AUC</th>
                <th className="px-4 py-2 font-medium">Baseline AUC</th>
                <th className="px-4 py-2 font-medium">Recall / precision</th>
                <th className="px-4 py-2 font-medium">Training rows</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {models.map((m) => (
                <tr key={m.version} className={detail?.version === m.version ? "bg-teal-50/50" : ""}>
                  <td className="px-4 py-2">
                    <button className="font-mono text-teal-800 hover:underline" onClick={async () => setDetail(await api(`/api/models/${m.version}`))}>
                      {m.version}
                    </button>
                    <div className="text-xs text-slate-500">{m.algorithm}</div>
                  </td>
                  <td className="px-4 py-2 tabular-nums">{m.auc.toFixed(3)}</td>
                  <td className="px-4 py-2 tabular-nums text-slate-500">{m.baseline_auc.toFixed(3)}</td>
                  <td className="px-4 py-2 tabular-nums">{pct(m.recall, 0)} / {pct(m.precision, 0)}</td>
                  <td className="px-4 py-2 tabular-nums">{m.rows.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    {m.is_active ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Active</span>
                    ) : isAdmin ? (
                      <button className="btn-ghost px-2 py-1 text-xs" disabled={!!busy} onClick={() => activate(m.version)}>
                        {busy === m.version ? "Switching…" : "Make active"}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isAdmin && user && <p className="px-4 py-3 text-xs text-slate-500">Only an admin can change the active model.</p>}
      </section>

      {detail && t && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="card">
            <h2 className="text-sm font-semibold">Test results · <span className="font-mono">{detail.version}</span></h2>
            <p className="mt-1 text-xs text-slate-500">
              {detail.metrics.data.split.test.toLocaleString()} held-out borrowers · default rate {pct(detail.metrics.data.default_rate)} ·
              cut-off {t.threshold} (best F1 on validation)
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
              <div className="rounded-md bg-emerald-50 p-3"><div className="text-xs text-slate-500">Repaid, not flagged</div><div className="text-xl font-semibold tabular-nums">{t.confusion_matrix.tn.toLocaleString()}</div></div>
              <div className="rounded-md bg-amber-50 p-3"><div className="text-xs text-slate-500">Repaid, flagged</div><div className="text-xl font-semibold tabular-nums">{t.confusion_matrix.fp.toLocaleString()}</div></div>
              <div className="rounded-md bg-red-50 p-3"><div className="text-xs text-slate-500">Defaulted, missed</div><div className="text-xl font-semibold tabular-nums">{t.confusion_matrix.fn.toLocaleString()}</div></div>
              <div className="rounded-md bg-teal-50 p-3"><div className="text-xs text-slate-500">Defaulted, flagged</div><div className="text-xl font-semibold tabular-nums">{t.confusion_matrix.tp.toLocaleString()}</div></div>
            </div>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Calibration (predicted vs. observed default rate)</h3>
            <div className="mt-2 space-y-1">
              {t.calibration.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-14 tabular-nums text-slate-500">{pct(c.predicted, 0)}</span>
                  <span className="relative h-2 flex-1 rounded bg-slate-100">
                    <span className="absolute inset-y-0 left-0 rounded bg-teal-600/40" style={{ width: `${c.predicted * 100}%` }} />
                    <span className="absolute inset-y-0 w-1 rounded bg-teal-900" style={{ left: `calc(${c.observed * 100}% - 2px)` }} />
                  </span>
                  <span className="w-14 text-right tabular-nums">{pct(c.observed, 0)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Light bar: average predicted risk in each tenth of borrowers. Dark mark: share that actually defaulted.</p>
          </section>

          <section className="card">
            <h2 className="text-sm font-semibold">Segment check (test set)</h2>
            <p className="mt-1 text-xs text-slate-500">Sex is not a model input; it is kept only to check how the model treats each group.</p>
            {Object.entries(detail.metrics.segments_test).map(([name, rows]) => (
              <div key={name} className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-xs">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-1 font-medium capitalize">{name.replace("_", " ")}</th>
                      <th className="py-1 font-medium">Count</th>
                      <th className="py-1 font-medium">Actual default</th>
                      <th className="py-1 font-medium">Mean predicted</th>
                      <th className="py-1 font-medium">Flagged</th>
                      <th className="py-1 font-medium">AUC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {rows.map((r) => (
                      <tr key={r.group}>
                        <td className="py-1">{r.group}</td>
                        <td className="py-1">{r.count.toLocaleString()}</td>
                        <td className="py-1">{pct(r.actual_default_rate)}</td>
                        <td className="py-1">{pct(r.mean_predicted)}</td>
                        <td className="py-1">{pct(r.flag_rate)}</td>
                        <td className="py-1">{r.auc?.toFixed(3) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <p className="mt-3 text-xs text-slate-500">
              Shows whether predicted risk tracks actual default in each group and how often each is flagged. It does not prove the
              outcomes are fair or rule out proxies for protected attributes.
            </p>
          </section>
        </div>
      )}

      {isAdmin && audit.length > 0 && (
        <section className="card mt-4 p-0 sm:p-0">
          <h2 className="px-4 pt-4 text-sm font-semibold">Audit trail (latest 25)</h2>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[560px] text-xs">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="px-4 py-1.5 font-medium">When</th>
                  <th className="px-4 py-1.5 font-medium">Who</th>
                  <th className="px-4 py-1.5 font-medium">Action</th>
                  <th className="px-4 py-1.5 font-medium">Model</th>
                  <th className="px-4 py-1.5 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.map((e, i) => (
                  <tr key={i}>
                    <td className="px-4 py-1.5 text-slate-500">{when(e.at)}</td>
                    <td className="px-4 py-1.5">{who(e.user_email)}</td>
                    <td className="px-4 py-1.5 font-medium">{e.action.replaceAll("_", " ")}</td>
                    <td className="px-4 py-1.5 font-mono">{e.model_version ?? "—"}</td>
                    <td className="px-4 py-1.5 text-slate-500">
                      {Object.entries(e.details).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </td>
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
