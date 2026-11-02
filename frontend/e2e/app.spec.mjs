import { expect, test } from "@playwright/test";
import { E2E } from "../playwright.config.mjs";

async function signIn(page, who) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
}

test("pages need a session", async ({ page }) => {
  await page.goto("/apply");
  await expect(page).toHaveURL(/\/login\?next=%2Fapply/);
});

test("wrong password is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E.analyst.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
});

test("analyst scores an application and sees the explanation", async ({ page }) => {
  await signIn(page, E2E.analyst);
  await page.goto("/apply");
  await page.getByRole("button", { name: "Fill with an example" }).click();
  await page.getByLabel("Business or customer name / ID").fill("E2E Traders");
  await page.getByRole("button", { name: "Score application" }).click();

  await expect(page.getByRole("heading", { name: "E2E Traders" })).toBeVisible();
  await expect(page.getByText("What drove this score")).toBeVisible();
  await expect(page.getByText("Illustrative rules", { exact: true })).toBeVisible();
  await expect(page.getByText(/Score \(300–850\)/)).toBeVisible();

  // No API key in tests: the AI note explains it is off instead of failing silently.
  await page.getByRole("button", { name: "Write note" }).click();
  await expect(page.getByText(/AI summaries are off/)).toBeVisible();
});

test("analyst cannot switch models; admin can see the audit trail", async ({ page }) => {
  await signIn(page, E2E.analyst);
  await page.goto("/models");
  await expect(page.getByText("Only an admin can change the active model.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Active" })).toBeVisible();

  // On phones the sign-out button sits in the menu.
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login/);

  await signIn(page, E2E.admin);
  await page.goto("/models");
  await expect(page.getByRole("heading", { name: /Audit trail/ })).toBeVisible();
  await expect(page.getByText("Segment check (test set)")).toBeVisible();
});
