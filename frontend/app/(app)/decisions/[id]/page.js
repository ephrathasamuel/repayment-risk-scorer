import { Suspense } from "react";
import DecisionView from "@/components/DecisionView";

export default function DecisionPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading decision…</p>}>
      <DecisionView />
    </Suspense>
  );
}
