// Lighthouse CI (#773): one representative URL per public page type, on the E2E stack (same seed
// as the Playwright specs, `next build` + `next start`). LHCI_FORM_FACTOR=desktop switches to the
// desktop preset; mobile is Lighthouse's default.
//
// Phase 2 (2026-10-08): the categories every page already scores 100 on, here and in production,
// fail the build below 100: accessibility, best practices and SEO everywhere, and performance on
// desktop below 95. Two exceptions, both warnings:
// - SEO of /videos pages: without VIDEO_MEDIA_BASE_URL (CI) no video can be played, so the library
//   is noindex on purpose (src/lib/video-seo.ts) and Lighthouse's « is-crawlable » fails. In
//   production, with the media host, they score 100.
// - mobile performance: the shared CI runner and `next start` without the edge compression give
//   scores 20 points under production for the heaviest pages (home, event page: 76 and 73 here,
//   95 and 96 in production). It stays a report until a stable measure exists.
const port = process.env.E2E_PORT ?? "3100"
const base = `http://localhost:${port}`
const desktop = process.env.LHCI_FORM_FACTOR === "desktop"

// Organisation pages are reached with `?org=default` on localhost, as in the E2E specs.
// Pages behind a personal token (/my/<token>, leader, waitlist) are not measured here.
// The 404 page is left out: Lighthouse stops with ERRORED_DOCUMENT_REQUEST on any 404 status,
// so it cannot score it (its accessibility is covered by the axe-core E2E specs).
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
  "/?org=default",
  "/spectacle-cirque-2026?org=default",
  "/spectacle-cirque-2026/success?org=default",
]

const VIDEO_PAGES = "/videos"
// Performance: 0.95, not 1: a one-point dip on the shared runner must not fail a build.
const minScore = (name) => (name === "performance" ? 0.95 : 1)
const assertions = (levels) =>
  Object.fromEntries(Object.entries(levels).map(([name, level]) => [`categories:${name}`, [level, { minScore: minScore(name) }]]))

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
      assertMatrix: [
        {
          // Every page but the video library: the four categories (performance on desktop only).
          matchingUrlPattern: `^${base}(?!${VIDEO_PAGES}).*$`,
          assertions: assertions({ performance: desktop ? "error" : "warn", accessibility: "error", "best-practices": "error", seo: "error" }),
        },
        {
          // The video library: SEO only warns (noindex without the media host, see above).
          matchingUrlPattern: `^${base}${VIDEO_PAGES}.*$`,
          assertions: assertions({ performance: desktop ? "error" : "warn", accessibility: "error", "best-practices": "error", seo: "warn" }),
        },
      ],
    },
  },
}
