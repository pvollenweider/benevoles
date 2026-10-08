import { describe, it, expect, vi, afterEach } from "vitest"
import { createRenderCache } from "../render-cache"
import { docUnitHeadingIds, renderChangelog, renderDocUnitParts, renderFeaturesPage, renderPublicSource } from "../public-content"
import { loadDocUnits } from "../doc-units"

// The public content pages render the repository's Markdown once per process in production (#773):
// /doc/admin rendered every documentation unit on each visit (2 to 3 s of TTFB in production).
describe("createRenderCache", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("computes once per key when enabled", () => {
    const cached = createRenderCache<number>(() => true)
    const compute = vi.fn(() => 42)
    expect(cached("a", compute)).toBe(42)
    expect(cached("a", compute)).toBe(42)
    expect(compute).toHaveBeenCalledTimes(1)
    cached("b", compute)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it("computes every time when disabled (development: an edited file shows up)", () => {
    const cached = createRenderCache<number>(() => false)
    const compute = vi.fn(() => 1)
    cached("a", compute)
    cached("a", compute)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it("is enabled in production only, by default", () => {
    vi.stubEnv("NODE_ENV", "development")
    const cached = createRenderCache<object>()
    expect(cached("a", () => ({}))).not.toBe(cached("a", () => ({})))
    vi.stubEnv("NODE_ENV", "production")
    expect(cached("a", () => ({}))).toBe(cached("a", () => ({})))
  })
})

describe("public content renders are memoised in production", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("renders each page source once", () => {
    vi.stubEnv("NODE_ENV", "production")
    const unit = loadDocUnits()[0]
    expect(renderChangelog()).toBe(renderChangelog())
    expect(renderPublicSource("GUIDE_ADMIN.md", "Guide administrateur", "https://media.test")).toBe(renderPublicSource("GUIDE_ADMIN.md", "Guide administrateur", "https://media.test"))
    expect(renderFeaturesPage("https://media.test")).toBe(renderFeaturesPage("https://media.test"))
    expect(renderDocUnitParts(unit, "https://media.test")).toBe(renderDocUnitParts(unit, "https://media.test"))
    expect(docUnitHeadingIds(unit)).toBe(docUnitHeadingIds(unit))
  })

  it("keys on the media address, so the video links follow VIDEO_MEDIA_BASE_URL", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(renderFeaturesPage("https://media.test")).not.toBe(renderFeaturesPage(null))
    expect(renderPublicSource("GUIDE_ADMIN.md", "Guide administrateur", "https://media.test")).not.toBe(renderPublicSource("GUIDE_ADMIN.md", "Guide administrateur", null))
  })

  it("gives the same result as an uncached render", () => {
    vi.stubEnv("NODE_ENV", "test")
    const fresh = renderChangelog()
    vi.stubEnv("NODE_ENV", "production")
    expect(renderChangelog()).toEqual(fresh)
  })

  it("renders again on each call outside production", () => {
    vi.stubEnv("NODE_ENV", "test")
    expect(renderChangelog()).not.toBe(renderChangelog())
  })
})
