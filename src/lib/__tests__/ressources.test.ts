import { describe, it, expect } from "vitest"
import path from "node:path"
import { findRessource, latestUpdate, parseRessource, readRessources, ressourcePath, ressourcesProblems, sortRessources } from "../ressources"
import { isServerNotFound } from "../server-not-found"

// The practical guides (#1258): one Markdown file per guide in content/ressources/, at /ressources/<slug>.

const front = (over: Record<string, string> = {}) => {
  const data = {
    title: "Un bénévole se désiste la veille : que faire ?",
    summary: "Trois questions à se poser avant de chercher un remplaçant, et ce qu'on prépare avant l'événement pour ne pas paniquer.",
    updated: "2026-11-06",
    order: "1",
    ...over,
  }
  return `---\n${Object.entries(data).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\nLe texte.\n\n## Une section\n\nSuite.\n`
}

describe("parseRessource", () => {
  it("reads the slug from the file name and the fields from the front matter", () => {
    const g = parseRessource("benevole-se-desiste-la-veille.md", front())
    expect(g).toMatchObject({ slug: "benevole-se-desiste-la-veille", updated: "2026-11-06", order: 1, source: "content/ressources/benevole-se-desiste-la-veille.md" })
    expect(g.body.startsWith("Le texte.")).toBe(true)
    expect(ressourcePath(g)).toBe("/ressources/benevole-se-desiste-la-veille")
  })

  it("refuses a bad file name, a missing date, a bad order, an em dash and a « # » title", () => {
    expect(() => parseRessource("Mauvais Nom.md", front())).toThrow(/file name/)
    expect(() => parseRessource("a.md", front({ updated: "2026-02-30" }))).toThrow(/updated/)
    expect(() => parseRessource("a.md", front({ order: "0" }))).toThrow(/order/)
    expect(() => parseRessource("a.md", front({ title: "Avant — après" }))).toThrow(/em dash/)
    expect(() => parseRessource("a.md", front().replace("Le texte.", "# Titre"))).toThrow(/title in the body/)
    expect(() => parseRessource("a.md", front({ summary: "Trop court." }))).toThrow(/summary/)
  })
})

describe("a set of guides", () => {
  const a = parseRessource("a.md", front({ order: "2", updated: "2026-10-01" }))
  const b = parseRessource("b.md", front({ order: "1", title: "Autre", summary: "Un autre résumé assez long pour passer la règle des soixante-dix caractères minimum." }))

  it("sorts most useful first and finds a guide by slug", () => {
    expect(sortRessources([a, b]).map((g) => g.slug)).toEqual(["b", "a"])
    expect(findRessource("a", [a, b])?.slug).toBe("a")
    expect(findRessource("absent", [a, b])).toBeNull()
  })

  it("reports a title, a summary or an order used twice", () => {
    expect(ressourcesProblems([a, b])).toEqual([])
    const twin = { ...a, slug: "c", source: "content/ressources/c.md" }
    expect(ressourcesProblems([a, twin]).join("\n")).toMatch(/same title.*\n.*same summary.*\n.*same order/)
  })

  it("gives the date of the most recently checked guide", () => {
    expect(latestUpdate([a, b])).toBe("2026-11-06")
    expect(latestUpdate([])).toBeNull()
  })
})

describe("the guides of the repository", () => {
  it("all parse, with distinct slugs, titles, summaries and orders", () => {
    const guides = readRessources(path.join(process.cwd(), "content/ressources"))
    expect(guides.length).toBeGreaterThan(0)
    for (const g of guides) expect(g.body).not.toMatch(/^# /m)
  })
})

describe("server 404 for /ressources/<slug>", () => {
  const lookups = { hasOrg: false, docSlugExists: () => true, videoExists: () => true, blogPostExists: () => true, ressourceExists: (s: string) => s === "benevole-se-desiste-la-veille" }
  it("answers 404 for an unknown guide, never for the index or a known guide", () => {
    expect(isServerNotFound("/ressources/inconnu", lookups)).toBe(true)
    expect(isServerNotFound("/ressources/benevole-se-desiste-la-veille", lookups)).toBe(false)
    expect(isServerNotFound("/ressources", lookups)).toBe(false)
  })
})
