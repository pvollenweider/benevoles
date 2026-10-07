// Lighthouse CI (#773): one representative URL per public page type, on the E2E stack (same seed
// as the Playwright specs, `next build` + `next start`). LHCI_FORM_FACTOR=desktop switches to the
// desktop preset; mobile is Lighthouse's default. Phase 1: assertions only warn, the report is the
// deliverable. Once a page type reaches the target, its category moves to "error".
const port = process.env.E2E_PORT ?? "3100"
const base = `http://localhost:${port}`
const desktop = process.env.LHCI_FORM_FACTOR === "desktop"

// Organisation pages are reached with `?org=default` on localhost, as in the E2E specs.
// Pages behind a personal token (/my/<token>, leader, waitlist) are not measured here.
const paths = [
  "/",
  "/fonctionnalites",
  "/nouveautes",
  "/doc",
  "/doc/admin",
  "/doc/creer-son-premier-evenement",
  "/videos",
  "/videos/EVENT_CREATE_BLANK",
  "/accessibilite",
  "/legal/privacy",
  "/n-existe-pas",
  "/?org=default",
  "/spectacle-cirque-2026?org=default",
  "/spectacle-cirque-2026/success?org=default",
]

const category = (name) => [`categories:${name}`, ["warn", { minScore: 1 }]]

module.exports = {
  ci: {
    collect: {
      url: paths.map((p) => base + p),
      startServerCommand: `npm run start -- -p ${port}`,
      startServerReadyPattern: "ready",
      startServerReadyTimeout: 60_000,
      numberOfRuns: 1,
      settings: {
        ...(desktop ? { preset: "desktop" } : {}),
        chromeFlags: "--headless=new --no-sandbox",
      },
    },
    assert: {
      assertions: Object.fromEntries(
        ["performance", "accessibility", "best-practices", "seo"].map(category),
      ),
    },
  },
}
