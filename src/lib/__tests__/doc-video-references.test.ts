import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { docVideoDuration, docVideoLink, docVideoPlayer, findVideoReferences, renderDocVideoCard, renderDocVideoSlot, splitAtDocVideoSlots, videoReferenceId, type DocVideoPlayer } from "../doc-video-references"
import { renderEventPageMarkdown } from "../event-page-markdown"
import { renderDocUnit, renderDocUnitParts, renderPublicSource } from "../public-content"
import { loadDocUnits } from "../doc-units"
import { PUBLIC_PAGES } from "../doc-pages"
import { loadVideoCatalog } from "../video-catalog-load"
import type { Video } from "../video-catalog"

// #645: the documentation references a video of the catalogue by its stable id, with an HTML
// comment on its own line, and the public page renders a link to /videos/<ID>.

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf-8")

function makeVideo(overrides: Partial<Video>): Video {
  return {
    id: "ORG_FIRST_STEPS",
    slug: "org-first-steps",
    title: "Bien démarrer avec une nouvelle organisation",
    description: "Description",
    category: "cat",
    tags: [],
    published: true,
    themes: ["decouvrir-administration"],
    audience: ["organisateur"],
    level: "decouverte",
    feature: "Feature",
    updatedAt: "2026-01-01",
    revision: 1,
    durationMs: 180_000,
    manifest: {
      id: "ORG_FIRST_STEPS",
      slug: "org-first-steps",
      title: "Bien démarrer avec une nouvelle organisation",
      description: "Description",
      language: "fr-CH",
      voice: "Kore",
      voiceStyle: "x",
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
      segments: [{ id: "s1", transcript: "t", fallbackDurationMs: 180_000 }],
      viewer: { summary: "Dans cette vidéo, vous faites x.", steps: ["Ouvrez x.", "Choisissez y.", "Confirmez z."], remember: ["x"] },
    },
    script: { title: "Titre", stableId: "ORG_FIRST_STEPS", sections: [], utilite: null, demonstration: null, resultatVisible: null, pointsAttention: null },
    ...overrides,
  }
}

const rendered = () => true

describe("videoReferenceId", () => {
  it("reads the id of a <!-- video: ID --> comment, spaces and a trailing newline allowed", () => {
    expect(videoReferenceId("<!-- video: ORG_FIRST_STEPS -->")).toBe("ORG_FIRST_STEPS")
    expect(videoReferenceId("<!--video:ORG_FIRST_STEPS-->\n")).toBe("ORG_FIRST_STEPS")
  })

  it("is null for any other HTML or a malformed reference", () => {
    expect(videoReferenceId("<!-- a note for editors -->")).toBeNull()
    expect(videoReferenceId("<!-- video ORG_FIRST_STEPS -->")).toBeNull()
    expect(videoReferenceId("<!-- video: org_first_steps -->")).toBeNull()
    expect(videoReferenceId("<p>video: ORG_FIRST_STEPS</p>")).toBeNull()
  })
})

describe("findVideoReferences", () => {
  it("lists every reference with its line, malformed ones with a null id", () => {
    const md = "## A\n\n<!-- video: ORG_FIRST_STEPS -->\n\ntext\n\n<!-- Video ORG -->\n<!-- other comment -->\n"
    expect(findVideoReferences(md)).toEqual([
      { line: 3, raw: "<!-- video: ORG_FIRST_STEPS -->", id: "ORG_FIRST_STEPS" },
      { line: 7, raw: "<!-- Video ORG -->", id: null },
    ])
  })
})

describe("docVideoLink", () => {
  const catalog = [makeVideo({}), makeVideo({ id: "DRAFT_VIDEO", published: false })]

  it("links a published video with a render to /videos/<ID>, its title and duration in the label", () => {
    expect(docVideoLink("ORG_FIRST_STEPS", catalog, rendered)).toEqual({
      href: "/videos/ORG_FIRST_STEPS?from=doc",
      label: "Voir la vidéo\u00a0: Bien démarrer avec une nouvelle organisation (3 min)",
    })
  })

  it("is null for an unpublished video", () => {
    expect(docVideoLink("DRAFT_VIDEO", catalog, rendered)).toBeNull()
  })

  it("is null for an unknown id", () => {
    expect(docVideoLink("NOT_A_VIDEO", catalog, rendered)).toBeNull()
  })

  it("is null for a published video without a render to play", () => {
    expect(docVideoLink("ORG_FIRST_STEPS", catalog, () => false)).toBeNull()
  })

  it("keeps the documentation context in the href only, never in the visible text", () => {
    const link = docVideoLink("ORG_FIRST_STEPS", catalog, rendered)!
    expect(new URL(link.href, "https://x.test").searchParams.get("from")).toBe("doc")
    expect(link.label).not.toContain("doc")
  })

  it("puts a non-breaking space before the colon", () => {
    expect(docVideoLink("ORG_FIRST_STEPS", catalog, rendered)!.label.startsWith("Voir la vidéo\u00a0: ")).toBe(true)
  })

  it("writes an hour-long video as « 1 h 05 min »", () => {
    const long = makeVideo({ id: "LONG", durationMs: 65 * 60_000 })
    expect(docVideoLink("LONG", [long], rendered)!.label).toMatch(/\(1 h 05 min\)$/)
  })

  it("never uses « · » or a dash as a separator in the label", () => {
    expect(docVideoLink("ORG_FIRST_STEPS", catalog, rendered)!.label).not.toMatch(/[·—–]/)
  })
})

describe("docVideoDuration", () => {
  it("counts minutes under an hour, never less than 1 min", () => {
    expect(docVideoDuration(10_000)).toBe("1 min")
    expect(docVideoDuration(180_000)).toBe("3 min")
    expect(docVideoDuration(59 * 60_000)).toBe("59 min")
  })

  it("writes hours and minutes from an hour on", () => {
    expect(docVideoDuration(60 * 60_000)).toBe("1 h")
    expect(docVideoDuration(65 * 60_000)).toBe("1 h 05 min")
    expect(docVideoDuration(130 * 60_000)).toBe("2 h 10 min")
  })
})

describe("renderDocVideoCard", () => {
  it("escapes the label and the link", () => {
    expect(renderDocVideoCard({ href: "/videos/X", label: `Voir la vidéo : <b>"A" & B</b>` })).toBe(
      `<p data-doc-video="true"><a href="/videos/X">Voir la vidéo : &lt;b&gt;&quot;A&quot; &amp; B&lt;/b&gt;</a></p>\n`,
    )
  })
})

describe("renderEventPageMarkdown with videoCard", () => {
  const catalog = [makeVideo({}), makeVideo({ id: "DRAFT_VIDEO", published: false })]
  const card = (hasRender: () => boolean) => (id: string) => {
    const link = docVideoLink(id, catalog, hasRender)
    return link ? renderDocVideoCard(link) : ""
  }
  const md = (id: string) => `## Premiers pas\n\n<!-- video: ${id} -->\n\nUn paragraphe.\n`

  // The sanitizer serializes the non-breaking space as &nbsp;.
  it("renders a published video as a card with an ordinary link, the marker kept by the sanitizer", () => {
    const html = renderEventPageMarkdown(md("ORG_FIRST_STEPS"), { shiftHeadings: false, headingIds: true, videoCard: card(rendered) })
    expect(html).toContain('<p data-doc-video="true"><a href="/videos/ORG_FIRST_STEPS?from=doc">Voir la vidéo&nbsp;: Bien démarrer avec une nouvelle organisation (3 min)</a></p>')
    expect(html).not.toMatch(/target=|autoplay/)
  })

  it("renders nothing for an unpublished video, an unknown id or a missing render", () => {
    for (const [id, hasRender] of [["DRAFT_VIDEO", rendered], ["NOT_A_VIDEO", rendered], ["ORG_FIRST_STEPS", () => false]] as const) {
      const html = renderEventPageMarkdown(md(id), { shiftHeadings: false, headingIds: true, videoCard: card(hasRender) })
      expect(html, id).not.toContain("data-doc-video")
      expect(html, id).not.toContain("<!--")
      expect(html, id).toContain("<p>Un paragraphe.</p>")
    }
  })

  it("leaves a reference inside a paragraph alone (own line only) and the comment stripped", () => {
    const html = renderEventPageMarkdown("Texte <!-- video: ORG_FIRST_STEPS --> suite.\n", { videoCard: card(rendered) })
    expect(html).not.toContain("/videos/")
    expect(html).not.toContain("<!--")
  })

  it("still strips the comment for admin-authored event pages, which never ask for video cards", () => {
    const html = renderEventPageMarkdown(md("ORG_FIRST_STEPS"))
    expect(html).not.toContain("/videos/")
    expect(html).not.toContain("<!--")
  })
})

// A documentation unit opens the player in place instead of linking to the library: the data of
// that player, where it goes in the unit's HTML, and the unit's parts.
describe("docVideoPlayer", () => {
  const catalog = [
    makeVideo({}),
    makeVideo({ id: "DRAFT_VIDEO", published: false }),
  ]
  const base = "https://medias.example.org/"

  it("gives a published video with a render its button label, library link, media and transcript", () => {
    expect(docVideoPlayer("ORG_FIRST_STEPS", catalog, base)).toEqual({
      id: "ORG_FIRST_STEPS",
      title: "Bien démarrer avec une nouvelle organisation",
      label: "Voir la vidéo\u00a0: Bien démarrer avec une nouvelle organisation (3 min)",
      libraryHref: "/videos/ORG_FIRST_STEPS?from=doc",
      revision: 1,
      audience: ["organisateur"],
      media: {
        video: "https://medias.example.org/org-first-steps/org-first-steps.mp4",
        captions: "https://medias.example.org/org-first-steps/org-first-steps.vtt",
        transcript: "https://medias.example.org/org-first-steps/org-first-steps.txt",
      },
      aspectRatio: "1280 / 800",
      transcript: ["t"],
    })
  })

  it("is null for an unpublished video or an unknown id", () => {
    expect(docVideoPlayer("DRAFT_VIDEO", catalog, base)).toBeNull()
    expect(docVideoPlayer("NOT_A_VIDEO", catalog, base)).toBeNull()
  })

  it("is null without a media base (no render to play)", () => {
    expect(docVideoPlayer("ORG_FIRST_STEPS", catalog, undefined)).toBeNull()
    expect(docVideoPlayer("ORG_FIRST_STEPS", catalog, null)).toBeNull()
    expect(docVideoPlayer("ORG_FIRST_STEPS", catalog, "  ")).toBeNull()
  })

  it("skips empty transcript segments and falls back to 16 / 9 without a viewport size", () => {
    const video = makeVideo({})
    const odd = makeVideo({
      manifest: {
        ...video.manifest,
        viewport: { width: 0, height: 0, deviceScaleFactor: 1 },
        segments: [
          { id: "a", transcript: "Un.", fallbackDurationMs: 1 },
          { id: "b", transcript: " ", fallbackDurationMs: 1 },
          { id: "c", transcript: "Deux.", fallbackDurationMs: 1 },
        ],
      },
    })
    const player = docVideoPlayer("ORG_FIRST_STEPS", [odd], base)!
    expect(player.aspectRatio).toBe("16 / 9")
    expect(player.transcript).toEqual(["Un.", "Deux."])
  })
})

describe("splitAtDocVideoSlots", () => {
  const player = docVideoPlayer("ORG_FIRST_STEPS", [makeVideo({})], "https://m.example.org")!
  const players = new Map<string, DocVideoPlayer>([["ORG_FIRST_STEPS", player]])

  it("cuts the HTML at the slot and puts the player there", () => {
    const html = `<h2 id="a">A</h2>\n${renderDocVideoSlot("ORG_FIRST_STEPS")}<p>Suite.</p>\n`
    expect(splitAtDocVideoSlots(html, players)).toEqual([
      { kind: "html", html: '<h2 id="a">A</h2>\n' },
      { kind: "video", player },
      { kind: "html", html: "<p>Suite.</p>\n" },
    ])
  })

  it("leaves HTML without a slot whole", () => {
    expect(splitAtDocVideoSlots("<p>x</p>", players)).toEqual([{ kind: "html", html: "<p>x</p>" }])
  })

  it("drops a slot with no player and empty chunks around a slot", () => {
    expect(splitAtDocVideoSlots(renderDocVideoSlot("OTHER"), players)).toEqual([])
    expect(splitAtDocVideoSlots(renderDocVideoSlot("ORG_FIRST_STEPS"), players)).toEqual([{ kind: "video", player }])
  })

  it("never treats the guides' link card as a slot", () => {
    const card = renderDocVideoCard({ href: "/videos/ORG_FIRST_STEPS?from=doc", label: "Voir" })
    expect(splitAtDocVideoSlots(card, players)).toEqual([{ kind: "html", html: card }])
  })
})

describe("renderDocUnitParts", () => {
  const unit = loadDocUnits().find((u) => u.slug === "premiers-pas")!
  const refs = findVideoReferences(unit.body)
  const published = refs.filter((r) => loadVideoCatalog().find((v) => v.id === r.id)?.published)

  it("puts the player of each published reference in the unit, no link card and no slot left", () => {
    expect(published.length).toBeGreaterThan(0)
    const parts = renderDocUnitParts(unit, "https://medias.example.org")
    const videos = parts.flatMap((p) => (p.kind === "video" ? [p.player] : []))
    expect(videos.map((v) => v.id)).toEqual(published.map((r) => r.id))
    const html = parts.flatMap((p) => (p.kind === "html" ? [p.html] : [])).join("")
    expect(html).not.toContain("data-doc-video")
    expect(html).not.toContain("<!--")
  })

  it("keeps the same HTML around the player as the unit's plain rendering, headings included", () => {
    const parts = renderDocUnitParts(unit, null)
    expect(parts.every((p) => p.kind === "html")).toBe(true)
    expect(parts.map((p) => (p.kind === "html" ? p.html : "")).join("")).toBe(renderDocUnit(unit, null))
  })
})

// Guard over the real sources of the public pages: a typo or a removed video fails here, not
// silently on the site (an unknown id renders nothing).
describe("video references in the public sources", () => {
  const catalog = loadVideoCatalog()
  const ids = new Set(catalog.map((v) => v.id))
  const sources = PUBLIC_PAGES.flatMap((p) => (p.source ? [{ page: p, source: p.source }] : []))

  it("are well formed and name a video of the catalogue", () => {
    for (const { source } of sources) {
      for (const ref of findVideoReferences(read(source))) {
        expect(ref.id, `${source}:${ref.line} ${ref.raw}`).not.toBeNull()
        expect(ids.has(ref.id!), `${source}:${ref.line} unknown video ${ref.id}`).toBe(true)
      }
    }
  })

  it("stand on their own line, at the start, between blank lines, so they render as a block", () => {
    for (const { source } of sources) {
      const lines = read(source).split("\n")
      for (const ref of findVideoReferences(read(source))) {
        expect(lines[ref.line - 1], `${source}:${ref.line}`).toBe(ref.raw)
        expect(lines[ref.line - 2], `${source}:${ref.line} needs a blank line before`).toBe("")
        expect(lines[ref.line], `${source}:${ref.line} needs a blank line after`).toBe("")
      }
    }
  })

  it("reference each video once per source (one card per task)", () => {
    for (const { source } of sources) {
      const found = findVideoReferences(read(source)).map((r) => r.id)
      expect(new Set(found).size, source).toBe(found.length)
    }
  })

  it("only appear in pages rendered per request with VIDEO_MEDIA_BASE_URL", () => {
    for (const { page, source } of sources) {
      if (findVideoReferences(read(source)).length === 0) continue
      const route = read(path.join("src/app", page.path, "page.tsx"))
      expect(route, page.path).toMatch(/export const dynamic = "force-dynamic"/)
      // /fonctionnalites lays FEATURES.md out itself (src/lib/features-page.ts), same source, same variable.
      expect(route, page.path).toContain(source === "FEATURES.md" ? "renderFeaturesPage(" : `renderPublicSource("${source}", `)
      expect(route, page.path).toMatch(/env\.VIDEO_MEDIA_BASE_URL[,)]/)
    }
  })

  it("the guides reference videos, one link per published reference once the media base is set", () => {
    for (const source of ["GUIDE_ADMIN.md"]) {
      const refs = findVideoReferences(read(source))
      expect(refs.length, source).toBeGreaterThan(0)
      const published = refs.filter((r) => catalog.find((v) => v.id === r.id)?.published)
      const { html } = renderPublicSource(source, "x", "https://medias.example.org")
      expect(html.match(/data-doc-video="true"/g) ?? [], source).toHaveLength(published.length)
      for (const r of published) expect(html, `${source} ${r.id}`).toContain(`href="/videos/${r.id}?from=doc"`)
      expect(html).not.toContain("<!--")
    }
  })

  it("give every card of a page its own link name (two videos with the same title would be ambiguous)", () => {
    for (const { source } of sources) {
      const { html } = renderPublicSource(source, "x", "https://medias.example.org")
      const names = [...html.matchAll(/<p data-doc-video="true"><a [^>]*>([^<]*)<\/a><\/p>/g)].map((m) => m[1])
      expect(new Set(names).size, `${source}: ${names.join(" | ")}`).toBe(names.length)
    }
  })

  it("render no video link without VIDEO_MEDIA_BASE_URL", () => {
    expect(renderPublicSource("GUIDE_ADMIN.md", "x").html).not.toContain("data-doc-video")
    expect(renderPublicSource("GUIDE_ADMIN.md", "x", null).html).not.toContain("/videos/")
  })
})
