// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import type { Video } from "../video-catalog"
import { loadVideoCatalog } from "../video-catalog-load"
import {
  durationSeconds,
  indexableVideos,
  isoDuration,
  isVideoIndexable,
  serializeJsonLd,
  videoDetailMetadata,
  videoJsonLd,
  videoLibraryJsonLd,
  videoLibraryMetadata,
  videoPageUrl,
  videoSitemapEntries,
  videoSitemapXml,
  videoUploadDate,
  VIDEO_LIBRARY_PRIORITY,
  VIDEO_PAGE_PRIORITY,
  type VideoSeoContext,
} from "../video-seo"

// The public video library's SEO (owner request, 2026-10-07): indexed pages, canonical, link
// previews, VideoObject / BreadcrumbList / CollectionPage, and the video sitemap.

function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: "EVENT_CREATE_BLANK",
    slug: "event-create-blank",
    title: "Créer un événement depuis une page blanche",
    description: "Créer un brouillon complet avec ses dates et son lieu.",
    category: "cat",
    tags: ["événement", "brouillon"],
    published: true,
    themes: ["evenement-cycle-de-vie"],
    audience: ["organisateur"],
    level: "essentiel",
    feature: "Feature",
    updatedAt: "2026-10-07",
    revision: 1,
    durationMs: 153_640,
    manifest: {
      id: "EVENT_CREATE_BLANK",
      slug: "event-create-blank",
      title: "Créer un événement depuis une page blanche",
      description: "Créer un brouillon complet avec ses dates et son lieu.",
      language: "fr-CH",
      voice: "Kore",
      voiceStyle: "x",
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
      segments: [
        { id: "s1", transcript: "Premier passage.", fallbackDurationMs: 60_000 },
        { id: "s2", transcript: "Second passage.", fallbackDurationMs: 60_000 },
      ],
      viewer: { summary: "Dans cette vidéo, vous créez un événement.", steps: ["a", "b", "c"], remember: ["x"] },
    },
    script: { title: "T", stableId: "EVENT_CREATE_BLANK", sections: [], utilite: null, demonstration: null, resultatVisible: null, pointsAttention: null },
    render: { durationMs: 153_640, width: 1280, height: 800, poster: true },
    ...overrides,
  }
}

const ctx: VideoSeoContext = { siteBase: "https://www.benevol.app/", mediaBaseUrl: "https://medias.benevol.app" }
const offline: VideoSeoContext = { siteBase: "https://www.benevol.app", mediaBaseUrl: undefined }

describe("which video pages are indexed", () => {
  it("indexes a published video with a render to play, not an unpublished one nor one without media", () => {
    expect(isVideoIndexable(makeVideo(), ctx.mediaBaseUrl)).toBe(true)
    expect(isVideoIndexable(makeVideo({ published: false }), ctx.mediaBaseUrl)).toBe(false)
    expect(isVideoIndexable(makeVideo(), undefined)).toBe(false)
    expect(isVideoIndexable(makeVideo(), "  ")).toBe(false)
    expect(indexableVideos([makeVideo(), makeVideo({ id: "OTHER", published: false })], ctx.mediaBaseUrl).map((v) => v.id)).toEqual(["EVENT_CREATE_BLANK"])
  })

  it("builds the canonical URL on the stable id, absolute, without trailing slash nor query", () => {
    expect(videoPageUrl("https://www.benevol.app/", "EVENT_CREATE_BLANK")).toBe("https://www.benevol.app/videos/EVENT_CREATE_BLANK")
  })
})

describe("durations and dates", () => {
  it("formats ISO 8601 durations from milliseconds", () => {
    expect(isoDuration(153_640)).toBe("PT2M34S")
    expect(isoDuration(120_000)).toBe("PT2M")
    expect(isoDuration(45_000)).toBe("PT45S")
    expect(isoDuration(3_905_000)).toBe("PT1H5M5S")
    expect(isoDuration(3_600_000)).toBe("PT1H")
    expect(isoDuration(0)).toBe("PT1S")
  })

  it("rounds the sitemap duration to whole seconds, at least 1", () => {
    expect(durationSeconds(153_640)).toBe(154)
    expect(durationSeconds(200)).toBe(1)
  })

  it("gives the upload date a time and a time zone", () => {
    expect(videoUploadDate("2026-10-07")).toBe("2026-10-07T00:00:00+00:00")
  })
})

describe("serializeJsonLd", () => {
  it("never lets a value close the script element or open a comment", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script> & <!-- \u2028" })
    expect(out).not.toMatch(/[<>&\u2028]/)
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script> & <!-- \u2028" })
  })
})

describe("videoJsonLd", () => {
  it("declares a VideoObject with every field Google asks for, and a breadcrumb", () => {
    const data = videoJsonLd(makeVideo(), ctx)!
    const [video, breadcrumb] = data["@graph"] as Record<string, unknown>[]
    expect(video).toMatchObject({
      "@type": "VideoObject",
      url: "https://www.benevol.app/videos/EVENT_CREATE_BLANK",
      name: "Créer un événement depuis une page blanche",
      description: "Dans cette vidéo, vous créez un événement.",
      thumbnailUrl: ["https://medias.benevol.app/event-create-blank/event-create-blank.jpg", "https://medias.benevol.app/event-create-blank/event-create-blank-og.jpg"],
      uploadDate: "2026-10-07T00:00:00+00:00",
      duration: "PT2M34S",
      contentUrl: "https://medias.benevol.app/event-create-blank/event-create-blank.mp4",
      inLanguage: "fr",
      transcript: "Premier passage.\n\nSecond passage.",
      publisher: { "@type": "Organization", name: "benevol.app", url: "https://www.benevol.app/" },
    })
    expect(video).not.toHaveProperty("embedUrl")
    expect(breadcrumb["@type"]).toBe("BreadcrumbList")
    expect((breadcrumb.itemListElement as { item: string }[]).map((i) => i.item)).toEqual([
      "https://www.benevol.app/",
      "https://www.benevol.app/videos",
      "https://www.benevol.app/videos/EVENT_CREATE_BLANK",
    ])
  })

  it("falls back to the site's social card when the video has no poster yet", () => {
    const data = videoJsonLd(makeVideo({ render: undefined }), ctx)!
    const [video] = data["@graph"] as Record<string, unknown>[]
    expect(video.thumbnailUrl).toEqual(["https://www.benevol.app/og-image.png"])
  })

  it("declares nothing for an unpublished video or without media", () => {
    expect(videoJsonLd(makeVideo({ published: false }), ctx)).toBeNull()
    expect(videoJsonLd(makeVideo(), offline)).toBeNull()
  })
})

describe("videoDetailMetadata", () => {
  it("indexes a playable video, with its canonical, video Open Graph and a large image card", () => {
    const meta = videoDetailMetadata(makeVideo(), ctx)
    expect(meta.alternates?.canonical).toBe("https://www.benevol.app/videos/EVENT_CREATE_BLANK")
    expect(meta.robots).toMatchObject({ index: true, follow: true })
    expect(meta.openGraph).toMatchObject({
      type: "video.other",
      locale: "fr_CH",
      siteName: "benevol.app",
      url: "https://www.benevol.app/videos/EVENT_CREATE_BLANK",
      images: [{ url: "https://medias.benevol.app/event-create-blank/event-create-blank-og.jpg", width: 1200, height: 630, type: "image/jpeg" }],
      videos: [{
        url: "https://medias.benevol.app/event-create-blank/event-create-blank.mp4",
        secureUrl: "https://medias.benevol.app/event-create-blank/event-create-blank.mp4",
        type: "video/mp4",
        width: 1280,
        height: 800,
      }],
    })
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" })
    expect(meta.twitter).not.toHaveProperty("players")
  })

  it("keeps an unpublished video, or one without media, out of the index, canonical still absolute", () => {
    for (const meta of [videoDetailMetadata(makeVideo({ published: false }), ctx), videoDetailMetadata(makeVideo(), offline)]) {
      expect(meta.robots).toMatchObject({ index: false })
      expect(meta.alternates?.canonical).toBe("https://www.benevol.app/videos/EVENT_CREATE_BLANK")
      expect(meta.openGraph).toBeUndefined()
    }
  })
})

describe("the gallery", () => {
  const videos = [makeVideo(), makeVideo({ id: "SOON", slug: "soon", title: "Bientôt", published: false })]

  it("lists only the indexed videos in its ItemList", () => {
    const data = videoLibraryJsonLd(videos, ctx)
    expect(data["@type"]).toBe("CollectionPage")
    expect(data.mainEntity).toMatchObject({
      "@type": "ItemList",
      numberOfItems: 1,
      itemListElement: [{ "@type": "ListItem", position: 1, url: "https://www.benevol.app/videos/EVENT_CREATE_BLANK" }],
    })
  })

  it("is indexed with its own social card once a video can be played, not before", () => {
    const meta = videoLibraryMetadata(videos, ctx)
    expect(meta.alternates?.canonical).toBe("https://www.benevol.app/videos")
    expect(meta.robots).toMatchObject({ index: true })
    expect(meta.openGraph).toMatchObject({ images: [{ url: "https://www.benevol.app/videos/og-image.png", width: 1200, height: 630 }] })
    expect(videoLibraryMetadata(videos, offline).robots).toMatchObject({ index: false })
  })
})

describe("videoSitemapXml", () => {
  it("lists the gallery and each indexed video with Google's video extension", () => {
    const out = videoSitemapXml([makeVideo(), makeVideo({ id: "SOON", slug: "soon", published: false })], ctx)
    expect(out).toContain('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"')
    expect(out).toContain("<loc>https://www.benevol.app/videos</loc>")
    expect(out).toContain("<loc>https://www.benevol.app/videos/EVENT_CREATE_BLANK</loc>")
    expect(out).not.toContain("/videos/SOON")
    for (const line of [
      "<video:thumbnail_loc>https://medias.benevol.app/event-create-blank/event-create-blank.jpg</video:thumbnail_loc>",
      "<video:title>Créer un événement depuis une page blanche</video:title>",
      "<video:description>Dans cette vidéo, vous créez un événement.</video:description>",
      "<video:content_loc>https://medias.benevol.app/event-create-blank/event-create-blank.mp4</video:content_loc>",
      "<video:duration>154</video:duration>",
      "<video:publication_date>2026-10-07T00:00:00+00:00</video:publication_date>",
      "<video:family_friendly>yes</video:family_friendly>",
      "<video:requires_subscription>no</video:requires_subscription>",
      "<video:live>no</video:live>",
    ]) expect(out).toContain(line)
  })

  it("escapes XML in titles and descriptions", () => {
    const out = videoSitemapXml([makeVideo({ title: `Q&A <"rapide">` })], ctx)
    expect(out).toContain("<video:title>Q&amp;A &lt;&quot;rapide&quot;&gt;</video:title>")
  })

  it("is an empty urlset without media", () => {
    const out = videoSitemapXml([makeVideo()], offline)
    expect(out).toContain("<urlset")
    expect(out).not.toContain("<url>")
  })
})

describe("videoSitemapEntries", () => {
  it("lists the gallery and each indexed video for sitemap.xml, dated by the catalogue", () => {
    const entries = videoSitemapEntries(
      [makeVideo({ updatedAt: "2026-10-01" }), makeVideo({ id: "LATER", slug: "later", updatedAt: "2026-10-05" }), makeVideo({ id: "SOON", slug: "soon", published: false, updatedAt: "2026-12-01" })],
      ctx,
    )
    expect(entries).toEqual([
      { url: "https://www.benevol.app/videos", lastModified: new Date("2026-10-05T00:00:00Z"), changeFrequency: "monthly", priority: VIDEO_LIBRARY_PRIORITY },
      { url: "https://www.benevol.app/videos/EVENT_CREATE_BLANK", lastModified: new Date("2026-10-01T00:00:00Z"), changeFrequency: "monthly", priority: VIDEO_PAGE_PRIORITY },
      { url: "https://www.benevol.app/videos/LATER", lastModified: new Date("2026-10-05T00:00:00Z"), changeFrequency: "monthly", priority: VIDEO_PAGE_PRIORITY },
    ])
  })

  it("lists the same pages as the video sitemap", () => {
    const videos = [makeVideo(), makeVideo({ id: "SOON", slug: "soon", published: false })]
    const locs = [...videoSitemapXml(videos, ctx).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(videoSitemapEntries(videos, ctx).map((e) => e.url)).toEqual(locs)
  })

  it("is empty without media: nothing playable, not even the gallery", () => {
    expect(videoSitemapEntries([makeVideo()], offline)).toEqual([])
  })
})

describe("the committed catalogue", () => {
  const catalog = loadVideoCatalog()

  it("indexes every published video when media are online", () => {
    expect(indexableVideos(catalog, ctx.mediaBaseUrl).length).toBe(catalog.filter((v) => v.published).length)
  })

  it("only measures renders of catalogued videos, and uses their real duration (videos/renders.json)", () => {
    const renders = JSON.parse(fs.readFileSync(path.join(process.cwd(), "videos", "renders.json"), "utf8")) as Record<string, { durationMs: number }>
    const slugs = new Set(catalog.map((v) => v.slug))
    expect(Object.keys(renders).filter((slug) => !slugs.has(slug))).toEqual([])
    for (const video of catalog.filter((v) => v.render)) expect(video.durationMs, video.id).toBe(renders[video.slug].durationMs)
  })
})
