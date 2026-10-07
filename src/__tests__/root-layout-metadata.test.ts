import { describe, it, expect, vi, afterEach } from "vitest"

// Regression (#747 audit): /doc, /accessibilite and the legal pages were prerendered by
// `next build`, without NEXT_PUBLIC_APP_URL, and served « http://localhost:3000 » as their
// canonical and og:url in production. The root layout now waits for the request (connection())
// before giving metadataBase, so no page is prerendered with the build's address.
const connection = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock("next/server", () => ({ connection }))

describe("root layout metadata", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("waits for the request, then takes the running deployment's base URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
    const { generateMetadata } = await import("@/app/layout")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.benevol.app")
    const metadata = await generateMetadata()
    expect(connection).toHaveBeenCalled()
    expect(String(metadata.metadataBase)).toBe("https://www.benevol.app/")
  })
})
