"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);

  // The "Try the demo" box appears only when the API has DEMO_ACCOUNT on.
  useEffect(() => {
    api("/api/auth/demo").then((r) => setDemo(!!r?.enabled)).catch(() => {});
  }, []);

  function goNext() {
    const next = new URLSearchParams(window.location.search).get("next");
    // Only same-site paths, never an absolute URL.
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  }

  async function tryDemo() {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/demo", { method: "POST" });
      goNext();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", json: { email, password } });
      goNext();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[1.1fr_1fr]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-wine-900 px-8 py-10 text-white sm:px-14 lg:py-14">
        <div>
          <span className="display block text-3xl leading-none">Repayment</span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.3em] text-brass">Risk Scorer</span>
        </div>
        <div className="my-12 max-w-md lg:my-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brass">Explainable credit decisions</p>
          <h1 className="display mt-4 text-4xl leading-[1.1] sm:text-5xl">Every score, with its reasons.</h1>
          <p className="mt-5 text-sm leading-relaxed text-wine-200">
            A gradient-boosted model reads six months of repayment history, prices the risk into a band, and shows the
            factors that moved it, so a credit officer can check the decision rather than trust it.
          </p>
        </div>
        <dl className="grid max-w-md grid-cols-3 gap-4 border-t border-white/15 pt-6 text-xs">
          <div><dt className="text-wine-300">Model</dt><dd className="mt-1 font-semibold">LightGBM</dd></div>
          <div><dt className="text-wine-300">Explained by</dt><dd className="mt-1 font-semibold">SHAP</dd></div>
          <div><dt className="text-wine-300">Audit</dt><dd className="mt-1 font-semibold">Every decision</dd></div>
        </dl>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-brass/20" />
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full border border-brass/30" />
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="display text-3xl text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-stone-500">Accounts are created by the administrator.</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="username" required className="field"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="current-password" required className="field"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p role="alert" className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button className="btn w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          {demo && (
            <div className="mt-10 border-t border-line pt-6">
              <p className="text-sm font-semibold text-ink">Just looking around?</p>
              <p className="mt-1 text-sm text-stone-500">
                Open the demo with every feature. It is separate from real accounts and their data.
              </p>
              <button type="button" className="btn-ghost mt-4 w-full" onClick={tryDemo} disabled={busy}>
                {busy ? "Opening…" : "Try the demo"}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
