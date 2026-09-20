import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Sentry must only report from production builds, otherwise local development
// and E2E runs (which load the real DSN from .env) pollute the production project.

const init = vi.hoisted(() => vi.fn())
vi.mock("@sentry/nextjs", () => ({
  init,
  replayIntegration: vi.fn(() => ({ name: "Replay" })),
  captureRouterTransitionStart: vi.fn(),
}))

const configs = [
  ["server", "../../sentry.server.config"],
  ["edge", "../../sentry.edge.config"],
  ["client", "../../instrumentation-client"],
] as const

async function enabledFor(path: string, nodeEnv: string) {
  vi.stubEnv("NODE_ENV", nodeEnv)
  vi.resetModules()
  init.mockClear()
  await import(/* @vite-ignore */ path)
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
