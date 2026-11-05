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
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-teal-900 to-teal-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-lg bg-teal-500 text-lg font-bold text-teal-950">R</div>
          <h1 className="text-xl font-semibold">Repayment Risk Scorer</h1>
          <p className="mt-1 text-sm text-teal-100">Explainable credit decisions from repayment history</p>
        </div>
        <form onSubmit={submit} className="card space-y-4">
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
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="text-center text-xs text-slate-500">Accounts are created by the administrator.</p>
        </form>
        {demo && (
          <div className="card mt-4 space-y-3">
            <div>
              <p className="text-sm font-semibold">Just looking around?</p>
              <p className="mt-1 text-sm text-slate-500">
                Open the demo with every feature. It is separate from real accounts and their data.
              </p>
            </div>
            <button type="button" className="btn-ghost w-full" onClick={tryDemo} disabled={busy}>
              {busy ? "Opening…" : "Try the demo"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
