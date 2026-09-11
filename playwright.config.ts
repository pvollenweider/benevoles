import { defineConfig, devices } from "@playwright/test"

const PORT = process.env.E2E_PORT ?? "3100"
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // shared Postgres + Mailpit inbox — keep specs sequential
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // The e2e stack (postgres + mailpit) is started separately via
  // `make e2e-up` / `docker-compose.e2e.yml` — migrated and seeded via
  // `make e2e-setup`. This only owns the Next.js server itself.
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
