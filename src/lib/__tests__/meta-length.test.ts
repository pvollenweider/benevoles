import { describe, it, expect } from "vitest"
import type { Metadata } from "next"
import { auditedLength, metaLengthProblems } from "../meta-length"
import { landingMetadata } from "../landing-seo"
import { PUBLIC_PAGES, publicPageMetadata } from "../doc-pages"
import { docUnitMetadata, readDocUnits } from "../doc-units"
import { filterPublishedVideos } from "../video-catalog"
import { loadVideoCatalog } from "../video-catalog-load"
import { videoDetailMetadata, videoLibraryDescription, videoLibraryMetadata, videoPageTitle } from "../video-seo"

const BASE = "https://www.benevol.app"
// Media base set: the video pages are built as indexed, the case search engines see.
const ctx = { siteBase: BASE, mediaBaseUrl: "https://media.example.org" }

function titleOf(m: Metadata): string {
  const t = m.title
  if (typeof t === "string") return t
  if (t && typeof t === "object" && "absolute" in t && t.absolute) return t.absolute
  throw new Error("no absolute title")
}

/** Every page of the apex sitemap, with the metadata its route returns. */
function sitemapPages(): [string, Metadata][] {
  const videos = loadVideoCatalog()
  return [
    ["/", landingMetadata(BASE)],
    ...PUBLIC_PAGES.map((p): [string, Metadata] => [p.path, publicPageMetadata(p.path, BASE)]),
    ...readDocUnits().map((u): [string, Metadata] => [`/doc/${u.slug}`, docUnitMetadata(u, BASE)]),
    ["/videos", videoLibraryMetadata(videos, ctx)],
    ...filterPublishedVideos(videos, true).map((v): [string, Metadata] => [`/videos/${v.id}`, videoDetailMetadata(v, ctx)]),
  ]
}

describe("auditedLength", () => {
  it("counts the escaped attribute in UTF-8 bytes, as SEO audit tools do", () => {
    expect(auditedLength("abc")).toBe(3)
    expect(auditedLength("é")).toBe(2)
    expect(auditedLength("’")).toBe(3)
    expect(auditedLength("'")).toBe(6) // &#x27;
    expect(auditedLength(`a & "b" <c>`)).toBe("a &amp; &quot;b&quot; &lt;c&gt;".length)
  })

  it("reports the home description of 160 characters that AIOSEO measured at 171", () => {
    const old = "Organisez vos bénévoles par postes et créneaux. Ils s'inscrivent depuis leur téléphone, sans créer de compte. Rappels automatiques, feuilles du jour J. Gratuit."
    expect(old.length).toBe(160)
    expect(auditedLength(old)).toBe(171)
    expect(metaLengthProblems("Titre", old)).toEqual([expect.stringMatching(/171 as audited/)])
  })

  it("flags a title over 65 characters and a description under 70", () => {
    expect(metaLengthProblems("x".repeat(66), "Trop court.")).toHaveLength(2)
    expect(metaLengthProblems("x".repeat(65), "x".repeat(70))).toEqual([])
  })
})

describe("public pages: title and description lengths", () => {
  const pages = sitemapPages()

  it("covers the home, every public page, every documentation unit and every published video", () => {
    const paths = pages.map(([p]) => p)
    expect(paths).toContain("/")
    expect(paths).toContain("/fonctionnalites")
    expect(paths).toContain("/doc/lien-personnel")
    expect(paths).toContain("/videos/ORG_TEAM_PERMISSIONS")
    expect(new Set(paths).size).toBe(paths.length)
  })

  it("keeps every title within 65 characters and every description within 70 to 160, as audited too", () => {
    const problems = pages.flatMap(([path, m]) => {
      expect(typeof m.description, path).toBe("string")
      return metaLengthProblems(titleOf(m), m.description as string).map((p) => `${path}: ${p}`)
    })
    expect(problems).toEqual([])
  })

  it("keeps the video library description within limits whatever the count", () => {
    for (const n of [0, 1, 2, 99, 999]) expect(metaLengthProblems("t", videoLibraryDescription(n)), String(n)).toEqual([])
  })
})

describe("videoPageTitle", () => {
  it("takes the longest site suffix that fits in 65 characters", () => {
    expect(videoPageTitle({ title: "Créer une série de créneaux" })).toBe("Créer une série de créneaux | Tutoriel vidéo benevol.app")
    expect(videoPageTitle({ title: "x".repeat(45) })).toBe(`${"x".repeat(45)} | Vidéo benevol.app`)
    expect(videoPageTitle({ title: "x".repeat(51) })).toBe(`${"x".repeat(51)} | benevol.app`)
    expect(videoPageTitle({ title: "x".repeat(60) })).toBe("x".repeat(60))
    // A title too long on its own (spoken in the video) gives way to the short feature name.
    expect(videoPageTitle({ title: "Reconnaître l'engagement, avec des heures et une attestation fiables", feature: "Heures de bénévolat et attestation" })).toBe("Heures de bénévolat et attestation | Tutoriel vidéo benevol.app")
  })
})
