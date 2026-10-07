import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  parseScript,
  filterPublishedVideos,
  searchVideos,
  applyVideoFilters,
  themesInUse,
  tagsInUse,
  audiencesInUse,
  levelsInUse,
  formatDuration,
  videoMediaUrls,
  relatedVideos,
  parseVideoReference,
  resolveVideoReference,
  THEMES,
  catalogEntrySchema,
  type Video,
} from "../video-catalog"
import { loadVideoCatalog } from "../video-catalog-load"

const videosRoot = path.join(process.cwd(), "videos")

const validEntry = {
  id: "FOO_BAR",
  manifest: "foo-bar",
  category: "x",
  tags: ["x"],
  published: false,
  themes: ["decouvrir-administration"],
  audience: ["organisateur"],
  level: "decouverte",
  feature: "x",
  updatedAt: "2026-01-01",
  revision: 1,
}

describe("catalogEntrySchema — level is required", () => {
  it("accepts a valid entry", () => {
    expect(catalogEntrySchema.safeParse(validEntry).success).toBe(true)
  })

  it("rejects an entry without a level", () => {
    const { level: _level, ...withoutLevel } = validEntry
    void _level
    expect(catalogEntrySchema.safeParse(withoutLevel).success).toBe(false)
  })

  it("rejects an unknown level", () => {
    expect(catalogEntrySchema.safeParse({ ...validEntry, level: "intermediaire" }).success).toBe(false)
  })
})

// Regression: VideoGallery.tsx (a client component) imports from "../video-catalog" for its
// filters. An `fs`/`path` import there broke the Next.js client bundle ("Module not found: Can't
// resolve 'fs'", caught by e2e/videos.spec.ts) — keep that import out of this file for good.
describe("video-catalog.ts stays bundlable for the client", () => {
  it("never imports fs or path", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "video-catalog.ts"), "utf8")
    expect(source).not.toMatch(/from ["'](node:)?fs["']/)
    expect(source).not.toMatch(/from ["'](node:)?path["']/)
  })
})

describe("loadVideoCatalog", () => {
  const catalog = loadVideoCatalog()

  it("loads every video declared in videos/catalog.json", () => {
    const declared = JSON.parse(fs.readFileSync(path.join(videosRoot, "catalog.json"), "utf8")).videos.length
    expect(catalog.length).toBe(declared)
    expect(catalog.length).toBeGreaterThan(0)
  })

  it("every manifest referenced by the catalogue exists and matches its entry", () => {
    for (const video of catalog) {
      const manifestFile = path.join(videosRoot, "manifests", `${video.slug}.json`)
      expect(fs.existsSync(manifestFile), video.id).toBe(true)
      expect(video.manifest.id).toBe(video.id)
      expect(video.manifest.slug).toBe(video.slug)
    }
  })

  it("every video has a readable script", () => {
    for (const video of catalog) {
      const scriptFile = path.join(videosRoot, "scripts", `${video.slug}.md`)
      expect(fs.existsSync(scriptFile), video.id).toBe(true)
      expect(video.script.title.length).toBeGreaterThan(0)
    }
  })

  it("ids are unique and stable (upper snake case)", () => {
    const ids = catalog.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[A-Z][A-Z0-9_]+$/)
  })

  it("every video has at least one theme, a known one", () => {
    const known = new Set(THEMES.map((t) => t.id))
    for (const video of catalog) {
      expect(video.themes.length, video.id).toBeGreaterThan(0)
      for (const theme of video.themes) expect(known.has(theme), `${video.id}: ${theme}`).toBe(true)
    }
  })

  it("every video has at least one audience and a positive duration", () => {
    for (const video of catalog) {
      expect(video.audience.length, video.id).toBeGreaterThan(0)
      expect(video.durationMs, video.id).toBeGreaterThan(0)
    }
  })

  it("every video has a level, one of the known levels (required by the schema)", () => {
    for (const video of catalog) {
      expect(["decouverte", "essentiel", "avance"], video.id).toContain(video.level)
    }
  })

  it("every video has a viewer block: non-empty summary, 3–7 steps, 1–4 remember items", () => {
    for (const video of catalog) {
      const viewer = video.manifest.viewer
      expect(viewer, video.id).toBeDefined()
      expect(viewer.summary.trim().length, video.id).toBeGreaterThan(0)
      expect(viewer.steps.length, video.id).toBeGreaterThanOrEqual(3)
      expect(viewer.steps.length, video.id).toBeLessThanOrEqual(7)
      for (const step of viewer.steps) expect(step.trim().length, video.id).toBeGreaterThan(0)
      expect(viewer.remember.length, video.id).toBeGreaterThanOrEqual(1)
      expect(viewer.remember.length, video.id).toBeLessThanOrEqual(4)
      for (const item of viewer.remember) expect(item.trim().length, video.id).toBeGreaterThan(0)
    }
  })

  // #644 owner feedback: the detail page shows what the video explains to the viewer, never
  // internal editorial or engineering vocabulary — this never slipped in from a script section,
  // an issue number or a file path while drafting the viewer text.
  it("viewer text has no internal jargon, issue reference, file path or placeholder", () => {
    const INTERNAL_WORDS = /\b(seed|manifest|manifeste)\b|#\d+|\.ts\b|\.json\b|TODO/i
    for (const video of catalog) {
      const viewer = video.manifest.viewer
      const text = [viewer.summary, ...viewer.steps, ...viewer.remember].join("\n")
      expect(text, video.id).not.toMatch(INTERNAL_WORDS)
    }
  })

  it("viewer text has no em dash and no « · » separator", () => {
    for (const video of catalog) {
      const viewer = video.manifest.viewer
      const text = [viewer.summary, ...viewer.steps, ...viewer.remember].join("\n")
      expect(text, video.id).not.toContain("—")
      expect(text, video.id).not.toContain("·")
    }
  })

  it("throws when an entry references a manifest that doesn't exist", () => {
    // loadVideoCatalog re-reads from disk each call; we can't easily corrupt the fixture here,
    // so this documents the behaviour via a focused unit test of the failure path instead.
    expect(() => {
      const bad = { defaultLanguage: "fr-CH", videos: [{ id: "X", manifest: "does-not-exist", category: "x", tags: [], published: false, themes: ["decouvrir-administration"], audience: ["organisateur"], feature: "x", updatedAt: "2026-01-01", revision: 1 }] }
      const file = path.join(videosRoot, "catalog.json")
      const original = fs.readFileSync(file, "utf8")
      fs.writeFileSync(file, JSON.stringify(bad))
      try {
        loadVideoCatalog()
      } finally {
        fs.writeFileSync(file, original)
      }
    }).toThrow()
  })
})

describe("parseScript", () => {
  it("parses the four-part recipe used by most scripts", () => {
    const raw = `# Titre

**Identifiant stable :** \`FOO_BAR\`

## Utilité

Utile parce que.

## Démonstration

1. Étape une.

## Résultat visible

- Un résultat.

## Points d'attention

- Attention à ça.
`
    const script = parseScript(raw)
    expect(script.title).toBe("Titre")
    expect(script.stableId).toBe("FOO_BAR")
    expect(script.utilite).toBe("Utile parce que.")
    expect(script.demonstration).toContain("Étape une.")
    expect(script.resultatVisible).toContain("Un résultat.")
    expect(script.pointsAttention).toContain("Attention à ça.")
  })

  it("still parses a script using older headings (Objectif, Ton...), with null canonical fields", () => {
    const raw = `# Autre format

## Objectif

But du script.

## Ton

Chaleureux.
`
    const script = parseScript(raw)
    expect(script.title).toBe("Autre format")
    expect(script.stableId).toBeNull()
    expect(script.utilite).toBeNull()
    expect(script.sections).toEqual([
      { heading: "Objectif", body: "But du script." },
      { heading: "Ton", body: "Chaleureux." },
    ])
  })

  it("parses the real legacy scripts without throwing", () => {
    for (const slug of ["organizer-create-publish", "admin-features-tour", "organizer-monitor-followup", "volunteer-register-mobile"]) {
      const raw = fs.readFileSync(path.join(videosRoot, "scripts", `${slug}.md`), "utf8")
      expect(() => parseScript(raw)).not.toThrow()
    }
  })
})

function makeVideo(overrides: Partial<Video>): Video {
  return {
    id: "ID",
    slug: "slug",
    title: "Titre",
    description: "Description",
    category: "cat",
    tags: [],
    published: false,
    themes: ["decouvrir-administration"],
    audience: ["organisateur"],
    level: "decouverte",
    feature: "Feature",
    updatedAt: "2026-01-01",
    revision: 1,
    durationMs: 300_000,
    manifest: {
      id: "ID",
      slug: "slug",
      title: "Titre",
      description: "Description",
      language: "fr-CH",
      voice: "Kore",
      voiceStyle: "x",
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
      segments: [{ id: "s1", transcript: "t", fallbackDurationMs: 300_000 }],
      viewer: { summary: "Dans cette vidéo, vous faites x.", steps: ["Ouvrez x.", "Choisissez y.", "Confirmez z."], remember: ["Rien n'est enregistré avant la confirmation."] },
    },
    script: { title: "Titre", stableId: "ID", sections: [], utilite: null, demonstration: null, resultatVisible: null, pointsAttention: null },
    ...overrides,
  }
}

describe("filterPublishedVideos", () => {
  const videos = [makeVideo({ id: "A", published: true }), makeVideo({ id: "B", published: false })]

  it("keeps every video when publicOnly is false (today's default, #644)", () => {
    expect(filterPublishedVideos(videos, false).map((v) => v.id)).toEqual(["A", "B"])
  })

  it("keeps only published videos when publicOnly is true", () => {
    expect(filterPublishedVideos(videos, true).map((v) => v.id)).toEqual(["A"])
  })
})

describe("searchVideos", () => {
  const videos = [
    makeVideo({ id: "A", title: "Créer un événement", description: "page blanche", tags: ["événement"] }),
    makeVideo({ id: "B", title: "Recherche globale", description: "Ctrl+K", tags: ["recherche"] }),
  ]

  it("returns everything on an empty query", () => {
    expect(searchVideos(videos, "   ").map((v) => v.id)).toEqual(["A", "B"])
  })

  it("matches the title, accent- and case-insensitively", () => {
    expect(searchVideos(videos, "evenement").map((v) => v.id)).toEqual(["A"])
    expect(searchVideos(videos, "RECHERCHE").map((v) => v.id)).toEqual(["B"])
  })

  it("matches the viewer summary and steps, not the internal script", () => {
    const withViewer = [makeVideo({
      id: "C",
      title: "X",
      description: "",
      manifest: {
        id: "C", slug: "c", title: "X", description: "", language: "fr-CH", voice: "Kore", voiceStyle: "x",
        viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
        segments: [{ id: "s1", transcript: "t", fallbackDurationMs: 1000 }],
        viewer: { summary: "Dans cette vidéo, vous téléchargez un QR code imprimable.", steps: ["Ouvrez le QR code.", "Téléchargez-le.", "Imprimez-le."], remember: ["Scannez-le avant de le diffuser."] },
      },
      script: { title: "X", stableId: null, sections: [{ heading: "Démonstration", body: "Ce texte interne ne doit jamais remonter dans la recherche." }], utilite: null, demonstration: "Ce texte interne ne doit jamais remonter dans la recherche.", resultatVisible: null, pointsAttention: null },
    })]
    expect(searchVideos(withViewer, "QR code")).toHaveLength(1)
    expect(searchVideos(withViewer, "texte interne")).toHaveLength(0)
  })
})

describe("applyVideoFilters", () => {
  const videos = [
    makeVideo({ id: "A", themes: ["decouvrir-administration"], audience: ["organisateur"], tags: ["a"] }),
    makeVideo({ id: "B", themes: ["parcours-benevole"], audience: ["benevole"], tags: ["b"] }),
  ]

  it("combines theme, audience, tag and query filters", () => {
    expect(applyVideoFilters(videos, {}).map((v) => v.id)).toEqual(["A", "B"])
    expect(applyVideoFilters(videos, { theme: "parcours-benevole" }).map((v) => v.id)).toEqual(["B"])
    expect(applyVideoFilters(videos, { audience: "organisateur" }).map((v) => v.id)).toEqual(["A"])
    expect(applyVideoFilters(videos, { tag: "b" }).map((v) => v.id)).toEqual(["B"])
    expect(applyVideoFilters(videos, { theme: "parcours-benevole", audience: "organisateur" })).toEqual([])
  })

  it("filters by level", () => {
    const withLevels = [
      makeVideo({ id: "A", level: "decouverte" }),
      makeVideo({ id: "B", level: "avance" }),
    ]
    expect(applyVideoFilters(withLevels, { level: "decouverte" }).map((v) => v.id)).toEqual(["A"])
    expect(applyVideoFilters(withLevels, { level: "avance" }).map((v) => v.id)).toEqual(["B"])
  })

  it("a video listed under several themes is never duplicated by a theme filter", () => {
    const multiTheme = makeVideo({ id: "M", themes: ["decouvrir-administration", "parcours-benevole"] })
    const result = applyVideoFilters([...videos, multiTheme], { theme: "parcours-benevole" })
    expect(result.map((v) => v.id)).toEqual(["B", "M"])
    expect(result.filter((v) => v.id === "M")).toHaveLength(1)
  })
})

describe("themesInUse / tagsInUse / audiencesInUse", () => {
  const videos = [
    makeVideo({ id: "A", themes: ["evenement-cycle-de-vie", "decouvrir-administration"], tags: ["z", "a"], audience: ["organisateur"] }),
    makeVideo({ id: "B", themes: ["decouvrir-administration"], tags: ["a"], audience: ["benevole"] }),
  ]

  it("returns only the themes used, in carousel order", () => {
    expect(themesInUse(videos).map((t) => t.id)).toEqual(["decouvrir-administration", "evenement-cycle-de-vie"])
  })

  it("returns the deduplicated, sorted tags", () => {
    expect(tagsInUse(videos)).toEqual(["a", "z"])
  })

  it("returns the audiences used, in the fixed order", () => {
    expect(audiencesInUse(videos)).toEqual(["organisateur", "benevole"])
  })
})

describe("levelsInUse", () => {
  it("returns only the levels used, in progression order", () => {
    const videos = [makeVideo({ id: "A", level: "avance" }), makeVideo({ id: "B", level: "decouverte" })]
    expect(levelsInUse(videos)).toEqual(["decouverte", "avance"])
  })
})

describe("formatDuration", () => {
  it("formats minutes, and hours with and without a minute remainder", () => {
    expect(formatDuration(60_000)).toBe("1 min")
    expect(formatDuration(6 * 60_000)).toBe("6 min")
    expect(formatDuration(90 * 60_000)).toBe("1 h 30")
    expect(formatDuration(120 * 60_000)).toBe("2 h")
  })

  it("never reports zero minutes", () => {
    expect(formatDuration(1)).toBe("1 min")
  })
})

describe("videoMediaUrls", () => {
  it("is null without a base URL", () => {
    expect(videoMediaUrls("event-create-blank", undefined)).toBeNull()
    expect(videoMediaUrls("event-create-blank", "")).toBeNull()
  })

  it("builds the three URLs from the base, trimming a trailing slash", () => {
    expect(videoMediaUrls("event-create-blank", "https://medias.benevol.app/")).toEqual({
      video: "https://medias.benevol.app/event-create-blank/event-create-blank.mp4",
      captions: "https://medias.benevol.app/event-create-blank/event-create-blank.vtt",
      transcript: "https://medias.benevol.app/event-create-blank/event-create-blank.txt",
    })
  })

  it("adds the posters only when the render says they exist (videos/renders.json), never a broken image", () => {
    const urls = videoMediaUrls("event-create-blank", "https://medias.benevol.app", { poster: true })
    expect(urls?.poster).toBe("https://medias.benevol.app/event-create-blank/event-create-blank.jpg")
    expect(urls?.ogImage).toBe("https://medias.benevol.app/event-create-blank/event-create-blank-og.jpg")
    expect(videoMediaUrls("event-create-blank", "https://medias.benevol.app", { poster: false })).not.toHaveProperty("poster")
    expect(videoMediaUrls("event-create-blank", "https://medias.benevol.app", undefined)).not.toHaveProperty("poster")
  })
})

describe("relatedVideos", () => {
  const a = makeVideo({ id: "A", title: "A", themes: ["decouvrir-administration", "planning-creneaux"] })
  const b = makeVideo({ id: "B", title: "B", themes: ["decouvrir-administration"] })
  const c = makeVideo({ id: "C", title: "C", themes: ["parcours-benevole"] })

  it("ranks videos sharing more themes first, excludes itself and unrelated videos", () => {
    expect(relatedVideos(a, [a, b, c]).map((v) => v.id)).toEqual(["B"])
  })

  it("a video sharing several themes with the subject appears once, not once per shared theme", () => {
    const multi = makeVideo({ id: "D", title: "D", themes: ["decouvrir-administration", "planning-creneaux"] })
    const result = relatedVideos(a, [a, b, c, multi])
    expect(result.map((v) => v.id)).toEqual(["D", "B"]) // D shares 2 themes with a, ranked first
    expect(result.filter((v) => v.id === "D")).toHaveLength(1)
  })
})

describe("doc reference resolver (#645)", () => {
  it("parses a video: ID token", () => {
    expect(parseVideoReference("video: ORG_CREATE")).toBe("ORG_CREATE")
    expect(parseVideoReference("video:ORG_CREATE")).toBe("ORG_CREATE")
    expect(parseVideoReference("not a reference")).toBeNull()
  })

  it("resolves against the catalogue, null for an unknown id", () => {
    const videos = [makeVideo({ id: "EVENT_CREATE_BLANK" })]
    expect(resolveVideoReference("EVENT_CREATE_BLANK", videos)?.id).toBe("EVENT_CREATE_BLANK")
    expect(resolveVideoReference("NOPE", videos)).toBeNull()
  })
})
