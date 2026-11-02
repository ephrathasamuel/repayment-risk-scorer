import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import os from "node:os";

// Starts its own API (fresh SQLite database, test-only accounts) and the built frontend,
// unless E2E_BASE_URL points at servers that are already running.
const external = process.env.E2E_BASE_URL;
const root = path.resolve(import.meta.dirname, "..");
const python = process.env.PYTHON || (process.platform === "win32" ? path.join(root, ".venv", "Scripts", "python.exe") : "python");
const db = path.join(os.tmpdir(), `scorer-e2e-${Date.now()}.db`).replaceAll("\\", "/");

export const E2E = {
  admin: { email: process.env.E2E_ADMIN_EMAIL || "admin@e2e.local", password: process.env.E2E_ADMIN_PASSWORD || "e2e-admin-password" },
  analyst: { email: process.env.E2E_ANALYST_EMAIL || "analyst@e2e.local", password: process.env.E2E_ANALYST_PASSWORD || "e2e-analyst-password" },
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: { baseURL: external || "http://localhost:3200", trace: "retain-on-failure" },
  // PW_CHANNEL=chrome uses an installed Chrome instead of downloading Playwright's Chromium.
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL } },
    { name: "phone", use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL } },
  ],
  webServer: external
    ? undefined
    : [
        {
          command: `"${python}" -m uvicorn api.main:app --port 8200`,
          cwd: root,
          url: "http://localhost:8200/api/health",
          timeout: 600_000,
          reuseExistingServer: false,
          env: {
            DATABASE_URL: `sqlite:///${db}`,
            SECRET_KEY: "e2e-secret",
            ADMIN_EMAIL: E2E.admin.email,
            ADMIN_PASSWORD: E2E.admin.password,
            ANALYST_EMAIL: E2E.analyst.email,
            ANALYST_PASSWORD: E2E.analyst.password,
            ANTHROPIC_API_KEY: "",
          },
        },
        {
          command: "npx next start -p 3200",
          url: "http://localhost:3200/login",
          timeout: 300_000,
          reuseExistingServer: false,
          env: { API_URL: "http://localhost:8200" },
        },
      ],
});
