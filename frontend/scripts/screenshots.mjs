// Takes the README screenshots from a running app.
//   BASE_URL=http://localhost:3000 SHOT_EMAIL=... SHOT_PASSWORD=... node scripts/screenshots.mjs
// Uses the locally installed Chrome (channel "chrome").
import { chromium } from "@playwright/test";
import path from "node:path";

const base = process.env.BASE_URL || "http://localhost:3000";
const out = path.resolve(import.meta.dirname, "..", "..", "docs");
const email = process.env.SHOT_EMAIL;
const password = process.env.SHOT_PASSWORD;
if (!email || !password) throw new Error("Set SHOT_EMAIL and SHOT_PASSWORD");

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.setDefaultTimeout(240_000);
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(`${base}/login`);
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("heading", { name: "Portfolio" }).waitFor();
await page.getByText("Recent decisions").waitFor();
await page.screenshot({ path: path.join(out, "portfolio.png"), fullPage: true });

// The most recent decision with the highest risk on the first page, for an interesting explanation.
await page.goto(`${base}/apply`);
await page.getByRole("button", { name: "Fill with an example" }).click();
await page.screenshot({ path: path.join(out, "application.png"), fullPage: true });

const decisionId = process.env.SHOT_DECISION;
if (decisionId) {
  await page.goto(`${base}/decisions/${decisionId}`);
  await page.getByText("What drove this score").waitFor();
  await page.screenshot({ path: path.join(out, "decision.png"), fullPage: true });
}

await page.goto(`${base}/models`);
await page.getByText("Segment check (test set)").waitFor();
await page.screenshot({ path: path.join(out, "models.png"), fullPage: true });

// Phone width
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
await phone.addCookies(await ctx.cookies());
const p2 = await phone.newPage();
p2.setDefaultTimeout(240_000);
await p2.goto(`${base}/decisions/${decisionId || 1}`);
await p2.getByText("What drove this score").waitFor();
await p2.screenshot({ path: path.join(out, "decision-phone.png"), fullPage: false });
const overflow = await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

await browser.close();
console.log(`screenshots saved to ${out}; console errors: ${errors.length}; phone horizontal overflow: ${overflow}`);
if (errors.length) console.log(errors.join("\n"));
