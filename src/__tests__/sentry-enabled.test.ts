import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Sentry must only report from production builds, otherwise local development
// and E2E runs (which load the real DSN from .env) pollute the production project.

const init = vi.hoisted(() => vi.fn())
vi.mock("@sentry/nextjs", () => ({
  init,
  replayIntegration: vi.fn(() => ({ name: "Replay" })),
  captureRouterTransitionStart: vi.fn(),
  captureException: vi.fn(),
  addIntegration: vi.fn(),
}))

// The browser SDK is initialised from a deferred chunk (#773), by calling initSentryClient().
const configs = [
  ["server", "../../sentry.server.config"],
  ["edge", "../../sentry.edge.config"],
  ["client", "@/lib/sentry-client-init"],
] as const

async function loadConfig(path: string) {
  const mod = await import(/* @vite-ignore */ path)
  if (typeof mod.initSentryClient === "function") {
    vi.stubGlobal("window", { location: { pathname: "/" } })
    mod.initSentryClient()
    vi.unstubAllGlobals()
  }
}

async function enabledFor(path: string, nodeEnv: string) {
  vi.stubEnv("NODE_ENV", nodeEnv)
  vi.resetModules()
  init.mockClear()
  await loadConfig(path)
  expect(init).toHaveBeenCalledOnce()
  return init.mock.calls[0][0].enabled
}

describe("Sentry is enabled in production only", () => {
  beforeEach(() => {
    vi.stubEnv("SENTRY_DSN", "https://example@localhost/1")
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://example@localhost/1")
  })
  afterEach(() => vi.unstubAllEnvs())

  for (const [name, path] of configs) {
    it(`${name}: disabled in development and test, enabled in production`, async () => {
      expect(await enabledFor(path, "development")).toBe(false)
      expect(await enabledFor(path, "test")).toBe(false)
      expect(await enabledFor(path, "production")).toBe(true)
    })
  }
})

describe("Sentry configs keep personal data out (@sentry/nextjs 11)", () => {
  afterEach(() => vi.unstubAllEnvs())

  for (const [name, path] of configs) {
    it(`${name}: no-PII dataCollection, span/event/breadcrumb scrubbers, no removed options`, async () => {
      vi.stubEnv("NODE_ENV", "production")
      vi.resetModules()
      init.mockClear()
      await loadConfig(path)
      const { NO_PII_DATA_COLLECTION, scrubSpan, scrubEvent, scrubBreadcrumb, beforeSendClient } = await import("@/lib/sentry-scrub")
      const opts = init.mock.calls[0][0]
      expect(opts.dataCollection).toEqual(NO_PII_DATA_COLLECTION)
      expect(opts.beforeSendSpan).toBe(scrubSpan)
      // The client also drops browser noise first (BENEVOLAPP-P), then scrubs the same way.
      expect(opts.beforeSend).toBe(name === "client" ? beforeSendClient : scrubEvent)
      expect(opts.beforeBreadcrumb).toBe(scrubBreadcrumb)
      expect(opts).not.toHaveProperty("sendDefaultPii")
      expect(opts).not.toHaveProperty("beforeSendTransaction")
      expect(opts).not.toHaveProperty("enableLogs")
    })
  }
})

describe("browser Sentry sends nothing on a clean public page view (#773)", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("no release-health session, no trace and no replay on public pages", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.resetModules()
    init.mockClear()
    const sentry = await import("@sentry/nextjs")
    vi.mocked(sentry.addIntegration).mockClear()
    await loadConfig("@/lib/sentry-client-init")
    const opts = init.mock.calls[0][0]
    const defaults = [{ name: "BrowserSession" }, { name: "GlobalHandlers" }, { name: "BrowserTracing" }]
    expect(opts.integrations(defaults).map((i: { name: string }) => i.name)).toEqual(["GlobalHandlers", "BrowserTracing"])
    vi.stubGlobal("window", { location: { pathname: "/doc" } })
    expect(opts.tracesSampler({ name: "/doc" })).toBe(0)
    expect(opts.tracesSampler({ name: "/admin/events/[id]" })).toBe(0.1)
    expect(opts).not.toHaveProperty("tracesSampleRate")
    expect(sentry.addIntegration).not.toHaveBeenCalled()
  })
})
