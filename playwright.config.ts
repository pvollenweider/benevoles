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

  // Two projects:
  // - "chromium": the whole suite, desktop Chrome. It skips e2e/mobile/, whose specs use touch
  //   (tap()) and need a touch-enabled mobile context.
  // - "webkit-iphone": only e2e/mobile/, on Playwright's WebKit build with iPhone 15 emulation
  //   (viewport, user agent, touch, isMobile). It catches Safari-engine behaviour that Chromium
  //   does not have, e.g. a tapped button not taking focus (#589). Limited to its folder so the
  //   suite does not run twice. Headless WebKit on Linux/macOS, not iOS Safari on a device.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: "mobile/**" },
    { name: "webkit-iphone", use: { ...devices["iPhone 15"] }, testMatch: "mobile/**/*.spec.ts" },
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
