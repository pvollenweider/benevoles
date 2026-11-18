// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import type { VideoCatalogEntry, VideoManifest } from "../manifest"
import {
  BRAND_DEFINITION,
  DESCRIPTION_MAX_BYTES,
  TAGS_MAX_CHARS,
  TITLE_MAX,
  mediaUrls,
  thumbnailFilter,
  videoStatus,
  planYoutube,
  tagsLength,
  youtubeDescription,
  youtubeMetadata,
  youtubeTags,
  youtubeTitle,
} from "../youtube-plan"

function manifest(overrides: Partial<VideoManifest> = {}): VideoManifest {
  return {
    id: "ADMIN_NAVIGATION",
    slug: "admin-navigation",
    title: "Se repérer dans l’administration",
    description: "Comprendre la navigation et retrouver une information.",
    language: "fr-CH",
    voice: "Kore",
    voiceStyle: "",
    viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
    segments: [],
    viewer: { summary: "Résumé", steps: ["Ouvrez le Tableau de bord."], remember: ["Votre rôle compte."] },
    ...overrides,
  }
}

const entry: VideoCatalogEntry = { id: "ADMIN_NAVIGATION", manifest: "admin-navigation", category: "getting-started", tags: ["administration", "titre-public"], published: true }

describe("youtubeTitle", () => {
  it("adds the brand when it fits", () => {
    expect(youtubeTitle("Se repérer dans l’administration")).toBe("Se repérer dans l’administration · benevol.app")
  })

  it("drops the brand, then truncates, to stay within 100 characters", () => {
    const long = "é".repeat(95)
    expect(youtubeTitle(long)).toBe(long)
    const tooLong = youtubeTitle("a".repeat(150))
    expect([...tooLong].length).toBe(TITLE_MAX)
    expect(tooLong.endsWith("…")).toBe(true)
  })

  it("removes angle brackets, which YouTube refuses", () => {
    expect(youtubeTitle("Les <balises> interdites")).toBe("Les balises interdites · benevol.app")
  })
})

describe("youtubeTags", () => {
  it("starts with the brand tags, turns slugs into words and skips duplicates", () => {
    expect(youtubeTags(["titre-public", "Bénévoles", "administration"])).toEqual(["benevol.app", "bénévoles", "planning bénévoles", "tutoriel", "titre public", "administration"])
  })

  it("counts commas and the quotes around a tag with a space", () => {
    expect(tagsLength(["Foo Baz"])).toBe(9)
    expect(tagsLength(["a", "b"])).toBe(3)
  })

  it("stops before the 500-character total", () => {
    const many = Array.from({ length: 80 }, (_, i) => `étiquette${i}`)
    const tags = youtubeTags(many)
    expect(tagsLength(tags)).toBeLessThanOrEqual(TAGS_MAX_CHARS)
    expect(tags.length).toBeLessThan(84)
  })
})

describe("youtubeDescription", () => {
  it("has the description, steps, reminders, the video page and the brand definition", () => {
    const text = youtubeDescription(manifest())
    expect(text).toContain("Comprendre la navigation")
    expect(text).toContain("- Ouvrez le Tableau de bord.")
    expect(text).toContain("- Votre rôle compte.")
    expect(text).toContain("https://www.benevol.app/videos/ADMIN_NAVIGATION")
    expect(text).toContain(BRAND_DEFINITION)
    expect(text).not.toMatch(/[<>]/)
  })

  it("drops the optional blocks rather than exceed 5000 bytes", () => {
    const longSteps = Array.from({ length: 60 }, () => "é".repeat(60))
    const text = youtubeDescription(manifest({ viewer: { summary: "", steps: longSteps, remember: ["Gardé ?"] } }))
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(DESCRIPTION_MAX_BYTES)
    expect(text).toContain(BRAND_DEFINITION)
    expect(text).not.toContain("Étapes :")
  })

  it("works without viewer content", () => {
    const text = youtubeDescription(manifest({ viewer: undefined }))
    expect(text).not.toContain("Étapes :")
    expect(text).toContain(BRAND_DEFINITION)
  })
})

describe("youtubeMetadata", () => {
  it("combines title, description and tags", () => {
    const meta = youtubeMetadata(manifest(), entry)
    expect(meta.title).toContain("benevol.app")
    expect(meta.tags).toContain("titre public")
  })
})

describe("planYoutube", () => {
  const ok = { videoId: "abc", revision: 3, privacy: "private" as const, captions: true, thumbnail: true, synthetic: true, uploadedAt: "2026-11-18T00:00:00Z" }

  it("uploads a video never sent", () => {
    expect(planYoutube([{ slug: "a", revision: 1 }], {}, "private")).toEqual([{ slug: "a", action: "upload", revision: 1 }])
  })

  it("leaves a video alone when the revision is the one on YouTube", () => {
    expect(planYoutube([{ slug: "a", revision: 3 }], { a: ok }, "private")[0]).toMatchObject({ action: "unchanged", videoId: "abc" })
  })

  it("replaces a video whose revision changed", () => {
    expect(planYoutube([{ slug: "a", revision: 4 }], { a: ok }, "private")[0]).toEqual({ slug: "a", action: "replace", revision: 4, previousVideoId: "abc" })
  })

  it("only updates the status when the privacy changes or the synthetic voice is not declared yet", () => {
    expect(planYoutube([{ slug: "a", revision: 3 }], { a: ok }, "public")[0]).toEqual({ slug: "a", action: "status", revision: 3, videoId: "abc", from: "private", to: "public" })
    expect(planYoutube([{ slug: "a", revision: 3 }], { a: { ...ok, synthetic: undefined } }, "private")[0]).toMatchObject({ action: "status", to: "private" })
  })

  it("keeps the current privacy of a video already sent when none is asked", () => {
    const pub = { ...ok, privacy: "public" as const }
    expect(planYoutube([{ slug: "a", revision: 3 }], { a: pub })[0]).toMatchObject({ action: "unchanged" })
    expect(planYoutube([{ slug: "a", revision: 3 }], { a: { ...pub, synthetic: undefined } })[0]).toMatchObject({ action: "status", from: "public", to: "public" })
  })

  it("finishes only what failed: captions, thumbnail, or both", () => {
    expect(planYoutube([{ slug: "a", revision: 3 }], { a: { ...ok, captions: false } }, "private")[0]).toEqual({ slug: "a", action: "finish", revision: 3, videoId: "abc", captions: true, thumbnail: false })
    expect(planYoutube([{ slug: "a", revision: 3 }], { a: { ...ok, thumbnail: false } }, "private")[0]).toMatchObject({ action: "finish", captions: false, thumbnail: true })
  })
})

describe("mediaUrls", () => {
  it("points to the published files on medias.benevol.app", () => {
    expect(mediaUrls("admin-navigation")).toEqual({
      mp4: "https://medias.benevol.app/admin-navigation/admin-navigation.mp4",
      vtt: "https://medias.benevol.app/admin-navigation/admin-navigation.vtt",
      poster: "https://medias.benevol.app/admin-navigation/admin-navigation.jpg",
    })
  })
})

describe("thumbnailFilter", () => {
  it("fits the poster into 1280 x 720 on the brand blue without cropping", () => {
    expect(thumbnailFilter()).toBe("scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x1e3a8a")
  })
})

describe("videoStatus", () => {
  it("is complete, because part=status resets what it omits, and declares the generated voice", () => {
    expect(videoStatus("public")).toEqual({ privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: true, embeddable: true, license: "youtube", publicStatsViewable: true })
  })
})
