"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { ErrorBox, PageTitle } from "@/components/ui";

const MONTHS = ["Latest month", "1 month earlier", "2 months earlier", "3 months earlier", "4 months earlier", "5 months earlier"];

const STATUS = [
  [-2, "No balance"],
  [-1, "Paid in full"],
  [0, "Paid minimum / revolving"],
  [1, "1 month late"],
  [2, "2 months late"],
  [3, "3 months late"],
  [4, "4 months late"],
  [5, "5 months late"],
  [6, "6 months late"],
  [7, "7 months late"],
  [8, "8 months late"],
  [9, "9+ months late"],
];

const EMPTY = {
  reference: "",
  credit_limit: "",
  age: "",
  education: "2",
  sex: "",
  marital_status: "",
  pay_status: Array(6).fill("0"),
  bill_amounts: Array(6).fill(""),
  paid_amounts: Array(6).fill(""),
};

const EXAMPLE = {
  reference: "Abebe Trading PLC",
  credit_limit: "200000",
  age: "38",
  education: "1",
  sex: "",
  marital_status: "",
  pay_status: ["0", "0", "0", "0", "0", "0"],
  bill_amounts: ["52000", "49000", "51000", "47000", "45000", "43000"],
  paid_amounts: ["3000", "2500", "2600", "2400", "2200", "2000"],
};

export default function ApplyPage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setMonth = (key, i, value) =>
    setForm((f) => ({ ...f, [key]: f[key].map((v, j) => (j === i ? value : v)) }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const num = (v) => (v === "" ? 0 : Number(v));
    try {
      const decision = await api("/api/applications", {
        method: "POST",
        json: {
          reference: form.reference.trim(),
          credit_limit: num(form.credit_limit),
          age: num(form.age),
          education: Number(form.education),
          sex: form.sex ? Number(form.sex) : null,
          marital_status: form.marital_status ? Number(form.marital_status) : null,
          pay_status: form.pay_status.map(Number),
          bill_amounts: form.bill_amounts.map(num),
          paid_amounts: form.paid_amounts.map(num),
        },
      });
      router.push(`/decisions/${decision.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title="New application" subtitle="Enter the borrower's last six months of statements and repayments. Amounts in NT$, as in the training data.">
        <button type="button" className="btn-ghost" onClick={() => setForm(EXAMPLE)}>Fill with an example</button>
      </PageTitle>

      <form onSubmit={submit} className="space-y-4">
        <section className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="reference">Business or customer name / ID</label>
            <input id="reference" className="field" required maxLength={100} value={form.reference}
              onChange={(e) => set("reference", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="limit">Current credit limit (NT$)</label>
            <input id="limit" className="field" required type="number" min={1} max={10000000} inputMode="numeric"
              value={form.credit_limit} onChange={(e) => set("credit_limit", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="age">Owner / borrower age</label>
            <input id="age" className="field" required type="number" min={18} max={100} inputMode="numeric"
              value={form.age} onChange={(e) => set("age", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="education">Education</label>
            <select id="education" className="field" value={form.education} onChange={(e) => set("education", e.target.value)}>
              <option value="1">Graduate school</option>
              <option value="2">University</option>
              <option value="3">High school</option>
              <option value="4">Other</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sex">Sex <span className="font-normal text-slate-400">(optional)</span></label>
            <select id="sex" className="field" value={form.sex} onChange={(e) => set("sex", e.target.value)}>
              <option value="">Not recorded</option>
              <option value="1">Male</option>
              <option value="2">Female</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="marital">Marital status <span className="font-normal text-slate-400">(optional)</span></label>
            <select id="marital" className="field" value={form.marital_status} onChange={(e) => set("marital_status", e.target.value)}>
              <option value="">Not recorded</option>
              <option value="1">Married</option>
              <option value="2">Single</option>
              <option value="3">Other</option>
            </select>
          </div>
          <p className="self-end text-xs text-slate-500 sm:col-span-2 lg:col-span-1">
            Sex and marital status are stored only for fairness monitoring. The model never uses them.
          </p>
        </section>

        <section className="card p-0 sm:p-0">
          <h2 className="px-4 pt-4 text-sm font-semibold sm:px-5">Repayment history</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium sm:px-5">Month</th>
                  <th className="px-2 py-2 font-medium">Repayment status</th>
                  <th className="px-2 py-2 font-medium">Statement balance</th>
                  <th className="px-2 py-2 pr-4 font-medium sm:pr-5">Amount paid</th>
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((m, i) => (
                  <tr key={m} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-600 sm:px-5">{m}</td>
                    <td className="px-2 py-2">
                      <select aria-label={`Repayment status, ${m}`} className="field" value={form.pay_status[i]}
                        onChange={(e) => setMonth("pay_status", i, e.target.value)}>
                        {STATUS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input aria-label={`Statement balance, ${m}`} className="field" type="number" inputMode="numeric"
                        value={form.bill_amounts[i]} onChange={(e) => setMonth("bill_amounts", i, e.target.value)} />
                    </td>
                    <td className="px-2 py-2 pr-4 sm:pr-5">
                      <input aria-label={`Amount paid, ${m}`} className="field" type="number" min={0} inputMode="numeric"
                        value={form.paid_amounts[i]} onChange={(e) => setMonth("paid_amounts", i, e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end">
          <button className="btn" disabled={busy}>{busy ? "Scoring…" : "Score application"}</button>
        </div>
      </form>
    </>
  );
}
