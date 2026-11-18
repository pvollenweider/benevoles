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
  parseYoutubeState,
  playlistMetadata,
  type PlanInput,
  type Privacy,
  type YoutubeState,
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
  const ok = { videoId: "abc", revision: 3, privacy: "private" as const, captions: true, thumbnail: true, synthetic: true, uploadedAt: "2026-11-18T00:00:00Z", playlists: ["jour-j"] }
  const state = (videos: YoutubeState["videos"]): YoutubeState => ({ playlists: {}, videos })
  const one = (input: PlanInput, videos: YoutubeState["videos"], privacy?: Privacy) => planYoutube([input], state(videos), privacy)[0]

  it("uploads a video never sent, with everything to add", () => {
    expect(one({ slug: "a", revision: 1, themes: ["jour-j"] }, {})).toEqual({ slug: "a", revision: 1, action: "upload", captions: true, thumbnail: true, playlists: ["jour-j"] })
  })

  it("leaves a video alone when nothing is missing", () => {
    expect(one({ slug: "a", revision: 3, themes: ["jour-j"] }, { a: ok })).toMatchObject({ action: "unchanged", videoId: "abc" })
  })

  it("replaces a video whose revision changed", () => {
    expect(one({ slug: "a", revision: 4, themes: ["jour-j"] }, { a: ok })).toMatchObject({ action: "replace", previousVideoId: "abc", previousPrivacy: "private", playlists: ["jour-j"] })
  })

  it("replaces a video sent in another format (a phone recording now framed in 16:9)", () => {
    expect(one({ slug: "a", revision: 3, format: "framed" }, { a: ok })).toMatchObject({ action: "replace" })
    expect(one({ slug: "a", revision: 3, format: "framed" }, { a: { ...ok, format: "framed", playlists: [] } })).toMatchObject({ action: "unchanged" })
  })

  it("finishes only what is missing: captions, thumbnail, playlists", () => {
    expect(one({ slug: "a", revision: 3, themes: ["jour-j"] }, { a: { ...ok, captions: false } })).toMatchObject({ action: "update", captions: true, thumbnail: false, playlists: [] })
    expect(one({ slug: "a", revision: 3, themes: ["jour-j"] }, { a: { ...ok, thumbnail: false } })).toMatchObject({ action: "update", captions: false, thumbnail: true })
    expect(one({ slug: "a", revision: 3, themes: ["jour-j", "planning-creneaux"] }, { a: ok })).toMatchObject({ action: "update", playlists: ["planning-creneaux"] })
  })

  it("makes the thumbnail again when what it shows changed", () => {
    const sent = { ...ok, thumbnailKey: "k1" }
    expect(one({ slug: "a", revision: 3, thumbnailKey: "k1", themes: ["jour-j"] }, { a: sent })).toMatchObject({ action: "unchanged" })
    expect(one({ slug: "a", revision: 3, thumbnailKey: "k2", themes: ["jour-j"] }, { a: sent })).toMatchObject({ action: "update", thumbnail: true })
  })

  it("updates the status when the privacy changes or the synthetic voice is not declared yet", () => {
    expect(one({ slug: "a", revision: 3, themes: ["jour-j"] }, { a: ok }, "public")).toMatchObject({ action: "update", status: { from: "private", to: "public" } })
    expect(one({ slug: "a", revision: 3, themes: ["jour-j"] }, { a: { ...ok, synthetic: undefined } })).toMatchObject({ status: { from: "private", to: "private" } })
  })

  it("keeps the current privacy of a video already sent when none is asked", () => {
    const pub = { ...ok, privacy: "public" as const }
    expect(one({ slug: "a", revision: 3, themes: ["jour-j"] }, { a: pub })).toMatchObject({ action: "unchanged" })
  })
})

describe("parseYoutubeState", () => {
  it("reads the current shape", () => {
    const s = { playlists: { "jour-j": { playlistId: "PL1", title: "Jour J" } }, videos: { a: { videoId: "x" } } }
    expect(parseYoutubeState(s)).toEqual(s)
  })

  it("reads the first shape (videos only) and an empty file", () => {
    expect(parseYoutubeState({ a: { videoId: "x" } })).toEqual({ playlists: {}, videos: { a: { videoId: "x" } } })
    expect(parseYoutubeState({})).toEqual({ playlists: {}, videos: {} })
  })
})

describe("playlistMetadata", () => {
  it("titles the playlist with the theme and links the library", () => {
    const meta = playlistMetadata("Préparer et vivre le jour J")
    expect(meta.title).toBe("Préparer et vivre le jour J")
    expect(meta.description).toContain("https://www.benevol.app/videos")
    expect(meta.description).toContain(BRAND_DEFINITION)
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


describe("videoStatus", () => {
  it("is complete, because part=status resets what it omits, and declares the generated voice", () => {
    expect(videoStatus("public")).toEqual({ privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: true, embeddable: true, license: "youtube", publicStatsViewable: true })
  })
})
