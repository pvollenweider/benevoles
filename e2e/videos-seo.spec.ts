import { test, expect, type Page } from "@playwright/test"

/**
 * The public video library's indexing (owner request, 2026-10-07; src/lib/video-seo.ts). The
 * playable-video checks need VIDEO_MEDIA_BASE_URL in the server's environment (a video is only
 * indexed when it can be played); the CI e2e environment doesn't set it, so they run locally with
 * `VIDEO_MEDIA_BASE_URL=https://medias.benevol.app`. The rest runs everywhere.
 */

const withMedia = Boolean(process.env.VIDEO_MEDIA_BASE_URL)

async function robotsMeta(page: Page): Promise<string> {
  const robots = page.locator('head meta[name="robots"]')
  return (await robots.count()) ? ((await robots.first().getAttribute("content")) ?? "") : ""
}

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents()
  return scripts.map((s) => JSON.parse(s) as Record<string, unknown>)
}

test("robots.txt no longer disallows /videos and names the video sitemap", async ({ request }) => {
  const body = await (await request.get("/robots.txt")).text()
  expect(body).not.toMatch(/Disallow:\s*\/videos/)
  expect(body).toMatch(/Sitemap: \S+\/video-sitemap\.xml/)
})

test("the gallery's social card is a 1200 x 630 PNG", async ({ request }) => {
  const response = await request.get("/videos/og-image.png")
  expect(response.status()).toBe(200)
  expect(response.headers()["content-type"]).toBe("image/png")
  const png = await response.body()
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
})

test("an unpublished video page stays out of the index", async ({ page }) => {
  await page.goto("/videos/VOLUNTEER_HOURS_CERTIFICATE")
  expect(await robotsMeta(page)).toContain("noindex")
  const types = (await jsonLd(page)).map((d) => JSON.stringify(d))
  expect(types.join(" ")).not.toContain("VideoObject")
})

test.describe("with the media host online", () => {
  test.skip(!withMedia, "VIDEO_MEDIA_BASE_URL is not set: no video can be played, none is indexed")

  test("the gallery is indexed, canonical and lists the videos as an ItemList", async ({ page }) => {
    await page.goto("/videos")
    expect(await robotsMeta(page)).not.toContain("noindex")
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href")
    expect(canonical).toMatch(/^https?:\/\/[^/]+\/videos$/)
    expect(await page.locator('meta[property="og:image"]').first().getAttribute("content")).toMatch(/\/videos\/og-image\.png$/)
    const [collection] = await jsonLd(page)
    expect(collection["@type"]).toBe("CollectionPage")
    const list = collection.mainEntity as { numberOfItems: number; itemListElement: { url: string }[] }
    expect(list.numberOfItems).toBeGreaterThan(10)
    expect(list.itemListElement.map((i) => i.url)).not.toContainEqual(expect.stringContaining("VOLUNTEER_HOURS_CERTIFICATE"))
  })

  test("a published video page is indexed with an absolute canonical, a VideoObject and og:video", async ({ page }) => {
    // From the documentation: the canonical drops `?from=doc`.
    await page.goto("/videos/EVENT_CREATE_BLANK?from=doc")
    expect(await robotsMeta(page)).not.toContain("noindex")
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(/^https?:\/\/[^/?]+\/videos\/EVENT_CREATE_BLANK$/)

    const graph = (await jsonLd(page)).flatMap((d) => (d["@graph"] as Record<string, unknown>[]) ?? [d])
    const video = graph.find((d) => d["@type"] === "VideoObject")!
    expect(video).toBeTruthy()
    for (const field of ["name", "description", "thumbnailUrl", "uploadDate", "duration", "contentUrl", "transcript"]) {
      expect(video[field], field).toBeTruthy()
    }
    expect(video.duration).toMatch(/^PT(\d+H)?(\d+M)?(\d+S)?$/)
    expect(video.uploadDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
    expect(video.contentUrl).toMatch(/\/event-create-blank\/event-create-blank\.mp4$/)
    expect(graph.some((d) => d["@type"] === "BreadcrumbList")).toBe(true)

    expect(await page.locator('meta[property="og:type"]').getAttribute("content")).toBe("video.other")
    expect(await page.locator('meta[property="og:video"]').first().getAttribute("content")).toMatch(/\.mp4$/)
    expect(await page.locator('meta[property="og:video:type"]').first().getAttribute("content")).toBe("video/mp4")
    expect(await page.locator('meta[name="twitter:card"]').getAttribute("content")).toBe("summary_large_image")
    // The player shows the poster (videos/renders.json).
    await expect(page.locator("video")).toHaveAttribute("poster", /\/event-create-blank\/event-create-blank\.jpg$/)
  })

  test("the video sitemap lists the published videos with Google's extension", async ({ request }) => {
    const response = await request.get("/video-sitemap.xml")
    expect(response.headers()["content-type"]).toContain("xml")
    const body = await response.text()
    expect(body).toContain("<video:video>")
    expect(body).toMatch(/<loc>[^<]+\/videos\/EVENT_CREATE_BLANK<\/loc>/)
    expect(body).not.toContain("VOLUNTEER_HOURS_CERTIFICATE")
  })
})
