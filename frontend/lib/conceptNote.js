// A stand-in for the AI decision note, used when the API has no ANTHROPIC_API_KEY.
// Same headings the model is asked for, but every line is a fixed template filled
// with numbers the model already produced. Nothing here is AI.
import { money, pct } from "@/lib/api";

// Personal details are not something to ask a borrower to "explain".
const PERSONAL = new Set(["age", "education", "sex", "marital_status"]);

const REC = { approve: "Approve", review: "Refer for review", decline: "Decline" };

const factorLine = (c) => `- ${c.label}: ${c.value ?? "—"} (typical ${c.typical ?? "—"})`;

export function conceptNote(d) {
  const up = d.contributions.filter((c) => c.contribution > 0).slice(0, 3);
  const down = d.contributions.filter((c) => c.contribution < 0).slice(0, 3);
  return [
    `${REC[d.recommendation] ?? d.recommendation}: band ${d.band}, ${pct(d.probability)} chance of missing the next payment (score ${d.score}).`,
    "",
    "Main risk factors:",
    ...(up.length ? up.map(factorLine) : ["- None of the factors pushed the risk up much."]),
    "",
    "Points in the borrower's favour:",
    ...(down.length ? down.map(factorLine) : ["- None of the factors lowered the risk much."]),
    "",
    "What to check before deciding:",
    ...up
      .filter((c) => !PERSONAL.has(c.feature))
      .slice(0, 2)
      .map((c) => `- Ask for statements or records that explain this: ${c.label.toLowerCase()}.`),
    "- Confirm the last six months of repayments against the borrower's own statements.",
    `- The suggested limit (${d.offer.suggested_limit ? money(d.offer.suggested_limit) : "no new credit"}) comes from illustrative rules, not the model.`,
  ].join("\n");
}
